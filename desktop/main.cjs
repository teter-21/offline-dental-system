// Electron integration scaffold. Backend SQLite conversion is required before use.
const {app, BrowserWindow, dialog, ipcMain} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {Store} = require('./sqlite-store.cjs');
let win; let store; let closing = false;
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance',()=> { if(win){ if(win.isMinimized()) win.restore(); win.focus(); }});
app.whenReady().then(async()=> {
  app.setAppUserModelId('com.magno.dental.desktop');
  const dir = path.join(app.getPath('userData'),'data');
  store = new Store(dir);
  win = new BrowserWindow({width:1280,height:820,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate', (event)=>event.preventDefault());
  const index = path.join(__dirname,'../front-end/dist/index.html');
  if(fs.existsSync(index)) await win.loadFile(index);
  else await win.loadURL('data:text/html,<h2>Desktop UI not built</h2><p>SQLite API migration is still required.</p>');
  win.once('ready-to-show',()=>win.show());
});
// IMPORTANT: Backup calls must also enforce current administrator authorization
// and suspend server writes during restore before enabling these handlers.
ipcMain.handle('backup:save',async()=>{throw new Error('Not enabled until SQLite API authentication and backup testing are complete');});
ipcMain.handle('backup:restore',async()=>{throw new Error('Not enabled until SQLite API authentication and restore testing are complete');});
app.on('before-quit', event=>{
  if(closing) return;
  event.preventDefault(); closing=true;
  try{ store?.close(); } catch(e){ dialog.showErrorBox('Database shutdown error',e.message); }
  setImmediate(()=>app.quit());
});
