const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const schedule = require('../services/appointmentSchedule');
const root = path.resolve(__dirname, '..', '..');
const date = '2099-10-15';
const booking = overrides => ({ patient_id: 4, preferred_date: date, preferred_time: '10:00', service: 'Dental Check-up', ...overrides });
const res = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function connection(slots = [], opts = {}) {
  const calls = [];
  return { calls, async execute(sql, args) {
    calls.push({ sql, args });
    if (sql.includes('GET_LOCK')) return [[{ acquired: opts.locked === false ? 0 : 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql.includes('SELECT id, name, phone FROM patients')) return [opts.noPatient ? [] : [{ id: 4, name: 'Juan Dela Cruz', phone: '09175551234' }]];
    if (sql.includes('SELECT preferred_time FROM appointments')) return [slots.map(preferred_time => ({ preferred_time }))];
    if (sql.includes('SELECT * FROM appointments')) return [[{ id: 9, patient_id: 4, status: 'Pending', preferred_date: date, preferred_time: '10:00' }]];
    return [{ insertId: 12 }];
  }, async beginTransaction() { calls.push({ sql: 'BEGIN' }); }, async rollback() { calls.push({ sql: 'ROLLBACK' }); },
    async commit() { calls.push({ sql: 'COMMIT' }); }, release() { calls.push({ sql: 'RELEASE' }); }, destroy() { calls.push({ sql: 'DESTROY' }); } };
}
function createController(c) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, 'back-end/controllers/appointmentController.js'), 'utf8');
  vm.runInNewContext(source, { module, exports: module.exports, console,
    require: key => ({ '../config/db': { promise: () => ({ getConnection: async () => c, execute: async()=> [[]] }) }, '../services/appointmentSchedule': schedule })[key] });
  return module.exports;
}
test('manual creation uses a linked registered patient and inserts Approved inside a transaction', async () => {
  const c = connection(); const result = res();
  await createController(c).createManualAppointment({ body: booking() }, result);
  assert.equal(result.code, 201);
  const write = c.calls.find(call => call.sql.includes('INSERT INTO appointments'));
  assert.ok(write, 'insert was not performed');
  assert.match(write.sql, /'Approved'/);
  assert.deepEqual(Array.from(write.args), [4, 'Juan Dela Cruz', '', '09175551234', date, '10:00', 'Dental Check-up', null]);
  assert.equal(c.calls.some(call => call.sql === 'COMMIT'), true);
  assert.equal(c.calls.at(-1).sql, 'RELEASE');
  assert.ok(!c.calls.some(call => /notifications|email_outbox/.test(call.sql)));
});
test('unknown patients and conflicts never insert or commit', async () => {
  for (const opts of [{ noPatient: true }, {}]) {
    const c = connection(opts.noPatient ? [] : ['10:00:00'], opts); const result = res();
    await createController(c).createManualAppointment({ body: booking() }, result);
    assert.equal(result.code, opts.noPatient ? 404 : 409);
    assert.ok(!c.calls.some(call => call.sql.includes('INSERT INTO appointments') || call.sql === 'COMMIT'));
    assert.ok(c.calls.some(call => call.sql === 'ROLLBACK'));
  }
});
test('invalid patient, Sunday, bad time, malformed email and missing service fail before DB connection', async () => {
  for (const item of [booking({ patient_id: 0 }), booking({ patient_id: 'no' }), booking({ preferred_date: '2099-10-18' }),
    booking({ preferred_time: '09:59' }), booking({ email: 'not-an-email' }), booking({ service: '' })]) {
    const c = connection(); const result = res();
    await createController(c).createManualAppointment({ body: item }, result);
    assert.equal(result.code, 400);
    assert.equal(c.calls.length, 0);
  }
});
test('schedule lock timeout is fail closed', async () => {
  const c = connection([], { locked: false }); const result = res();
  await createController(c).createManualAppointment({ body: booking() }, result);
  assert.equal(result.code, 503);
  assert.equal(c.calls.some(call => call.sql === 'BEGIN'), false);
});
test('admin-only appointment route is authenticated; public and patient booking paths do not exist', () => {
  const source = fs.readFileSync(path.join(root, 'back-end/routes/appointmentRoutes.js'),'utf8');
  assert.match(source, /router\.post\("\/appointments", auth, controller\.createManualAppointment\)/);
  assert.doesNotMatch(source, /"\/appointment"|"\/patient\/appointment"|bookingLimit|patientBookingLimit/);
  const ui = fs.readFileSync(path.join(root, 'front-end/src/main.jsx'),'utf8');
  assert.doesNotMatch(ui, /BookAppointment|PatientLayout|RoleRoute|pages\/patient|\/Reviews/);
  assert.match(ui, /Navigate to="\/login"/);
});
test('appointment date rules and 1-hour conflict buffer remain', async () => {
  assert.equal(schedule.validateSchedule(date, '10:00'), null);
  assert.match(schedule.validateSchedule('2099-10-18','10:00'), /Monday to Saturday/);
  assert.equal(await schedule.checkApprovedConflict(connection(['10:00:00']), date, '10:30'), schedule.OVERLAP_WARNING);
  assert.equal(await schedule.checkApprovedConflict(connection(['10:00:00']), date, '10:00'), schedule.DUPLICATE_WARNING);
});
