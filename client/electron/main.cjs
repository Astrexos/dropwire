// client/electron/main.cjs
const { app, BrowserWindow, shell, globalShortcut, desktopCapturer, session, ipcMain, protocol, net, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');

// Register privileged custom scheme for zero-RAM streaming of local media
protocol.registerSchemesAsPrivileged([
  { scheme: 'dropwire-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

// 🚫 Force Chromium to use DXGI / GDI instead of Windows Graphics Capture (WGC) -> NO YELLOW BORDER & 60 FPS!
app.commandLine.appendSwitch(
  'disable-features',
  'AllowWgcDesktopCapturer,AllowWgcScreenCapturer,AllowWgcWindowCapturer,WebRtcAllowWgcDesktopCapturer,WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer,UseWgcForDesktopCapture,WgcCapturerAudio,AudioServiceOutOfProcess'
);
app.commandLine.appendSwitch('disable-ipv6');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('allow-http-screen-capture');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow = null;
let pendingSourceId = null;
let pendingShareAudio = true;

const desktopFilesRegistry = new Map();

const JUNK_OVERLAYS_REGEX = /(nvidia|geforce|shadowplay|overlay|steam|program manager|windows input|gdi\+|settings|setup)/i;

ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });

  return sources
    .filter(s => {
      if (s.id.startsWith('screen:')) return true;
      if (!s.name || s.name.trim() === '') return false;
      if (JUNK_OVERLAYS_REGEX.test(s.name.trim())) return false;
      return true;
    })
    .map(s => ({
      id: s.id,
      name: s.name,
      isScreen: s.id.startsWith('screen:'),
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      display_id: s.display_id
    }));
});

ipcMain.handle('check-source-alive', async (_event, sourceId) => {
  if (!sourceId || !String(sourceId).startsWith('window:')) {
    return true;
  }
  const parts = String(sourceId).split(':');
  const hwnd = parts[1];
  if (!hwnd || isNaN(Number(hwnd))) return true;

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      exec(
        `powershell -NoProfile -WindowStyle Hidden -Command "[ signature ] $sig='[DllImport(\\"user32.dll\\")]public static extern bool IsWindow(IntPtr hWnd);'; $t=Add-Type -MemberDefinition $sig -Name Win32 -Namespace W -PassThru; $t::IsWindow([IntPtr]${hwnd})"`,
        { windowsHide: true, timeout: 1500 },
        (err, stdout) => {
          if (err) return resolve(true);
          const out = String(stdout || '').trim().toLowerCase();
          if (out === 'false') return resolve(false);
          resolve(true);
        }
      );
    });
  }
  return true;
});

ipcMain.handle('select-desktop-source', async (_event, arg1, arg2) => {
  if (typeof arg1 === 'object' && arg1 !== null) {
    pendingSourceId = arg1.sourceId || arg1.id || null;
    pendingShareAudio = arg1.shareAudio !== undefined ? Boolean(arg1.shareAudio) : Boolean(arg1.withAudio ?? true);
  } else {
    pendingSourceId = arg1 || null;
    pendingShareAudio = arg2 !== undefined ? Boolean(arg2) : true;
  }
  return true;
});

ipcMain.handle('register-desktop-file', async (_event, { fileId, filePath, fileName, fileSize, mimeType }) => {
  if (!fileId || !filePath || !fs.existsSync(filePath)) return false;
  desktopFilesRegistry.set(fileId, { filePath, fileName, fileSize, mimeType });
  return true;
});

ipcMain.handle('get-desktop-file', async (_event, fileId) => {
  const entry = desktopFilesRegistry.get(fileId);
  if (!entry || !fs.existsSync(entry.filePath)) return null;
  return {
    streamUrl: `dropwire-file://${fileId}`,
    fileName: entry.fileName,
    fileSize: entry.fileSize,
    mimeType: entry.mimeType
  };
});

