const db = require("../config/db");

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
};
const getDateRange = (req) => {
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10);
  if (!req.query.start_date && !req.query.end_date) return {startDate: `${today.slice(0,7)}-01`,endDate:today};
  const {start_date:startDate,end_date:endDate}=req.query;
  if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) return null;
  return { startDate, endDate };
};

// Each visit may contain services separated by pipes. Parse them as individual
// procedure names without changing how the visit or its payments are stored.
// JSON_QUOTE safely escapes custom user-entered service names for JSON_TABLE.
const servicesFromVisit = (alias = "v") => `
  JSON_TABLE(
    CONCAT('[', REPLACE(JSON_QUOTE(COALESCE(${alias}.procedure_name, '')), '|', '\",\"'), ']'),
    '$[*]' COLUMNS (service VARCHAR(255) PATH '$')
  ) AS service_tokens
`;
const matchingService = (alias = "v") => `EXISTS (
  SELECT 1 FROM ${servicesFromVisit(alias)}
  WHERE LOWER(TRIM(service_tokens.service)) = LOWER(TRIM(?))
)`;

/* |||| ADMIN - AUTOMATIC REPORT All values are calculated directly from the database. |||| */
exports.getReports = async (req, res) => {
  const range = getDateRange(req);
  if (!range) return res.status(400).json({message:"Enter a valid report date range."});
  const { startDate, endDate } = range;
  const group = req.query.group === "day" ? "day" : "month";
  const procedure = "";

  const visitWhere = `
        v.visit_date BETWEEN ? AND ?
        ${procedure ? `AND ${matchingService("v")}` : ""}
    `;

  const visitParams = procedure
    ? [startDate, endDate, procedure]
    : [startDate, endDate];

  const summarySql = `SELECT
    (SELECT COUNT(*) FROM patients) AS totalPatients,
    COUNT(*) AS totalVisits,
    COALESCE(SUM(v.amount_paid),0) AS totalRevenue,
    COALESCE(SUM(v.balance),0) AS outstandingBalance
    FROM visits v WHERE ${visitWhere}`;

  const detailSql = `
        SELECT
            v.id,
            v.visit_date,
            v.visit_time,
            v.patient_id,
            COALESCE(p.name, 'Unknown Patient') AS patient,
            v.procedure_name AS procedure_name,
            v.amount_paid,
            v.balance,
            v.complain,
            v.description
        FROM visits v
        LEFT JOIN patients p ON p.id = v.patient_id
        WHERE ${visitWhere}
        ORDER BY v.visit_date DESC, v.visit_time DESC, v.id DESC
        LIMIT 200
    `;

  // One count per service per visit, not one category per combined string.
  // When filtering by a service, only that selected service is charted.
  const procedureSql = `
    SELECT item.name, COUNT(*) AS value
    FROM (
      SELECT DISTINCT v.id, TRIM(service_tokens.service) AS name
      FROM visits v
      CROSS JOIN ${servicesFromVisit("v")}
      WHERE ${visitWhere}
        AND TRIM(service_tokens.service) <> ''
        ${procedure ? "AND LOWER(TRIM(service_tokens.service)) = LOWER(TRIM(?))" : ""}
    ) item
    GROUP BY item.name
    ORDER BY value DESC, item.name ASC
    LIMIT 20
  `;
  const procedureParams = procedure ? [...visitParams, procedure] : visitParams;

  const trendSql =
    group === "day"
      ? `
            SELECT
                DATE_FORMAT(MIN(v.visit_date), '%b %d') AS name,
                COALESCE(SUM(v.amount_paid), 0) AS value
            FROM visits v
            WHERE ${visitWhere}
            GROUP BY DATE(v.visit_date)
            ORDER BY DATE(v.visit_date) ASC
        `
      : `
            SELECT
                DATE_FORMAT(MIN(v.visit_date), '%b %Y') AS name,
                COALESCE(SUM(v.amount_paid), 0) AS value
            FROM visits v
            WHERE ${visitWhere}
            GROUP BY YEAR(v.visit_date), MONTH(v.visit_date)
            ORDER BY YEAR(v.visit_date), MONTH(v.visit_date)
        `;

  const params = visitParams;

  try {
    const client = db.promise();
    const [[summaryResult],[procedureResult],[trendResult],[detailResult]] = await Promise.all([
      client.query(summarySql,params),client.query(procedureSql,procedureParams),
      client.query(trendSql,params),client.query(detailSql,params),
    ]);
    const summary = summaryResult[0];
    res.json({ filters:{startDate,endDate,group,procedure:procedure || "All Procedures"},
      summary: Object.fromEntries(Object.entries(summary).map(([key,value])=>[key,Number(value || 0)])),
      revenue:trendResult.map(row=>({...row,value:Number(row.value || 0)})),
      procedures:procedureResult.map(row=>({...row,value:Number(row.value || 0)})),
      details:detailResult.map(row=>({...row,amount_paid:Number(row.amount_paid || 0),balance:Number(row.balance || 0)})),
      detailLimit:200, detailsTruncated:Number(summary.totalVisits)>detailResult.length,
    });
  } catch (error) {
    console.error("Report generation failed:",error.code || error.name);
    res.status(500).json({message:"Unable to generate report."});
  }
};

