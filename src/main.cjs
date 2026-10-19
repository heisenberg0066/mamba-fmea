// Electron main process for Mamba FMEA: window, file I/O, Excel (exceljs), PDF (printToPDF), self-test hooks.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const argv = process.argv.slice(1);
const selftestDir = process.env.MAMBA_SELFTEST || (argv.find((a) => a.startsWith('--selftest=')) || '').split('=')[1] || '';
const shotsDir = process.env.MAMBA_SHOTS || '';
let win;
const coreUrl = (rel) => pathToFileURL(path.join(__dirname, 'core', rel)).href;
const xlsx = () => import(coreUrl('fmea/xlsx.js'));

function createWindow() {
  const [ww, wh] = (process.env.MAMBA_WINSIZE || '1480x920').split('x').map(Number);
  win = new BrowserWindow({
    width: ww || 1480, height: wh || 920, minWidth: 1100, minHeight: 700, backgroundColor: '#142132', show: !selftestDir || !!process.env.MAMBA_SHOW,
    title: 'Mamba FMEA', icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  if (process.env.MAMBA_DEVTOOLS) win.webContents.openDevTools();
  win.webContents.on('console-message', (e, level, msg) => { if (selftestDir && level >= 2) try { fs.appendFileSync(path.join(selftestDir, 'console.log'), msg + '\n'); } catch {} });
}
const outDir = () => { const d = selftestDir || shotsDir; if (d) fs.mkdirSync(d, { recursive: true }); return d; };
const autosaveFile = () => path.join(app.getPath('userData'), 'autosave.mfmea');

ipcMain.handle('read-asset', (e, rel) => { const p = path.join(__dirname, rel); if (!p.startsWith(__dirname)) throw new Error('bad path'); return fs.readFileSync(p); });
ipcMain.handle('app-info', () => ({ version: app.getVersion(), platform: process.platform, selftest: !!selftestDir, shots: !!shotsDir, shotsOnly: process.env.MAMBA_SHOTS_ONLY || '', lang: process.env.MAMBA_LANG || '', openFile: argv.find((a) => a.toLowerCase().endsWith('.mfmea') && fs.existsSync(a)) || null, autosave: fs.existsSync(autosaveFile()) && !selftestDir && !shotsDir ? autosaveFile() : null }));
ipcMain.handle('save-project', async (e, { json, filePath, name }) => {
  let fp = filePath;
  if (!fp) { const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'project') + '.mfmea', filters: [{ name: 'Mamba FMEA project', extensions: ['mfmea'] }] }); if (r.canceled) return null; fp = r.filePath; }
  const tmp = fp + '.tmp'; fs.writeFileSync(tmp, json, 'utf8'); fs.renameSync(tmp, fp); return fp;
});
ipcMain.handle('autosave', (e, json) => { if (selftestDir || shotsDir) return null; fs.mkdirSync(path.dirname(autosaveFile()), { recursive: true }); fs.writeFileSync(autosaveFile(), json, 'utf8'); return autosaveFile(); });
ipcMain.handle('open-project', async (e, fp) => {
  if (!fp) { const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Mamba FMEA project', extensions: ['mfmea', 'json'] }], properties: ['openFile'] }); if (r.canceled) return null; fp = r.filePaths[0]; }
  return { filePath: fp, json: fs.readFileSync(fp, 'utf8') };
});
ipcMain.handle('save-text', async (e, { text, name, ext, outPath }) => {
  let fp = outPath; if (!fp) { const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); if (r.canceled) return null; fp = r.filePath; }
  fs.writeFileSync(fp, text, 'utf8'); return fp;
});
ipcMain.handle('open-text', async (e, { ext }) => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: ext.toUpperCase(), extensions: [ext] }], properties: ['openFile'] }); if (r.canceled) return null;
  return { filePath: r.filePaths[0], text: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('export-xlsx', async (e, { json, name, docIds, outPath }) => {
  let fp = outPath; if (!fp) { const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'fmea') + '.xlsx', filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }] }); if (r.canceled) return null; fp = r.filePath; }
  const m = await xlsx(); await m.exportWorkbook(JSON.parse(json), fp, { docIds });
  if (!outPath) shell.openPath(fp);
  return { path: fp, bytes: fs.statSync(fp).size };
});
ipcMain.handle('import-xlsx', async (e, { type, inPath } = {}) => {
  let fp = inPath; if (!fp) { const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }], properties: ['openFile'] }); if (r.canceled) return null; fp = r.filePaths[0]; }
  const m = await xlsx(); const res = await m.importWorkbook(fp, { type });
  return { filePath: fp, lossless: !!res.lossless, project: res.project || null, docs: res.docs || [], warnings: res.warnings || [], mode: res.mode || null };
});
ipcMain.handle('export-pdf', async (e, { html, name, outPath, landscape }) => {
  const tmp = path.join(os.tmpdir(), 'mamba-fmea-report-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false });
  await w.loadFile(tmp); await new Promise((r) => setTimeout(r, 300));
  const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: !!landscape, margins: { marginType: 'custom', top: 0.45, bottom: 0.55, left: 0.45, right: 0.45 }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666">Mamba FMEA — page <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  w.destroy(); try { fs.unlinkSync(tmp); } catch {}
  let fp = outPath;
  if (!fp) { const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'report') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (r.canceled) return null; fp = r.filePath; }
  fs.writeFileSync(fp, pdf); if (!outPath) shell.openPath(fp);
  return { path: fp, bytes: pdf.length };
});
ipcMain.handle('capture', async (e, { file }) => { const d = outDir(); if (!d) return null; const img = await win.webContents.capturePage(); const fp = path.join(d, file); fs.writeFileSync(fp, img.toPNG()); return fp; });
ipcMain.handle('selftest-path', (e, file) => { const d = outDir(); return d ? path.join(d, file) : null; });
ipcMain.handle('file-size', (e, fp) => { try { return fs.statSync(fp).size; } catch { return -1; } });
ipcMain.handle('read-file', (e, fp) => { const d = outDir(); if (!d || !path.resolve(fp).startsWith(path.resolve(d))) throw new Error('not allowed'); return fs.readFileSync(fp, 'utf8'); });
ipcMain.handle('selftest-done', (e, { ok, report }) => {
  const d = outDir();
  if (d) { fs.writeFileSync(path.join(d, 'selftest.json'), JSON.stringify(report, null, 2)); fs.writeFileSync(path.join(d, 'mamba-selftest.txt'), (ok ? 'SELFTEST OK' : 'SELFTEST FAILED') + '\n' + report.lines.join('\n')); }
  setTimeout(() => app.exit(ok ? 0 : 1), 200);
});
ipcMain.handle('open-external', (e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) => { if (selftestDir) { try { fs.mkdirSync(selftestDir, { recursive: true }); fs.writeFileSync(path.join(selftestDir, 'mamba-selftest.txt'), 'SELFTEST CRASH ' + err.stack); } catch {} app.exit(2); } else console.error(err); });
if (selftestDir) setTimeout(() => { try { fs.mkdirSync(selftestDir, { recursive: true }); fs.writeFileSync(path.join(selftestDir, 'mamba-selftest.txt'), 'SELFTEST TIMEOUT'); } catch {} app.exit(3); }, 300000);
