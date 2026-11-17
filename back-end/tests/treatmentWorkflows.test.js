"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadController(db) {
  const file = path.join(__dirname, "../controllers/visitController.js");
  const sandbox = { module: { exports: {} }, console: { error() {} },
    require(name) {
      assert.equal(name, "../config/sqlite");
      return { getSQLite: () => db };
    } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  return sandbox.module.exports;
}

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; } });

function fixture() {
  const visits = new Map();
  const payments = [{ visit_id: 1, amount: 30 }];
  const db = {
    transaction(callback) { return { immediate: callback }; },
    prepare(sql) {
      return {
        get(...args) {
          if (sql.includes("SELECT id FROM patients")) return Number(args[0]) === 7 ? { id: 7 } : undefined;
          if (sql.includes("SELECT id FROM visits WHERE id")) return visits.has(args[0]) ? { id: args[0] } : undefined;
          if (sql.includes("SUM(amount)")) return { total: payments.filter(p => p.visit_id === args[0]).reduce((sum, p) => sum + p.amount, 0) };
          if (sql.includes("SELECT id, patient_id, visit_date")) return visits.get(args[0]);
          return undefined;
        },
        run(...args) {
          if (sql.includes("INSERT INTO visits")) {
            const id = visits.size + 1;
            visits.set(id, { id, patient_id: args[0], visit_date: args[1], visit_time: args[2],
              procedure_name: args[3], complain: args[4], description: args[5],
              amount_paid: args[6], balance: args[7] });
            return { lastInsertRowid: id };
          }
          if (sql.includes("UPDATE visits SET")) {
            const visit = visits.get(args[7]);
            Object.assign(visit, { visit_date: args[0], visit_time: args[1], procedure_name: args[2],
              complain: args[3], description: args[4], amount_paid: args[5], balance: args[6] });
            return { changes: 1 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        all(...args) {
          if (sql.includes("FROM visits WHERE patient_id")) return [...visits.values()].filter(v => v.patient_id === args[0]);
          if (sql.includes("JOIN patients AS p")) return [...visits.values()].filter(v => v.visit_date >= args[0] && v.visit_date <= args[1]).map(v => ({ ...v, patient_name: "Santos, Ana" }));
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      };
    },
  };
  return { db, visits, payments, controller: loadController(db) };
}

const visit = (overrides = {}) => ({ patient_id: 7, visit_date: "2026-10-10", visit_time: "09:30",
  procedure_name: "Cleaning | Filling", complain: "Toothache", description: "Two services", amount_paid: 120,
  balance: 80, ...overrides });

test("patient-linked visit can be created and appears in history and calendar", () => {
  const { controller } = fixture();
  const created = response();
  controller.addVisit({ body: visit() }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.visitId, 1);
  const history = response();
  controller.getVisits({ params: { patient_id: "7" } }, history);
  assert.equal(history.body[0].procedure_name, "Cleaning | Filling");
  const calendar = response();
  controller.getTreatmentCalendar({ query: { start_date: "2026-10-01", end_date: "2026-10-31" } }, calendar);
  assert.equal(calendar.body.length, 1);
  assert.equal(calendar.body[0].patient_name, "Santos, Ana");
  assert.equal(calendar.body[0].visit_date, "2026-10-10");
});

test("editing treatment and billing updates the same record without removing payments", () => {
  const { controller, visits, payments } = fixture();
  controller.addVisit({ body: visit() }, response());
  const edited = response();
  controller.updateVisit({ params: { visit_id: "1" }, body: visit({ procedure_name: "Extraction", amount_paid: 35, balance: 165 }) }, edited);
  assert.equal(edited.statusCode, 200);
  assert.equal(edited.body.visit.id, 1);
  assert.equal(visits.get(1).procedure_name, "Extraction");
  assert.equal(visits.get(1).amount_paid, 35);
  assert.equal(payments[0].amount, 30);
  assert.equal(visits.size, 1);
});

test("prevents lowering paid below previously recorded payments", () => {
  const { controller, visits } = fixture();
  controller.addVisit({ body: visit() }, response());
  const edited = response();
  controller.updateVisit({ params: { visit_id: "1" }, body: visit({ amount_paid: 20 }) }, edited);
  assert.equal(edited.statusCode, 409);
  assert.equal(visits.get(1).amount_paid, 120);
});

test("invalid date, unregistered patient and negative amounts are rejected", () => {
  const { controller } = fixture();
  for (const body of [visit({ patient_id: 999 }), visit({ visit_date: "2026-02-30" }),
    visit({ amount_paid: -2 }), visit({ procedure_name: " " })]) {
    const result = response();
    controller.addVisit({ body }, result);
    assert.ok([400, 404].includes(result.statusCode));
  }
  const invalidCalendar = response();
  controller.getTreatmentCalendar({ query: { start_date: "2026-01-01", end_date: "2026-12-31" } }, invalidCalendar);
  assert.equal(invalidCalendar.statusCode, 400);
});

test("password policy accepts arbitrary six-character strings", () => {
  const { passwordError } = require("../services/passwordPolicy");
  for (const password of ["aaaaaa", "123456", "------", "hello ", "       ", "pässwörd", "x".repeat(150)]) {
    assert.equal(passwordError(password), null, password);
  }
  for (const value of ["", "abcde", null, 123456]) assert.ok(passwordError(value));
});

test("new password hashing handles UTF-8 >72 bytes and old bcrypt hashes remain valid", async () => {
  const file = path.join(__dirname, "../services/passwordHash.js");
  const bcrypt = { hash: async value => `fake-hash-${value}`, compare: async (value, hash) => hash === `fake-hash-${value}` };
  const sandbox = { module: { exports: {} }, Buffer, require(name) {
    if (name === "bcrypt") return bcrypt;
    return require(name);
  } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);
  const { hashPassword, verifyPassword } = sandbox.module.exports;
  const password = "🐱".repeat(100);
  const stored = await hashPassword(password);
  assert.ok(stored.startsWith("sha256-bcrypt:"));
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword(password + "!", stored), false);
  assert.equal(await verifyPassword("legacy-password", "fake-hash-legacy-password"), true);
  assert.equal(await verifyPassword("a".repeat(73), "fake-hash-" + "a".repeat(73)), false);
});

test("UI and routes no longer reference queue management", () => {
  const root = path.join(__dirname, "../../front-end/src");
  const routes = fs.readFileSync(path.join(root, "main.jsx"), "utf8");
  const sidebar = fs.readFileSync(path.join(root, "components/Sidebar.jsx"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "../server-sqlite.js"), "utf8");
  assert.doesNotMatch(routes, /\/Queue|QueueMngmt/);
  assert.doesNotMatch(sidebar, /\/Queue/);
  assert.doesNotMatch(server, /queueRoutes/);
  assert.ok(!fs.existsSync(path.join(__dirname, "../routes/queueRoutes.js")));
});
