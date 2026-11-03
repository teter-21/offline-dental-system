const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function code(rel, dependencies) {
  const p = path.join(__dirname, '..', rel);
  const m = { exports: {} };
  vm.runInNewContext(fs.readFileSync(p, 'utf8'), {
    module: m, exports: m.exports, console: { error() {} }, Buffer,
    require: name => {
      if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return m.exports;
}
const response = () => ({ code: 200, status(status) { this.code = status; return this; }, json(body) { this.body = body; return this; } });
test('login allows administrators and refuses patient accounts without issuing JWTs', async () => {
  let sessions = 0;
  let currentRole = 'patient';
  const auth = code('controllers/authController.js', {
    '../config/db': { query(_sql, _params, cb) { cb(null, [{ id: 10, password: 'hashed', role: currentRole }]); } },
    bcrypt: { compare: async () => true },
    '../services/sessionSecurity': { issueSession: async () => { sessions++; return 'jwt'; } },
    '../services/passwordPolicy': { passwordError: () => null },
  });
  const req = { body: { email: 'someone@example.com', password: 'LongPassphrase123!' }, recordLoginFailure() {}, clearLoginFailures() {} };
  const patientResponse = response();
  await new Promise(resolve => { const send = patientResponse.json.bind(patientResponse); patientResponse.json = data => { send(data); resolve(); }; auth.login(req, patientResponse); });
  assert.equal(patientResponse.code, 401);
  assert.equal(sessions, 0);
  currentRole = 'admin';
  const adminResponse = response();
  await new Promise(resolve => { const send = adminResponse.json.bind(adminResponse); adminResponse.json = data => { send(data); resolve(); }; auth.login(req, adminResponse); });
  assert.equal(adminResponse.code, 200);
  assert.equal(adminResponse.body.token, 'jwt');
  assert.equal(sessions, 1);
  assert.equal('role' in adminResponse.body, false);
});
test('authentication middleware enforces admin-only database sessions', async () => {
  let verifiedSQL;
  const middleware = code('middleware/authMiddleware.js', {
    '../config/db': { promise: () => ({ execute: async sql => { verifiedSQL = sql; return [[{ id: 8, password: 'hash' }]]; } }) },
    '../services/sessionSecurity': { verifySessionToken: () => ({ id: 8, jti: 'jti', credential: 'proof' }), hashSession: () => 'hash', credentialsMatch: () => true },
  });
  const req = { headers: { authorization: 'Bearer token' }, path: '/patients' }; const result = response();
  let permitted = false;
  await middleware(req, result, () => { permitted = true; });
  assert.equal(permitted, true);
  assert.match(verifiedSQL, /u\.role = 'admin'/);
  assert.deepEqual(Object.keys(req.user), ['id']);
  const missing = response();
  await middleware({ headers: {}, path: '/patients' }, missing, () => assert.fail('anonymous allowed'));
  assert.equal(missing.code, 401);
});
test('email password recovery routes are disabled for local-only mode', () => {
  const source = fs.readFileSync(path.join(__dirname, '../routes/authRoutes.js'), 'utf8');
  assert.doesNotMatch(source, /forgot-password|verify-reset-token|reset-password/);
});
