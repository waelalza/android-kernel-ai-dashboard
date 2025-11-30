/**
 * Preload script - Exposes safe APIs to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // ============== Device APIs ==============
  getDevices: () => ipcRenderer.invoke('get-devices'),
  getDeviceInfo: (deviceId) => ipcRenderer.invoke('get-device-info', deviceId),
  runAdbCommand: (deviceId, command) => ipcRenderer.invoke('run-adb-command', deviceId, command),
  runAdbStream: (deviceId, command) => ipcRenderer.invoke('run-adb-stream', deviceId, command),
  
  // Listen for streaming output
  onAdbOutput: (callback) => {
    ipcRenderer.on('adb-output', (event, data) => callback(data));
  },
  removeAdbOutputListener: () => {
    ipcRenderer.removeAllListeners('adb-output');
  },
  
  // ============== AI APIs ==============
  generatePlan: (deviceId, goal) => ipcRenderer.invoke('generate-plan', deviceId, goal),
  aiEditFile: (content, instruction, filePath) => ipcRenderer.invoke('ai-edit-file', content, instruction, filePath),
  testLlm: () => ipcRenderer.invoke('test-llm'),
  
  // ============== Kernel APIs ==============
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  listFiles: (workspace, path) => ipcRenderer.invoke('list-files', workspace, path),
  readFile: (workspace, path) => ipcRenderer.invoke('read-file', workspace, path),
  writeFile: (workspace, path, content) => ipcRenderer.invoke('write-file', workspace, path, content),
  
  // ============== Settings APIs ==============
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // ============== Utility APIs ==============
  checkDangerous: (command) => ipcRenderer.invoke('check-dangerous', command),
  
  // ============== App Manager APIs ==============
  getPackages: (deviceId, includeSystem) => ipcRenderer.invoke('get-packages', deviceId, includeSystem),
  getPackageInfo: (deviceId, packageName) => ipcRenderer.invoke('get-package-info', deviceId, packageName),
  installApk: (deviceId, apkPath) => ipcRenderer.invoke('install-apk', deviceId, apkPath),
  uninstallPackage: (deviceId, packageName, keepData) => ipcRenderer.invoke('uninstall-package', deviceId, packageName, keepData),
  selectApkFile: () => ipcRenderer.invoke('select-apk-file'),
  
  // ============== Logcat APIs ==============
  startLogcat: (deviceId, filter) => ipcRenderer.invoke('start-logcat', deviceId, filter),
  stopLogcat: () => ipcRenderer.invoke('stop-logcat'),
  onLogcatLine: (callback) => {
    ipcRenderer.on('logcat-line', (event, line) => callback(line));
  },
  removeLogcatListener: () => {
    ipcRenderer.removeAllListeners('logcat-line');
  },
  
  // ============== Profile APIs ==============
  generateProfilePlan: (profileName) => ipcRenderer.invoke('generate-profile-plan', profileName)
});