// Export every matching visit through a stream instead of the 200-row screen preview.
exports.exportReports = (req,res) => {
  const range=getDateRange(req);
  if (!range) return res.status(400).json({message:"Enter a valid report date range."});
  const procedure="";
  const {Transform,pipeline}=require("node:stream");
  const params=[range.startDate,range.endDate];
  if(procedure) params.push(procedure);
  const query=db.query(`SELECT v.visit_date,v.visit_time,p.name AS patient,v.procedure_name,
    v.amount_paid,v.balance,v.complain,v.description FROM visits v LEFT JOIN patients p ON p.id=v.patient_id
    WHERE v.visit_date BETWEEN ? AND ? ${procedure ? `AND ${matchingService("v")}` : ""}
    ORDER BY v.visit_date DESC,v.visit_time DESC,v.id DESC`,params);
  const stream=query.stream({highWaterMark:100});
  const keys=["visit_date","visit_time","patient","procedure_name","amount_paid","balance","complain","description"];
  const csvCell=(value)=>{
    let text=String(value ?? "");
    // Prevent spreadsheet formula injection from patient-entered text.
    if (/^[\s]*[=+@-]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  const transform=new Transform({writableObjectMode:true,transform(row,encoding,callback){
    callback(null,keys.map(key=>csvCell(row[key])).join(",")+"\r\n");
  }});
  res.type("text/csv");res.set("Content-Disposition",`attachment; filename="magno-dental-report-${range.startDate}-to-${range.endDate}.csv"`);
  res.write("Date,Time,Patient,Procedure,Amount Paid,Balance,Complaint,Description\r\n");
  pipeline(stream,transform,res,error=>{if(error) console.error("Report export interrupted:",error.code || error.name);});
};

/* |||| ADMIN - AVAILABLE PROCEDURES |||| */
exports.getReportProcedures = (req, res) => {
  const sql = `
    SELECT DISTINCT TRIM(service_tokens.service) AS name
    FROM visits v
    CROSS JOIN ${servicesFromVisit("v")}
    WHERE TRIM(service_tokens.service) <> ''
    ORDER BY name ASC
  `;

  db.query(sql, (err, result) => {
    if (err) {
      console.error("Report procedures error:", err);
      return res.status(500).json({ message: "Unable to load procedures." });
    }

    res.json(result);
  });
};

// Search and page *only* the Detailed Report table; charts remain unchanged.
exports.getReportDetails = async (req, res) => {
  const range = getDateRange(req);
  if (!range) return res.status(400).json({ message: "Enter a valid report date range." });
  const page = Math.max(1, Math.min(1000000, parseInt(req.query.page, 10) || 1));
  const pageSize = 50;
  const search = String(req.query.search || "").trim().slice(0, 120);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const conditions = [`v.visit_date BETWEEN ? AND ?`];
  const params = [range.startDate, range.endDate];
  if (search) {
    conditions.push(`(p.name LIKE ? OR v.procedure_name LIKE ? OR DATE_FORMAT(v.visit_date, '%Y-%m-%d') LIKE ? OR v.complain LIKE ?)`);
    params.push(pattern, pattern, pattern, pattern);
  }
  const where = conditions.join(" AND ");
  try {
    const client = db.promise();
    const [countRows] = await client.query(`SELECT COUNT(*) AS total FROM visits v LEFT JOIN patients p ON p.id = v.patient_id WHERE ${where}`, params);
    const total = Number(countRows[0].total || 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * pageSize;
    const [details] = await client.query(`SELECT v.id, v.visit_date, v.visit_time, COALESCE(p.name, 'Unknown Patient') AS patient, v.procedure_name, v.amount_paid, v.balance FROM visits v LEFT JOIN patients p ON p.id = v.patient_id WHERE ${where} ORDER BY v.visit_date DESC, v.visit_time DESC, v.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
    res.json({ details, total, pages, page: safePage, pageSize });
  } catch (error) {
    console.error("Report table search failed:", error.code || error.name);
    res.status(500).json({ message: "Unable to load detailed report records." });
  }
};
