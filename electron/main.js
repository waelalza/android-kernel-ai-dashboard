/**
 * Android Kernel AI Dashboard - Electron Main Process
 * Handles ADB operations, AI requests, and kernel file management
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

// Import modules
const aiModule = require('../ai/ai.js');
const kernelModule = require('../kernel/kernel.js');

let mainWindow;

// Get the path to ADB (bundled or system)
function getAdbPath() {
  // Try bundled ADB first
  let bundledPath;
  if (app.isPackaged) {
    bundledPath = path.join(process.resourcesPath, 'adb', 'adb.exe');
  } else {
    bundledPath = path.join(__dirname, 'adb', 'adb.exe');
  }
  
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  
  // Fallback to system ADB
  const systemPaths = [
    'C:\\platform-tools\\platform-tools\\adb.exe',
    'C:\\platform-tools\\adb.exe',
    'C:\\Android\\platform-tools\\adb.exe',
    process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe',
  ];
  
  for (const p of systemPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  // Last resort - hope it's in PATH
  return 'adb';
}

// ============== ADB Functions ==============

// Dangerous command patterns
const DANGEROUS_PATTERNS = [
  /fastboot\s+flash/i,
  /fastboot\s+erase/i,
  /fastboot\s+oem\s+unlock/i,
  /\bdd\s+if=/i,
  /\bdd\s+of=/i,
  /\/dev\/block\//i,
  /format\s+userdata/i,
  /wipe\s+data/i,
  /factory[\s_-]?reset/i,
  /flash[\s_-]?all/i,
  /rm\s+-rf\s+\//i,
  /mkfs\./i,
];

function isDangerousCommand(command) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason: `Matches dangerous pattern: ${pattern}` };
    }
  }
  return { dangerous: false, reason: null };
}

// Get connected devices
function getDevices() {
  return new Promise((resolve) => {
    const adbPath = getAdbPath();
    
    execFile(adbPath, ['devices'], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ devices: [], error: error.message });
        return;
      }
      
      const devices = [];
      const lines = stdout.trim().split('\n');
      
      // Skip first line "List of devices attached"
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line && line.includes('\t')) {
          const [id, status] = line.split('\t');
          devices.push({ id: id.trim(), status: status.trim() });
        }
      }
      
      resolve({ devices, error: null });
    });
  });
}

// Get device info
function getDeviceInfo(deviceId) {
  return new Promise(async (resolve) => {
    const adbPath = getAdbPath();
    const info = {};
    
    // Get model
    try {
      const model = await runAdbCommand(deviceId, 'shell getprop ro.product.model');
      info.model = model.stdout.trim();
    } catch (e) {
      info.model = 'Unknown';
    }
    
    // Get Android version
    try {
      const version = await runAdbCommand(deviceId, 'shell getprop ro.build.version.release');
      info.androidVersion = version.stdout.trim();
    } catch (e) {
      info.androidVersion = 'Unknown';
    }
    
    // Get kernel version
    try {
      const kernel = await runAdbCommand(deviceId, 'shell uname -r');
      info.kernelVersion = kernel.stdout.trim();
    } catch (e) {
      info.kernelVersion = 'Unknown';
    }
    
    // Check root
    try {
      const root = await runAdbCommand(deviceId, 'shell su -c "echo rooted"');
      info.rooted = root.stdout.includes('rooted');
    } catch (e) {
      info.rooted = false;
    }
    
    resolve(info);
  });
}

// Run ADB command
function runAdbCommand(deviceId, command, checkDangerous = true) {
  return new Promise((resolve) => {
    // Check if dangerous
    if (checkDangerous) {
      const check = isDangerousCommand(command);
      if (check.dangerous) {
        resolve({
          stdout: '',
          stderr: '',
          exitCode: -1,
          dangerous: true,
          blockedReason: `BLOCKED: ${check.reason}. This command must be run manually.`
        });
        return;
      }
    }
    
    const adbPath = getAdbPath();
    const args = ['-s', deviceId, ...command.split(' ')];
    
    execFile(adbPath, args, { timeout: 60000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? error.code || 1 : 0,
        dangerous: false,
        blockedReason: null
      });
    });
  });
}

// Run ADB command with real-time output
function runAdbCommandStream(deviceId, command, onData) {
  return new Promise((resolve) => {
    // Check if dangerous
    const check = isDangerousCommand(command);
    if (check.dangerous) {
      onData({ type: 'error', data: `BLOCKED: ${check.reason}` });
      resolve({ exitCode: -1, dangerous: true });
      return;
    }
    
    const adbPath = getAdbPath();
    const args = ['-s', deviceId, ...command.split(' ')];
    
    const proc = spawn(adbPath, args);
    
    proc.stdout.on('data', (data) => {
      onData({ type: 'stdout', data: data.toString() });
    });
    
    proc.stderr.on('data', (data) => {
      onData({ type: 'stderr', data: data.toString() });
    });
    
    proc.on('close', (code) => {
      resolve({ exitCode: code, dangerous: false });
    });
    
    proc.on('error', (err) => {
      onData({ type: 'error', data: err.message });
      resolve({ exitCode: 1, dangerous: false });
    });
  });
}

// ============== App Manager Functions ==============

// Get list of installed packages
function getPackages(deviceId, includeSystem = false) {
  return new Promise((resolve) => {
    const adbPath = getAdbPath();
    const args = ['-s', deviceId, 'shell', 'pm', 'list', 'packages', '-f'];
    
    if (!includeSystem) {
      args.push('-3'); // Third-party apps only
    }
    
    execFile(adbPath, args, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ packages: [], error: error.message });
        return;
      }
      
      const packages = [];
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        // Format: package:/data/app/com.example.app-xxx/base.apk=com.example.app
        const match = line.match(/package:(.+)=(.+)/);
        if (match) {
          packages.push({
            path: match[1].trim(),
            packageName: match[2].trim(),
            isSystem: match[1].includes('/system/')
          });
        }
      }
      
      // Sort alphabetically
      packages.sort((a, b) => a.packageName.localeCompare(b.packageName));
      
      resolve({ packages, error: null });
    });
  });
}

// Get detailed package info
function getPackageInfo(deviceId, packageName) {
  return new Promise(async (resolve) => {
    const info = { packageName };
    
    try {
      // Get version info
      const versionResult = await runAdbCommand(deviceId, 
        `shell dumpsys package ${packageName} | grep versionName`, false);
      const versionMatch = versionResult.stdout.match(/versionName=([^\s]+)/);
      info.version = versionMatch ? versionMatch[1] : 'Unknown';
      
      // Get version code
      const versionCodeResult = await runAdbCommand(deviceId,
        `shell dumpsys package ${packageName} | grep versionCode`, false);
      const codeMatch = versionCodeResult.stdout.match(/versionCode=(\d+)/);
      info.versionCode = codeMatch ? codeMatch[1] : 'Unknown';
      
      // Get install time
      const timeResult = await runAdbCommand(deviceId,
        `shell dumpsys package ${packageName} | grep firstInstallTime`, false);
      const timeMatch = timeResult.stdout.match(/firstInstallTime=([^\s]+)/);
      info.installTime = timeMatch ? timeMatch[1] : 'Unknown';
      
      // Get APK size
      const pathResult = await runAdbCommand(deviceId,
        `shell pm path ${packageName}`, false);
      const pathMatch = pathResult.stdout.match(/package:(.+)/);
      if (pathMatch) {
        info.apkPath = pathMatch[1].trim();
        const sizeResult = await runAdbCommand(deviceId,
          `shell stat -c %s "${info.apkPath}"`, false);
        const size = parseInt(sizeResult.stdout.trim());
        if (!isNaN(size)) {
          info.size = formatBytes(size);
          info.sizeBytes = size;
        }
      }
      
      // Check if system app
      info.isSystem = info.apkPath ? info.apkPath.includes('/system/') : false;
      
      resolve({ info, error: null });
    } catch (e) {
      resolve({ info, error: e.message });
    }
  });
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Install APK
function installApk(deviceId, apkPath) {
  return new Promise((resolve) => {
    const adbPath = getAdbPath();
    
    // Validate file exists
    if (!fs.existsSync(apkPath)) {
      resolve({ success: false, error: 'APK file not found' });
      return;
    }
    
    // Validate it's an APK
    if (!apkPath.toLowerCase().endsWith('.apk')) {
      resolve({ success: false, error: 'File is not an APK' });
      return;
    }
    
    const args = ['-s', deviceId, 'install', '-r', apkPath];
    
    execFile(adbPath, args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr || error.message });
        return;
      }
      
      if (stdout.includes('Success')) {
        resolve({ success: true, message: 'App installed successfully' });
      } else {
        resolve({ success: false, error: stdout || 'Installation failed' });
      }
    });
  });
}

// Uninstall package
function uninstallPackage(deviceId, packageName, keepData = false) {
  return new Promise((resolve) => {
    const adbPath = getAdbPath();
    const args = ['-s', deviceId, 'uninstall'];
    
    if (keepData) {
      args.push('-k'); // Keep data and cache
    }
    
    args.push(packageName);
    
    execFile(adbPath, args, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr || error.message });
        return;
      }
      
      if (stdout.includes('Success')) {
        resolve({ success: true, message: 'App uninstalled successfully' });
      } else {
        resolve({ success: false, error: stdout || 'Uninstallation failed' });
      }
    });
  });
}

// Open file dialog to select APK
function selectApkFile() {
  return new Promise((resolve) => {
    dialog.showOpenDialog(mainWindow, {
      title: 'Select APK File',
      filters: [
        { name: 'APK Files', extensions: ['apk'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    }).then(result => {
      if (result.canceled || result.filePaths.length === 0) {
        resolve({ path: null, canceled: true });
      } else {
        resolve({ path: result.filePaths[0], canceled: false });
      }
    }).catch(err => {
      resolve({ path: null, error: err.message });
    });
  });
}

// ============== App Settings ==============

let settings = {
  llmBaseUrl: 'http://localhost:11434/v1',
  llmModel: 'qwen2.5:1.5b'  // Fast and good at JSON output
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = { ...settings, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// ============== IPC Handlers ==============

function setupIpcHandlers() {
  // Device handlers
  ipcMain.handle('get-devices', async () => {
    return await getDevices();
  });
  
  ipcMain.handle('get-device-info', async (event, deviceId) => {
    return await getDeviceInfo(deviceId);
  });
  
  ipcMain.handle('run-adb-command', async (event, deviceId, command) => {
    return await runAdbCommand(deviceId, command);
  });
  
  // Streaming ADB command
  ipcMain.handle('run-adb-stream', async (event, deviceId, command) => {
    return await runAdbCommandStream(deviceId, command, (data) => {
      mainWindow.webContents.send('adb-output', data);
    });
  });
  
  // AI handlers
  ipcMain.handle('generate-plan', async (event, deviceId, goal) => {
    return await aiModule.generatePlan(settings.llmBaseUrl, settings.llmModel, deviceId, goal);
  });
  
  ipcMain.handle('ai-edit-file', async (event, content, instruction, filePath) => {
    return await aiModule.editFile(settings.llmBaseUrl, settings.llmModel, content, instruction, filePath);
  });
  
  ipcMain.handle('test-llm', async () => {
    return await aiModule.testConnection(settings.llmBaseUrl, settings.llmModel);
  });
  
  // Kernel handlers
  ipcMain.handle('get-workspaces', async () => {
    const workspacesPath = kernelModule.getWorkspacesPath(app.isPackaged, __dirname);
    return kernelModule.listWorkspaces(workspacesPath);
  });
  
  ipcMain.handle('list-files', async (event, workspace, relativePath) => {
    const workspacesPath = kernelModule.getWorkspacesPath(app.isPackaged, __dirname);
    return kernelModule.listFiles(workspacesPath, workspace, relativePath);
  });
  
  ipcMain.handle('read-file', async (event, workspace, filePath) => {
    const workspacesPath = kernelModule.getWorkspacesPath(app.isPackaged, __dirname);
    return kernelModule.readFile(workspacesPath, workspace, filePath);
  });
  
  ipcMain.handle('write-file', async (event, workspace, filePath, content) => {
    const workspacesPath = kernelModule.getWorkspacesPath(app.isPackaged, __dirname);
    return kernelModule.writeFileWithBackup(workspacesPath, workspace, filePath, content);
  });
  
  // Settings handlers
  ipcMain.handle('get-settings', () => {
    return settings;
  });
  
  ipcMain.handle('save-settings', (event, newSettings) => {
    saveSettings(newSettings);
    return settings;
  });
  
  // Utility handlers
  ipcMain.handle('check-dangerous', (event, command) => {
    return isDangerousCommand(command);
  });
  
  // ============== App Manager Handlers ==============
  
  ipcMain.handle('get-packages', async (event, deviceId, includeSystem) => {
    return await getPackages(deviceId, includeSystem);
  });
  
  ipcMain.handle('get-package-info', async (event, deviceId, packageName) => {
    return await getPackageInfo(deviceId, packageName);
  });
  
  ipcMain.handle('install-apk', async (event, deviceId, apkPath) => {
    return await installApk(deviceId, apkPath);
  });
  
  ipcMain.handle('uninstall-package', async (event, deviceId, packageName, keepData) => {
    return await uninstallPackage(deviceId, packageName, keepData);
  });
  
  ipcMain.handle('select-apk-file', async () => {
    return await selectApkFile();
  });
  
  // ============== Logcat Handlers ==============
  
  ipcMain.handle('start-logcat', async (event, deviceId, packageFilter) => {
    return startLogcat(deviceId, packageFilter);
  });
  
  ipcMain.handle('stop-logcat', async () => {
    return stopLogcat();
  });
  
  // ============== Profile Handlers ==============
  
  ipcMain.handle('generate-profile-plan', async (event, profileName) => {
    return await aiModule.generateProfilePlan(settings.llmBaseUrl, settings.llmModel, profileName);
  });
}

// ============== Logcat Functions ==============

let logcatProcess = null;

function startLogcat(deviceId, packageFilter) {
  // Stop any existing logcat
  stopLogcat();
  
  const adbPath = getAdbPath();
  const args = ['-s', deviceId, 'logcat', '-v', 'time'];
  
  // Add package filter if provided
  if (packageFilter) {
    args.push('--pid');
    // We need to get the PID first, but for simplicity just filter in renderer
  }
  
  logcatProcess = spawn(adbPath, args);
  
  logcatProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        mainWindow.webContents.send('logcat-line', line);
      }
    });
  });
  
  logcatProcess.stderr.on('data', (data) => {
    mainWindow.webContents.send('logcat-line', `[ERROR] ${data.toString()}`);
  });
  
  logcatProcess.on('close', (code) => {
    logcatProcess = null;
  });
  
  logcatProcess.on('error', (err) => {
    mainWindow.webContents.send('logcat-line', `[ERROR] ${err.message}`);
    logcatProcess = null;
  });
  
  return { success: true };
}

function stopLogcat() {
  if (logcatProcess) {
    logcatProcess.kill();
    logcatProcess = null;
  }
  return { success: true };
}

// ============== Window Creation ==============

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'icon.ico'),
    title: 'Android Kernel AI Dashboard',
    backgroundColor: '#0a0e14'
  });
  
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  // Remove menu bar for cleaner look
  mainWindow.setMenuBarVisibility(false);
  
  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

// ============== App Lifecycle ==============

app.whenReady().then(() => {
  loadSettings();
  setupIpcHandlers();
  createWindow();
  
  // Ensure kernel workspaces directory exists
  const workspacesPath = kernelModule.getWorkspacesPath(app.isPackaged, __dirname);
  if (!fs.existsSync(workspacesPath)) {
    fs.mkdirSync(workspacesPath, { recursive: true });
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

