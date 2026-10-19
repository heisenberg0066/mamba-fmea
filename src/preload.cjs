const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (o) => ipcRenderer.invoke(ch, o);
contextBridge.exposeInMainWorld('host', {
  readAsset: inv('read-asset'), appInfo: inv('app-info'), saveProject: inv('save-project'), autosave: inv('autosave'), openProject: inv('open-project'),
  saveText: inv('save-text'), openText: inv('open-text'), exportXlsx: inv('export-xlsx'), importXlsx: inv('import-xlsx'), exportPdf: inv('export-pdf'),
  capture: inv('capture'), selftestPath: inv('selftest-path'), fileSize: inv('file-size'), readFile: inv('read-file'), selftestDone: inv('selftest-done'), openExternal: inv('open-external'),
});
