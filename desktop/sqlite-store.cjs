// Foundation module for a future SQLite-backed desktop server.
// Using better-sqlite3 requires native Electron ABI rebuild during packaging.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
class Store {
  constructor(folder) {
    fs.mkdirSync(folder, {recursive:true, mode:0o700});
    this.file = path.join(folder, 'clinic.sqlite');
    this.db = new Database(this.file);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  }
  backup(file) {
    // better-sqlite3 online backup handles WAL consistency.
    return this.db.backup(file);
  }
  async restore(file) {
    // Close the DB before replacing; callers must suspend all API work.
    if(!fs.existsSync(file)) throw new Error('Backup file missing');
    const candidate = new Database(file, {readonly:true, fileMustExist:true});
    try { if(candidate.pragma('integrity_check', {simple:true}) !== 'ok') throw new Error('Backup integrity check failed'); } finally { candidate.close(); }
    this.close();
    const temp = this.file + '.restore-tmp';
    fs.copyFileSync(file,temp);
    fs.renameSync(temp,this.file);
  }
  close() { if(this.db?.open) { this.db.pragma('wal_checkpoint(TRUNCATE)'); this.db.close(); } }
}
module.exports = {Store};
