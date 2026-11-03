import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaDownload, FaFilter, FaSyncAlt } from "react-icons/fa";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";
import api from "../../api";
import { useAutoRefresh } from "../../utils/useAutoRefresh";
import "../../css/Report.css";
import { formatDateOnly } from "../../utils/dateUtils";
const formatReportDate = value => formatDateOnly(value);
const COLORS = ["#4f86c6", "#5b9e8a", "#3d6f9f", "#6d9f95", "#789fc1", "#4a8877", "#8bb4d5", "#88b9aa"];
const pad = number => String(number).padStart(2, "0");
const formatDate = date => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const getPresetRange = preset => {
  const today = new Date();
  const end = new Date(today);
  let start = new Date(today);
  if (preset === "all") {
    start = new Date(2000, 0, 1);
  } else if (preset === "week") {
    start.setDate(today.getDate() - 6);
  } else if (preset === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === "year") {
    start = new Date(today.getFullYear(), 0, 1);
  }
  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  };
};
// Show monthly points for broad custom ranges, daily for short periods.
const groupForRange = (start, end) => {
  if (!start || !end) return "month";
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  return days > 62 ? "month" : "day";
};
const currency = value => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP"
}).format(Number(value || 0));
const dateDisplay = value => {
  return formatReportDate(value);
};
function Report() {
  const defaultRange = getPresetRange("all");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [preset, setPreset] = useState("all");
  const [group, setGroup] = useState("month");
  const [tableSearch, setTableSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [tableData, setTableData] = useState({ details: [], total: 0, pages: 1 });
  const [tableLoading, setTableLoading] = useState(true);
  const tableRequestSequence = useRef(0);
  const [report, setReport] = useState({
    summary: {
      totalPatients: 0,
      totalVisits: 0,
      totalRevenue: 0,
      outstandingBalance: 0
    },
    revenue: [],
    procedures: [],
    details: []
  });
  const [loading, setLoading] = useState(true);
  // Only the latest report request can change the screen.
  const requestSequence = useRef(0);
  const mounted = useRef(true);
  const loadReport = async ({ background = false } = {}) => {
    if (!startDate || !endDate || startDate > endDate) return;
    const requestId = ++requestSequence.current;
    try {
      if (!background) setLoading(true);
      const response = await api.get("/reports", {
        params: { start_date: startDate, end_date: endDate, group }
      });
      // A slower response for an older filter must never replace newer data.
      if (mounted.current && requestId === requestSequence.current) {
        setReport(response.data);
      }
    } catch (err) {
      if (mounted.current && requestId === requestSequence.current) {
        console.error("Reports error:", err);
        if (!background && !err?.nativeAlertHandled) {
          window.alert(err.response?.data?.message || "Unable to load the automatic report.");
        }
      }
    } finally {
      if (mounted.current && requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
    };
  }, []);
  useEffect(() => {
    loadReport();
    /* Filters intentionally trigger a fresh database report. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, group]);
  useAutoRefresh(loadReport);
  const applyPreset = value => {
    setPreset(value);
    if (value === "custom") return;
    const range = getPresetRange(value);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    if (value === "week") {
      setGroup("day");
    } else if (value === "month") {
      setGroup("day");
    } else {
      setGroup("month");
    }
  };
  // Detailed records have their own search and pagination. These requests
  // never mutate report summaries or charts.
  useEffect(() => {
    if (!startDate || !endDate || startDate > endDate) return;
    const requestId = ++tableRequestSequence.current;
    setTableLoading(true);
    api.get("/reports/details", {
      params: { start_date: startDate, end_date: endDate, search: appliedSearch, page: tablePage }
    }).then(response => {
      if (requestId === tableRequestSequence.current) setTableData(response.data);
    }).catch(error => {
      if (requestId === tableRequestSequence.current) {
        console.error("Report table error:", error);
        setTableData({ details: [], total: 0, pages: 1 });
      }
    }).finally(() => {
      if (requestId === tableRequestSequence.current) setTableLoading(false);
    });
    return () => { tableRequestSequence.current += 1; };
  }, [startDate, endDate, appliedSearch, tablePage]);
  const applyTableSearch = event => {
    event.preventDefault();
    setTablePage(1);
    setAppliedSearch(tableSearch.trim());
  };
  useEffect(() => { setTablePage(1); }, [startDate, endDate]);
  const exportReport = async () => {
    try {
      const response = await api.get("/reports/export", {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
        responseType: "blob",
        timeout: 60000
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `magno-dental-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Report export failed:", error);
      if (!error?.nativeAlertHandled) window.alert("Unable to export the report. Please try again.");
    }
  };
  const procedureTotal = useMemo(() => {
    return report.procedures.reduce((total, item) => total + Number(item.value || 0), 0);
  }, [report.procedures]);
  return <div className="reports">
      {/* HEADER */}
      <div className="reports-header">
        <div>
          <h1>Reports</h1>
          <p>
            Automatic clinic performance reports generated from your database.
          </p>
        </div>

        <div className="reports-header-actions">
          <button className="report-refresh-btn" onClick={loadReport} disabled={loading}>
            <FaSyncAlt className={loading ? "spin" : ""} />
            Refresh
          </button>

          <button className="export-btn" onClick={exportReport} disabled={loading || report.summary.totalVisits === 0}>
            <FaDownload />
            Export CSV
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="reports-filters">
        <div className="report-filter-group">
          <label>Period</label>
          <select value={preset} onChange={event => applyPreset(event.target.value)}>
            <option value="all">All Time</option>
            <option value="week">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={event => {
          setPreset("custom");
          setStartDate(event.target.value);
          setGroup(groupForRange(event.target.value, endDate));
        }} />
        </div>

        <div className="report-filter-group">
          <label>End Date</label>
          <input type="date" value={endDate} onChange={event => {
          setPreset("custom");
          setEndDate(event.target.value);
          setGroup(groupForRange(startDate, event.target.value));
        }} />
        </div>

        <button className="filter-btn" onClick={loadReport} title="Apply filters">
          <FaFilter />
          Apply
        </button>
      </div>

      {/* STATS */}
      <div className="reports-stats">
        <div className="reports-card blue">
          <h4>TOTAL PATIENTS</h4>
          <h2>
            {loading ? "—" : report.summary.totalPatients.toLocaleString()}
          </h2>
          <span>Registered in the system</span>
        </div>

        <div className="reports-card green">
          <h4>VISITS</h4>
          <h2>{loading ? "—" : report.summary.totalVisits.toLocaleString()}</h2>
          <span>Within selected period</span>
        </div>

        <div className="reports-card revenue">
          <h4>TOTAL REVENUE</h4>
          <h2>{loading ? "—" : currency(report.summary.totalRevenue)}</h2>
          <span>Payments recorded</span>
        </div>

        <div className="reports-card balance">
          <h4>OUTSTANDING BALANCE</h4>
          <h2>{loading ? "—" : currency(report.summary.outstandingBalance)}</h2>
          <span>Remaining patient balances</span>
        </div>
      </div>

      {/* CHARTS */}
      <div className="reports-charts">
        <div className="card report-chart-card">
          <div className="reports-card-heading">
            <div>
              <h3>Revenue Overview</h3>
              <p>
                {dateDisplay(startDate)} — {dateDisplay(endDate)}
              </p>
            </div>
          </div>

          {loading || report.revenue.length === 0 ? <div className="report-no-data">
              {loading ? "Loading report data..." : "No revenue data for the selected period."}
            </div> : <ResponsiveContainer width="100%" height={280}>
              <LineChart data={report.revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe6ed" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={value => [currency(value), "Revenue"]} />
                <Line type="monotone" dataKey="value" stroke="#4f86c6" strokeWidth={3} dot={{
              r: 4,
              fill: "#4f86c6"
            }} activeDot={{
              r: 6
            }} />
              </LineChart>
            </ResponsiveContainer>}
        </div>

        <div className="card report-chart-card">
          <div className="reports-card-heading">
            <div>
              <h3>Procedure Distribution</h3>
              <p>{loading ? "Updating..." : `${procedureTotal} service occurrences across matching visits`}</p>
            </div>
          </div>

          {loading || report.procedures.length === 0 ? <div className="report-no-data">
              {loading ? "Loading report data..." : "No procedure data for the selected period."}
            </div> : <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={report.procedures} dataKey="value" nameKey="name" outerRadius={88} innerRadius={42} paddingAngle={2}>
                  {report.procedures.map((entry, index) => <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>}
        </div>
      </div>

      {/* TABLE */}
      <div className="card report-detail-card">
        <div className="reports-card-heading">
          <div>
            <h3>Detailed Report</h3>
            <p>Actual visit and payment records from the database.</p>
          </div>

          <span className="report-record-count">
            {tableLoading ? "Searching..." : `${tableData.total} records`}
          </span>
        </div>

        <form className="report-table-search" onSubmit={applyTableSearch}>
          <input
            type="search"
            aria-label="Search detailed report records"
            placeholder="Search patient, procedure, date..."
            value={tableSearch}
            onChange={event => setTableSearch(event.target.value)}
          />
          <button className="filter-btn" type="submit"><FaFilter /> Search records</button>
          {appliedSearch && <button className="report-table-clear" type="button" onClick={() => { setTableSearch(""); setAppliedSearch(""); setTablePage(1); }}>Clear</button>}
        </form>
        <div className="report-table-wrapper">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Patient</th>
                <th>Procedure</th>
                <th>Amount Paid</th>
                <th>Balance</th>
              </tr>
            </thead>

            <tbody>
              {tableLoading ? <tr>
                  <td colSpan="6" className="report-empty">
                    Loading report data...
                  </td>
                </tr> : tableData.details.length === 0 ? <tr>
                  <td colSpan="6" className="report-empty">
                    No visit records match this table search and date range.
                  </td>
                </tr> : tableData.details.map(row => <tr key={row.id}>
                    <td>{dateDisplay(row.visit_date)}</td>
                    <td>{row.visit_time || "—"}</td>
                    <td className="patient-name-cell">{row.patient}</td>
                    <td>{row.procedure_name || "—"}</td>
                    <td className="amount-cell">{currency(row.amount_paid)}</td>
                    <td className={Number(row.balance) > 0 ? "balance-cell" : "amount-cell"}>
                      {currency(row.balance)}
                    </td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        <div className="report-table-pagination">
          <span>Page {tablePage} of {tableData.pages || 1}</span>
          <button type="button" disabled={tableLoading || tablePage <= 1} onClick={() => setTablePage(page => page - 1)}>Previous</button>
          <button type="button" disabled={tableLoading || tablePage >= tableData.pages} onClick={() => setTablePage(page => page + 1)}>Next</button>
        </div>
      </div>
    </div>;
}
export default Report;
