// Planet Escape desktop app (Electron): serves the built game from desktop/app over app://, keeps saves as files
// (so Steam Cloud can sync them) and talks to Steam when it is running.
const { Readable } = require('node:stream');
const { app, BrowserWindow, ipcMain, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// a fixed name, so the save folder is the same however the app is started (Steam Cloud points there)
app.setName('Planet Escape');

const APP_DIR = path.join(__dirname, 'app');
// saves and progress live in <userData>/saves: %APPDATA%\\Planet Escape, ~/Library/Application Support/Planet Escape, ~/.config/Planet Escape
const saveDir = () => path.join(app.getPath('userData'), 'saves');

// ---------- Steam (optional: only when steamworks.js loads and Steam is running) ----------
let steam = null;
function initSteam() {
  const idFile = path.join(process.resourcesPath || __dirname, 'steam_appid.txt');
  const appId = Number(process.env.STEAM_APP_ID || (fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : 0));
  if (!appId) return;
  try {
    const steamworks = require('steamworks.js');
    steam = steamworks.init(appId);
    steamworks.electronEnableSteamOverlay();
    console.log('steam: logged in as', steam.localplayer.getName());
  } catch (e) {
    steam = null;
    console.log('steam: not available', String(e && e.message ? e.message : e));
  }
}

// the intro starts with sound without a click first (a browser would wait for one)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ---------- the game files over app:// (a real origin: modules, storage and relative paths behave like on the web) ----------
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function serveApp() {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response('forbidden', { status: 403 });
    const range = req.headers.get('range');
    if (range && /\.(webm|mp4)$/.test(file)) return videoRange(file, range);
    return net.fetch(pathToFileURL(file).toString());
  });
}

/** Byte ranges of a video (206), so the player can stream and seek (a file fetch would answer the whole file). */
function videoRange(file, range) {
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return new Response('not found', { status: 404 });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? Number(m[1]) : 0;
  let end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (!m[1] && m[2]) [start, end] = [Math.max(0, size - Number(m[2])), size - 1]; // "bytes=-N": the last N bytes
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const body = Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': file.endsWith('.webm') ? 'video/webm' : 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

// ---------- storage: one file per key ----------
const keyFile = (key) => path.join(saveDir(), `${String(key).replace(/[^a-z0-9_.-]/gi, '_')}.json`);
ipcMain.on('store:get', (e, key) => {
  try {
    e.returnValue = fs.readFileSync(keyFile(key), 'utf8');
  } catch {
    e.returnValue = null;
  }
});
ipcMain.on('store:set', (e, key, value) => {
  try {
    fs.mkdirSync(saveDir(), { recursive: true });
    const f = keyFile(key);
    fs.writeFileSync(f + '.tmp', value); // write then rename: a crash never leaves half a save
    fs.renameSync(f + '.tmp', f);
    e.returnValue = true;
  } catch {
    e.returnValue = false;
  }
});
ipcMain.on('store:remove', (e, key) => {
  try {
    fs.rmSync(keyFile(key), { force: true });
  } catch {
    /* ignore */
  }
  e.returnValue = true;
});

// ---------- window ----------
let win = null;
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (e) => {
  if (win) win.setFullScreen(!win.isFullScreen());
  e.returnValue = win ? win.isFullScreen() : false;
});
ipcMain.on('app:is-fullscreen', (e) => {
  e.returnValue = win ? win.isFullScreen() : false;
});
ipcMain.on('app:open', (_e, url) => {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
});
ipcMain.on('steam:available', (e) => {
  e.returnValue = !!steam;
});
ipcMain.on('steam:activate', (_e, id) => {
  try {
    if (steam && !steam.achievement.isActivated(id)) steam.achievement.activate(id);
  } catch {
    /* unknown id or Steam gone: ignore */
  }
});

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    title: 'Planet Escape',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  // links leave through the system browser, the game never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  void win.loadURL('app://game/index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  serveApp();
  initSteam();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
