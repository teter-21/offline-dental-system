const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('dentalDesktop', Object.freeze({
  isDesktop:true,
  backup:()=>ipcRenderer.invoke('backup:save'),
  restore:()=>ipcRenderer.invoke('backup:restore')
}));
