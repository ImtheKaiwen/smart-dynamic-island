const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const firebase = require('./firebase');
require('dotenv').config();

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');

  // Initial window size and position (centered top)
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  
  mainWindow.setBounds({
    x: Math.floor((width - 400) / 2),
    y: 20,
    width: 400,
    height: 150
  });

  // Handle click-through management
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.setIgnoreMouseEvents(ignore, options);
  });

  // Handle resizing
  ipcMain.on('resize-window', (event, { width, height }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { x, y } = win.getBounds();
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenWidth = primaryDisplay.workAreaSize.width;
    const newX = Math.floor((screenWidth - width) / 2);
    
    win.setBounds({
      x: newX,
      y: y,
      width: Math.ceil(width),
      height: Math.ceil(height)
    }, false); // Animation turned off to prevent jitter with CSS transitions
  });

  // Firebase Event Listener
  firebase.listenForEvents((event) => {
    if (mainWindow) {
      mainWindow.webContents.send('firebase-event', event);
    }
  });

  // Handle sending events (for testing or replies)
  ipcMain.on('send-firebase-event', (event, eventData) => {
    firebase.sendEventToTarget(eventData);
  });

  // Tepsiyi oluştur
  createTray();
}

function createTray() {
  // Basit bir ikon oluştur (Yeşil nokta)
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAACNSURBVHgB7ZDLCoMwEEXH+v8fdy0UunHThS6EunHT9+pUEnSTZpIu9MCBmTNx7mSiaf5S6XpY7p/BfIAXvMMK3uEJT1zCGe76fofv8Cis4AuuYfFf8V+mX+AOfvAIm/D53/AArvAOn/AMU9idv8MXfMMTfMJvN8I3vOEVXuEX3vAbL8fW8QYveIU7vMOvshq28A2f8Aoz7AL9Y/N8R056EAAAAABJRU5ErkJggg==');
  
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Smart Island\'ı Göster', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Çıkış', click: () => {
        app.isQuiting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('Smart Dynamic Island');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