ipcMain.handle('save-desktop-file', async (_event, { fileId, defaultName }) => {
  const entry = desktopFilesRegistry.get(fileId);
  if (!entry || !fs.existsSync(entry.filePath)) return { success: false, error: 'File not found on disk' };

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath('downloads'), defaultName || entry.fileName),
    title: 'Save File'
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    fs.copyFileSync(entry.filePath, filePath);
    return { success: true, savedPath: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function attachProtocolHandler(targetSession) {
  targetSession.protocol.handle('dropwire-file', async (request) => {
    try {
      const url = new URL(request.url);
      const fileId = url.hostname || url.pathname.replace(/^\/+/, '');
      const entry = desktopFilesRegistry.get(fileId);
      if (!entry || !fs.existsSync(entry.filePath)) {
        return new Response('File not found', { status: 404 });
      }
      const response = await net.fetch(pathToFileURL(entry.filePath).toString());
      const headers = new Headers(response.headers);
      if (entry.mimeType) {
        headers.set('Content-Type', entry.mimeType);
      }
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (err) {
      return new Response('Stream error', { status: 500 });
    }
  });
}

function attachDisplayMediaHandler(targetSession) {
  targetSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false
      });

      const targetId = pendingSourceId;
      const wantAudio = pendingShareAudio && Boolean(request.audioRequested);
      pendingSourceId = null;

      const selected = (targetId && sources.find(s => s.id === targetId)) || sources[0];
      if (!selected) {
        callback({});
        return;
      }

      if (wantAudio) {
        callback({ video: selected, audio: 'loopback' });
      } else {
        callback({ video: selected });
      }
    } catch (err) {
      console.error('[Electron Main] setDisplayMediaRequestHandler error:', err);
      callback({});
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Proper HTTP 206 Partial Content Streaming for HTML5 <video> & <audio>
    protocol.handle('dropwire-file', (request) => {
      try {
        const fileId = new URL(request.url).hostname;
        const entry = desktopFilesRegistry.get(fileId);
        if (!entry || !fs.existsSync(entry.filePath)) {
          return new Response('File not found', { status: 404 });
        }

        const stat = fs.statSync(entry.filePath);
        const total = stat.size;
        const rangeHeader = request.headers.get('Range');
        const mimeType = entry.mimeType || 'video/mp4';

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          const chunkSize = (end - start) + 1;

          const nodeStream = fs.createReadStream(entry.filePath, { start, end });
          const webStream = Readable.toWeb(nodeStream);

          return new Response(webStream, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize),
              'Content-Type': mimeType
            }
          });
        }

        const nodeStream = fs.createReadStream(entry.filePath);
        const webStream = Readable.toWeb(nodeStream);

        return new Response(webStream, {
          status: 200,
          headers: {
            'Content-Length': String(total),
            'Accept-Ranges': 'bytes',
            'Content-Type': mimeType
          }
        });
      } catch (err) {
        return new Response('Stream error', { status: 500 });
      }
    });

    attachProtocolHandler(session.defaultSession);
    attachDisplayMediaHandler(session.defaultSession);
    createMainWindow();

    globalShortcut.register('F8', () => {
      const partitionName = `in-memory-peer-${Date.now()}`;
      const testSession = session.fromPartition(partitionName);
      attachProtocolHandler(testSession);
      attachDisplayMediaHandler(testSession);

      const testWin = new BrowserWindow({
        width: 1100,
        height: 780,
        minWidth: 420,
        minHeight: 560,
        title: 'DropWire (Test Peer #2)',
        backgroundColor: '#060913',
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          partition: partitionName,
          backgroundThrottling: false
        }
      });
      if (app.isPackaged) {
        testWin.loadFile(path.join(__dirname, '../dist/index.html'));
      } else {
        testWin.loadURL('http://localhost:3000');
      }
    });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    title: 'DropWire',
    backgroundColor: '#060913',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

