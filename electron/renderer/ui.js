/**
 * Android Kernel AI Dashboard - UI Controller
 */

// ============== State ==============
let selectedDevice = null;
let currentPlan = null;
let currentWorkspace = null;
let currentPath = '';
let currentFile = null;
let currentFileContent = '';
let newFileContent = '';
let deviceRefreshInterval = null;
let lastDevicesJson = ''; // Cache to avoid unnecessary DOM updates

// ============== DOM Elements ==============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============== Navigation ==============
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel;
    
    // Update nav buttons
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update panels
    $$('.panel').forEach(p => p.classList.remove('active'));
    $(`#${panel}-panel`).classList.add('active');
  });
});

// ============== Devices ==============

async function refreshDevices() {
  const result = await window.api.getDevices();
  const container = $('#devices-list');
  
  if (result.error) {
    const errorJson = JSON.stringify({ error: result.error });
    if (lastDevicesJson === errorJson) return; // Skip if no change
    lastDevicesJson = errorJson;
    
    container.innerHTML = `
      <div class="empty-state">
        <p>Error: ${result.error}</p>
        <p class="text-muted">Make sure ADB is available</p>
      </div>
    `;
    return;
  }
  
  // Check if devices changed - skip DOM update if same
  const devicesJson = JSON.stringify(result.devices);
  if (lastDevicesJson === devicesJson) return;
  lastDevicesJson = devicesJson;
  
  if (result.devices.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
          <line x1="12" y1="18" x2="12" y2="18"/>
        </svg>
        <h3>No devices connected</h3>
        <p>Connect an Android device with USB debugging enabled</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = result.devices.map(device => `
    <div class="device-item ${selectedDevice?.id === device.id ? 'selected' : ''}" 
         data-id="${device.id}" data-status="${device.status}">
      <div class="device-info">
        <div class="device-icon">
          <svg viewBox="0 0 24 24">
            <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/>
          </svg>
        </div>
        <div>
          <div class="device-id">${device.id}</div>
          <div class="device-status">${getStatusText(device.status)}</div>
        </div>
      </div>
      <span class="badge badge-${getStatusBadge(device.status)}">${device.status}</span>
    </div>
  `).join('');
  
  // Add click handlers
  $$('.device-item').forEach(item => {
    item.addEventListener('click', () => selectDevice(item.dataset.id, item.dataset.status));
  });
  
  // Update AI device dropdown
  updateDeviceDropdown(result.devices);
}

function getStatusText(status) {
  switch (status) {
    case 'device': return 'Connected';
    case 'offline': return 'Offline';
    case 'unauthorized': return 'Needs authorization';
    default: return status;
  }
}

function getStatusBadge(status) {
  switch (status) {
    case 'device': return 'success';
    case 'offline': return 'danger';
    case 'unauthorized': return 'warning';
    default: return 'warning';
  }
}

async function selectDevice(id, status) {
  if (status !== 'device') {
    return; // Can only select connected devices
  }
  
  selectedDevice = { id, status };
  
  // Update UI
  $$('.device-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.id === id);
  });
  
  // Update sidebar
  $('#selected-device-info').innerHTML = `
    <span class="device-selected">● ${id.length > 18 ? id.slice(0, 18) + '...' : id}</span>
  `;
  
  // Show device details
  const detailsCard = $('#device-details');
  detailsCard.style.display = 'block';
  
  const info = await window.api.getDeviceInfo(id);
  $('#device-details-content').innerHTML = `
    <div class="detail-item">
      <div class="detail-label">Model</div>
      <div class="detail-value">${info.model || 'Unknown'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Android Version</div>
      <div class="detail-value">${info.androidVersion || 'Unknown'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Kernel</div>
      <div class="detail-value mono">${info.kernelVersion || 'Unknown'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Root Access</div>
      <div class="detail-value">
        <span class="badge badge-${info.rooted ? 'success' : 'warning'}">
          ${info.rooted ? 'Available' : 'Not detected'}
        </span>
      </div>
    </div>
  `;
  
  // Update AI dropdown
  $('#ai-device-select').value = id;
}

function updateDeviceDropdown(devices) {
  const select = $('#ai-device-select');
  const currentValue = select.value;
  
  select.innerHTML = '<option value="">Select a device...</option>' +
    devices
      .filter(d => d.status === 'device')
      .map(d => `<option value="${d.id}" ${d.id === currentValue ? 'selected' : ''}>${d.id}</option>`)
      .join('');
  
  // Also update apps device dropdown
  updateAppsDeviceDropdown(devices);
  
  // Also update logcat device dropdown
  updateLogcatDeviceDropdown(devices);
}

// Start device refresh (5 seconds instead of 2 for better performance)
function startDeviceRefresh() {
  refreshDevices();
  deviceRefreshInterval = setInterval(refreshDevices, 5000);
}

// ============== AI Commands ==============

$('#generate-plan-btn').addEventListener('click', async () => {
  const deviceId = $('#ai-device-select').value;
  const goal = $('#ai-goal').value.trim();
  
  if (!deviceId) {
    showStatus('settings-status', 'Please select a device first', 'error');
    return;
  }
  
  if (!goal) {
    showStatus('settings-status', 'Please enter a goal', 'error');
    return;
  }
  
  const btn = $('#generate-plan-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px"></div> Generating...';
  
  try {
    const result = await window.api.generatePlan(deviceId, goal);
    
    if (result.error) {
      alert('Error: ' + result.error);
      return;
    }
    
    currentPlan = result.plan;
    renderPlan(result.plan);
    
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1"/>
      </svg>
      Generate AI Plan
    `;
  }
});

function renderPlan(plan) {
  const container = $('#ai-plan-container');
  container.style.display = 'block';
  
  $('#plan-description').textContent = plan.description;
  
  $('#plan-steps').innerHTML = plan.steps.map((step, idx) => `
    <div class="plan-step ${step.dangerous ? 'dangerous' : ''}">
      <div class="step-header">
        <div class="step-title">
          <span class="step-number">Step ${idx + 1}</span>
          ${step.title}
          ${step.dangerous ? '<span class="badge badge-danger">Dangerous</span>' : ''}
        </div>
      </div>
      <div class="step-body">
        <p class="step-explanation">${step.explanation}</p>
        ${step.commands.length > 0 ? `
          <div class="step-commands">
            ${step.commands.map((cmd, cmdIdx) => `
              <div class="command-item ${step.dangerous ? 'dangerous' : ''}">
                <input type="checkbox" 
                       data-step="${idx}" 
                       data-cmd="${cmdIdx}"
                       ${step.dangerous ? 'disabled' : 'checked'}>
                <span class="command-text">${escapeHtml(cmd)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${step.dangerous ? `
          <div class="danger-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12" y2="17"/>
            </svg>
            <span>This step contains dangerous operations. Commands are disabled and must be run manually.</span>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
  
  // Show console
  $('#ai-console').style.display = 'block';
}

$('#execute-plan-btn').addEventListener('click', async () => {
  if (!currentPlan || !selectedDevice) return;
  
  const btn = $('#execute-plan-btn');
  btn.disabled = true;
  
  const consoleEl = $('#console-output');
  consoleEl.innerHTML = '';
  
  addConsoleLine('info', '━━━ Starting execution ━━━');
  
  // Setup output listener
  window.api.onAdbOutput((data) => {
    addConsoleLine(data.type, data.data);
  });
  
  // Get selected commands
  for (let stepIdx = 0; stepIdx < currentPlan.steps.length; stepIdx++) {
    const step = currentPlan.steps[stepIdx];
    
    addConsoleLine('info', `\n▶ Step ${stepIdx + 1}: ${step.title}`);
    
    for (let cmdIdx = 0; cmdIdx < step.commands.length; cmdIdx++) {
      const checkbox = $(`input[data-step="${stepIdx}"][data-cmd="${cmdIdx}"]`);
      
      if (!checkbox || !checkbox.checked) continue;
      
      const cmd = step.commands[cmdIdx];
      addConsoleLine('info', `  $ ${cmd}`);
      
      const result = await window.api.runAdbCommand(selectedDevice.id, cmd);
      
      if (result.dangerous) {
        addConsoleLine('stderr', `  ⚠ ${result.blockedReason}`);
      } else {
        if (result.stdout) {
          result.stdout.split('\n').forEach(line => {
            if (line.trim()) addConsoleLine('stdout', `    ${line}`);
          });
        }
        if (result.stderr) {
          result.stderr.split('\n').forEach(line => {
            if (line.trim()) addConsoleLine('stderr', `    ${line}`);
          });
        }
        addConsoleLine(result.exitCode === 0 ? 'success' : 'stderr', 
          `  ${result.exitCode === 0 ? '✓' : '✗'} Exit: ${result.exitCode}`);
      }
    }
  }
  
  addConsoleLine('success', '\n━━━ Execution complete ━━━');
  
  window.api.removeAdbOutputListener();
  btn.disabled = false;
});

function addConsoleLine(type, text) {
  const consoleEl = $('#console-output');
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.textContent = text;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

$('#clear-console-btn').addEventListener('click', () => {
  $('#console-output').innerHTML = '';
});

// ============== Kernel Workspace ==============

async function loadWorkspaces() {
  const result = await window.api.getWorkspaces();
  const select = $('#workspace-select');
  
  select.innerHTML = '<option value="">Select workspace...</option>' +
    result.workspaces.map(ws => `<option value="${ws.name}">${ws.name}</option>`).join('');
}

$('#workspace-select').addEventListener('change', async (e) => {
  currentWorkspace = e.target.value;
  currentPath = '';
  currentFile = null;
  
  if (!currentWorkspace) {
    $('#file-list').innerHTML = '<div class="empty-state">Select a workspace to browse files</div>';
    $('#nav-up-btn').style.display = 'none';
    return;
  }
  
  await loadFiles();
});

$('#nav-up-btn').addEventListener('click', async () => {
  if (!currentPath) return;
  
  const parts = currentPath.split(/[\/\\]/);
  parts.pop();
  currentPath = parts.join('/');
  
  await loadFiles();
});

async function loadFiles() {
  const result = await window.api.listFiles(currentWorkspace, currentPath);
  
  $('#current-path').textContent = currentWorkspace + (currentPath ? '/' + currentPath : '');
  $('#nav-up-btn').style.display = currentPath ? 'inline-flex' : 'none';
  
  if (result.files.length === 0) {
    $('#file-list').innerHTML = '<div class="empty-state">Empty directory</div>';
    return;
  }
  
  $('#file-list').innerHTML = result.files.map(file => `
    <div class="file-item ${file.isDir ? 'folder' : ''} ${currentFile === file.path ? 'selected' : ''}"
         data-path="${file.path}" data-is-dir="${file.isDir}">
      ${file.isDir ? `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      ` : `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      `}
      <span>${file.name}</span>
    </div>
  `).join('');
  
  // Add click handlers
  $$('#file-list .file-item').forEach(item => {
    item.addEventListener('click', () => handleFileClick(item.dataset.path, item.dataset.isDir === 'true'));
  });
}

async function handleFileClick(path, isDir) {
  if (isDir) {
    currentPath = path;
    currentFile = null;
    await loadFiles();
  } else {
    await openFile(path);
  }
}

async function openFile(path) {
  const result = await window.api.readFile(currentWorkspace, path);
  
  if (result.error) {
    alert('Error: ' + result.error);
    return;
  }
  
  currentFile = path;
  currentFileContent = result.content;
  
  // Update file list selection
  $$('#file-list .file-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.path === path);
  });
  
  // Show editor
  $('#editor-placeholder').style.display = 'none';
  $('#editor-content').style.display = 'block';
  $('#diff-view').style.display = 'none';
  
  $('#editor-file-path').textContent = path;
  $('#file-content-view').textContent = result.content;
}

$('#kernel-ai-edit-btn').addEventListener('click', async () => {
  if (!currentFile || !currentFileContent) {
    alert('Please select a file first');
    return;
  }
  
  const instruction = $('#kernel-ai-instruction').value.trim();
  if (!instruction) {
    alert('Please enter an instruction');
    return;
  }
  
  const btn = $('#kernel-ai-edit-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> Processing...';
  
  try {
    const result = await window.api.aiEditFile(currentFileContent, instruction, currentFile);
    
    if (result.error) {
      alert('Error: ' + result.error);
      return;
    }
    
    newFileContent = result.newContent;
    
    // Show diff
    $('#diff-view').style.display = 'block';
    $('#file-content-view').style.display = 'none';
    
    renderDiff(currentFileContent, newFileContent);
    
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7"/>
      </svg>
      Ask AI to Edit
    `;
  }
});

function renderDiff(oldContent, newContent) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  let html = '';
  const maxLen = Math.max(oldLines.length, newLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (oldLine === newLine) {
      html += `<div class="diff-line"> ${escapeHtml(oldLine || '')}</div>`;
    } else {
      if (oldLine !== undefined) {
        html += `<div class="diff-line remove">-${escapeHtml(oldLine)}</div>`;
      }
      if (newLine !== undefined) {
        html += `<div class="diff-line add">+${escapeHtml(newLine)}</div>`;
      }
    }
  }
  
  $('#diff-content').innerHTML = html;
}

$('#discard-edit-btn').addEventListener('click', () => {
  $('#diff-view').style.display = 'none';
  $('#file-content-view').style.display = 'block';
  newFileContent = '';
  $('#kernel-ai-instruction').value = '';
});

$('#apply-edit-btn').addEventListener('click', async () => {
  if (!currentFile || !newFileContent) return;
  
  const btn = $('#apply-edit-btn');
  btn.disabled = true;
  btn.textContent = 'Applying...';
  
  try {
    const result = await window.api.writeFile(currentWorkspace, currentFile, newFileContent);
    
    if (result.error) {
      alert('Error: ' + result.error);
      return;
    }
    
    // Update current content
    currentFileContent = newFileContent;
    $('#file-content-view').textContent = newFileContent;
    
    // Hide diff
    $('#diff-view').style.display = 'none';
    $('#file-content-view').style.display = 'block';
    newFileContent = '';
    $('#kernel-ai-instruction').value = '';
    
    alert(`Changes applied!\nBackup: ${result.backupPath}`);
    
  } finally {
    btn.disabled = false;
    btn.textContent = 'Apply Changes';
  }
});

// ============== App Manager ==============

let appsList = [];
let selectedApp = null;
let showSystemApps = false;

// Update apps device dropdown when devices change
function updateAppsDeviceDropdown(devices) {
  const select = $('#apps-device-select');
  const currentValue = select.value;
  
  select.innerHTML = '<option value="">Select a device...</option>' +
    devices
      .filter(d => d.status === 'device')
      .map(d => `<option value="${d.id}" ${d.id === currentValue ? 'selected' : ''}>${d.id}</option>`)
      .join('');
}

// Load apps for selected device
async function loadApps() {
  const deviceId = $('#apps-device-select').value;
  
  if (!deviceId) {
    $('#apps-list').innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
        <h3>Select a device</h3>
        <p>Choose a device to view installed apps</p>
      </div>
    `;
    return;
  }
  
  $('#apps-list').innerHTML = `
    <div class="apps-loading">
      <div class="spinner"></div>
      <span>Loading apps...</span>
    </div>
  `;
  
  const result = await window.api.getPackages(deviceId, showSystemApps);
  
  if (result.error) {
    $('#apps-list').innerHTML = `
      <div class="empty-state">
        <p>Error: ${result.error}</p>
      </div>
    `;
    return;
  }
  
  appsList = result.packages;
  renderAppsList();
}

// Render filtered apps list
function renderAppsList() {
  const searchTerm = $('#apps-search').value.toLowerCase();
  
  const filteredApps = appsList.filter(app => {
    const matchesSearch = app.packageName.toLowerCase().includes(searchTerm);
    const matchesFilter = showSystemApps || !app.isSystem;
    return matchesSearch && matchesFilter;
  });
  
  if (filteredApps.length === 0) {
    $('#apps-list').innerHTML = `
      <div class="empty-state">
        <h3>No apps found</h3>
        <p>${appsList.length > 0 ? 'Try adjusting your search or filters' : 'No apps installed'}</p>
      </div>
    `;
    return;
  }
  
  $('#apps-list').innerHTML = `
    <div class="apps-count">${filteredApps.length} apps</div>
  ` + filteredApps.map(app => `
    <div class="app-item ${app.isSystem ? 'system' : ''}" data-package="${app.packageName}">
      <div class="app-icon ${app.isSystem ? 'system' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
        </svg>
      </div>
      <div class="app-info">
        <div class="app-name">${getAppDisplayName(app.packageName)}</div>
        <div class="app-package">${app.packageName}</div>
      </div>
      ${app.isSystem ? '<span class="badge badge-warning">System</span>' : ''}
    </div>
  `).join('');
  
  // Add click handlers
  $$('#apps-list .app-item').forEach(item => {
    item.addEventListener('click', () => showAppDetails(item.dataset.package));
  });
}

// Get display name from package name
function getAppDisplayName(packageName) {
  // Extract last part of package name and format it
  const parts = packageName.split('.');
  const name = parts[parts.length - 1];
  // Convert camelCase or snake_case to Title Case
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s/, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Show app details modal
async function showAppDetails(packageName) {
  selectedApp = packageName;
  
  const modal = $('#app-details-modal');
  modal.style.display = 'flex';
  
  $('#app-details-title').textContent = getAppDisplayName(packageName);
  $('#app-details-content').innerHTML = `
    <div class="apps-loading">
      <div class="spinner"></div>
      <span>Loading details...</span>
    </div>
  `;
  
  const deviceId = $('#apps-device-select').value;
  const result = await window.api.getPackageInfo(deviceId, packageName);
  
  if (result.error) {
    $('#app-details-content').innerHTML = `<p>Error: ${result.error}</p>`;
    return;
  }
  
  const info = result.info;
  
  $('#app-details-content').innerHTML = `
    <div class="app-detail-row">
      <span class="app-detail-label">Package Name</span>
      <span class="app-detail-value mono">${info.packageName}</span>
    </div>
    <div class="app-detail-row">
      <span class="app-detail-label">Version</span>
      <span class="app-detail-value">${info.version || 'Unknown'}</span>
    </div>
    <div class="app-detail-row">
      <span class="app-detail-label">Version Code</span>
      <span class="app-detail-value mono">${info.versionCode || 'Unknown'}</span>
    </div>
    <div class="app-detail-row">
      <span class="app-detail-label">Size</span>
      <span class="app-detail-value">${info.size || 'Unknown'}</span>
    </div>
    <div class="app-detail-row">
      <span class="app-detail-label">Installed</span>
      <span class="app-detail-value">${info.installTime || 'Unknown'}</span>
    </div>
    <div class="app-detail-row">
      <span class="app-detail-label">Type</span>
      <span class="app-detail-value">
        <span class="badge badge-${info.isSystem ? 'warning' : 'success'}">
          ${info.isSystem ? 'System App' : 'User App'}
        </span>
      </span>
    </div>
  `;
  
  // Update uninstall button state
  const uninstallBtn = $('#uninstall-app-btn');
  if (info.isSystem) {
    uninstallBtn.disabled = true;
    uninstallBtn.title = 'Cannot uninstall system apps without root';
  } else {
    uninstallBtn.disabled = false;
    uninstallBtn.title = '';
  }
}

// Close app details modal
$('#close-app-details').addEventListener('click', () => {
  $('#app-details-modal').style.display = 'none';
  selectedApp = null;
});

// Show uninstall confirmation
$('#uninstall-app-btn').addEventListener('click', () => {
  if (!selectedApp) return;
  
  $('#app-details-modal').style.display = 'none';
  $('#uninstall-confirm-modal').style.display = 'flex';
  $('#uninstall-app-name').textContent = getAppDisplayName(selectedApp);
  $('#keep-app-data').checked = false;
});

// Cancel uninstall
$('#cancel-uninstall-btn').addEventListener('click', () => {
  $('#uninstall-confirm-modal').style.display = 'none';
});

// Confirm uninstall
$('#confirm-uninstall-btn').addEventListener('click', async () => {
  if (!selectedApp) return;
  
  const btn = $('#confirm-uninstall-btn');
  btn.disabled = true;
  btn.textContent = 'Uninstalling...';
  
  const deviceId = $('#apps-device-select').value;
  const keepData = $('#keep-app-data').checked;
  
  try {
    const result = await window.api.uninstallPackage(deviceId, selectedApp, keepData);
    
    $('#uninstall-confirm-modal').style.display = 'none';
    
    if (result.success) {
      alert('App uninstalled successfully!');
      // Refresh apps list
      await loadApps();
    } else {
      alert('Error: ' + result.error);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Uninstall';
    selectedApp = null;
  }
});

// Install APK
$('#install-apk-btn').addEventListener('click', async () => {
  const deviceId = $('#apps-device-select').value;
  
  if (!deviceId) {
    alert('Please select a device first');
    return;
  }
  
  const result = await window.api.selectApkFile();
  
  if (result.canceled || !result.path) {
    return;
  }
  
  const btn = $('#install-apk-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px"></div> Installing...';
  
  try {
    const installResult = await window.api.installApk(deviceId, result.path);
    
    if (installResult.success) {
      alert('App installed successfully!');
      // Refresh apps list
      await loadApps();
    } else {
      alert('Error: ' + installResult.error);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Install APK
    `;
  }
});

// Apps device select change
$('#apps-device-select').addEventListener('change', loadApps);

// Refresh apps button
$('#refresh-apps-btn').addEventListener('click', loadApps);

// Search apps
$('#apps-search').addEventListener('input', renderAppsList);

// Toggle system apps
$('#show-system-apps').addEventListener('change', (e) => {
  showSystemApps = e.target.checked;
  
  // If showing system apps and we haven't loaded them yet, reload
  if (showSystemApps && appsList.every(app => !app.isSystem)) {
    loadApps();
  } else {
    renderAppsList();
  }
});

// Close modals when clicking outside
$('#app-details-modal').addEventListener('click', (e) => {
  if (e.target === $('#app-details-modal')) {
    $('#app-details-modal').style.display = 'none';
    selectedApp = null;
  }
});

$('#uninstall-confirm-modal').addEventListener('click', (e) => {
  if (e.target === $('#uninstall-confirm-modal')) {
    $('#uninstall-confirm-modal').style.display = 'none';
  }
});

// ============== Tools Panel ==============

// Section toggle functionality
$$('.tools-section-header').forEach(header => {
  header.addEventListener('click', () => {
    const section = header.closest('.tools-section');
    section.classList.toggle('collapsed');
  });
});

// Helper to check device selection for tools
function requireDevice() {
  if (!selectedDevice) {
    alert('Please select a device first');
    return false;
  }
  return true;
}

// Add line to tools console
function addToolsConsoleLine(type, text) {
  const consoleEl = $('#tools-console-output');
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.textContent = text;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Clear tools console
$('#clear-tools-console-btn').addEventListener('click', () => {
  $('#tools-console-output').innerHTML = '';
});

// === Device & System Tools ===

$('#tool-device-info').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  addToolsConsoleLine('info', '━━━ Device Information ━━━');
  
  const commands = [
    { label: 'Model', cmd: 'shell getprop ro.product.model' },
    { label: 'Manufacturer', cmd: 'shell getprop ro.product.manufacturer' },
    { label: 'Android Version', cmd: 'shell getprop ro.build.version.release' },
    { label: 'SDK Level', cmd: 'shell getprop ro.build.version.sdk' },
    { label: 'Build', cmd: 'shell getprop ro.build.display.id' },
    { label: 'Kernel', cmd: 'shell uname -a' },
  ];
  
  // Run all commands in parallel for speed
  const results = await Promise.all(
    commands.map(({ label, cmd }) => 
      window.api.runAdbCommand(selectedDevice.id, cmd).then(r => ({ label, result: r }))
    )
  );
  
  // Display results in order
  for (const { label, result } of results) {
    addToolsConsoleLine('stdout', `${label}: ${result.stdout.trim()}`);
  }
  
  addToolsConsoleLine('success', '━━━ Done ━━━\n');
});

$('#tool-battery').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  addToolsConsoleLine('info', '━━━ Battery Status ━━━');
  
  const result = await window.api.runAdbCommand(selectedDevice.id, 'shell dumpsys battery');
  if (result.stdout) {
    result.stdout.split('\n').forEach(line => {
      if (line.trim()) addToolsConsoleLine('stdout', line);
    });
  }
  
  addToolsConsoleLine('success', '━━━ Done ━━━\n');
});

$('#tool-storage').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  addToolsConsoleLine('info', '━━━ Storage Usage ━━━');
  
  // Single command for all storage info (faster than multiple calls)
  const result = await window.api.runAdbCommand(selectedDevice.id, 'shell df -h');
  if (result.stdout) {
    result.stdout.split('\n').forEach(line => {
      if (line.trim()) addToolsConsoleLine('stdout', line);
    });
  }
  
  addToolsConsoleLine('success', '━━━ Done ━━━\n');
});

$('#tool-memory').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  addToolsConsoleLine('info', '━━━ Memory Usage ━━━');
  
  const result = await window.api.runAdbCommand(selectedDevice.id, 'shell dumpsys meminfo');
  if (result.stdout) {
    // Show first 50 lines
    const lines = result.stdout.split('\n').slice(0, 50);
    lines.forEach(line => {
      if (line.trim()) addToolsConsoleLine('stdout', line);
    });
    if (result.stdout.split('\n').length > 50) {
      addToolsConsoleLine('info', '... (truncated)');
    }
  }
  
  addToolsConsoleLine('success', '━━━ Done ━━━\n');
});

// === Performance Profiles ===

let currentProfileCommands = [];

$$('.profile-apply-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!requireDevice()) return;
    
    const profileName = btn.dataset.profile;
    btn.disabled = true;
    btn.textContent = 'Generating...';
    
    try {
      const result = await window.api.generateProfilePlan(profileName);
      
      if (result.error) {
        alert('Error: ' + result.error);
        return;
      }
      
      currentProfileCommands = result.commands || [];
      
      // Show commands container
      const container = $('#profile-commands-container');
      container.style.display = 'block';
      
      $('#profile-commands-title').textContent = `${capitalize(profileName)} Profile Commands`;
      $('#profile-commands-desc').textContent = result.description || '';
      
      // Render commands with checkboxes
      $('#profile-commands-list').innerHTML = currentProfileCommands.map((cmd, idx) => `
        <div class="profile-command-item">
          <input type="checkbox" id="profile-cmd-${idx}" checked>
          <label for="profile-cmd-${idx}">${escapeHtml(cmd)}</label>
        </div>
      `).join('');
      
    } finally {
      btn.disabled = false;
      btn.textContent = 'Apply with AI';
    }
  });
});

$('#run-profile-commands-btn').addEventListener('click', async () => {
  if (!requireDevice() || currentProfileCommands.length === 0) return;
  
  const btn = $('#run-profile-commands-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';
  
  addToolsConsoleLine('info', '━━━ Running Profile Commands ━━━');
  
  try {
    for (let i = 0; i < currentProfileCommands.length; i++) {
      const checkbox = $(`#profile-cmd-${i}`);
      if (!checkbox || !checkbox.checked) continue;
      
      const cmd = currentProfileCommands[i];
      addToolsConsoleLine('info', `$ ${cmd}`);
      
      const result = await window.api.runAdbCommand(selectedDevice.id, cmd);
      
      if (result.dangerous) {
        addToolsConsoleLine('stderr', `  ⚠ ${result.blockedReason}`);
      } else {
        if (result.stdout) {
          result.stdout.split('\n').forEach(line => {
            if (line.trim()) addToolsConsoleLine('stdout', `  ${line}`);
          });
        }
        if (result.stderr) {
          result.stderr.split('\n').forEach(line => {
            if (line.trim()) addToolsConsoleLine('stderr', `  ${line}`);
          });
        }
        addToolsConsoleLine(result.exitCode === 0 ? 'success' : 'stderr', 
          `  ${result.exitCode === 0 ? '✓' : '✗'} Exit: ${result.exitCode}`);
      }
    }
    
    addToolsConsoleLine('success', '━━━ Profile Applied ━━━\n');
    
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Selected';
  }
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// === App Quick Actions ===

let toolsPackagesList = [];

$('#load-packages-btn').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  const btn = $('#load-packages-btn');
  btn.disabled = true;
  btn.textContent = 'Loading...';
  
  try {
    const result = await window.api.getPackages(selectedDevice.id, false);
    
    if (result.error) {
      alert('Error: ' + result.error);
      return;
    }
    
    toolsPackagesList = result.packages.map(p => p.packageName);
    
    // Show suggestions
    const container = $('#package-suggestions');
    container.style.display = 'block';
    container.innerHTML = toolsPackagesList.slice(0, 50).map(pkg => `
      <div class="package-suggestion" data-package="${pkg}">${pkg}</div>
    `).join('');
    
    // Add click handlers
    $$('#package-suggestions .package-suggestion').forEach(item => {
      item.addEventListener('click', () => {
        $('#app-action-package').value = item.dataset.package;
        container.style.display = 'none';
      });
    });
    
  } finally {
    btn.disabled = false;
    btn.textContent = 'Load Apps';
  }
});

// Filter suggestions as user types
$('#app-action-package').addEventListener('input', (e) => {
  const filter = e.target.value.toLowerCase();
  const container = $('#package-suggestions');
  
  if (!filter || toolsPackagesList.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  const filtered = toolsPackagesList.filter(p => p.toLowerCase().includes(filter)).slice(0, 20);
  
  if (filtered.length > 0) {
    container.style.display = 'block';
    container.innerHTML = filtered.map(pkg => `
      <div class="package-suggestion" data-package="${pkg}">${pkg}</div>
    `).join('');
    
    $$('#package-suggestions .package-suggestion').forEach(item => {
      item.addEventListener('click', () => {
        $('#app-action-package').value = item.dataset.package;
        container.style.display = 'none';
      });
    });
  } else {
    container.style.display = 'none';
  }
});

$('#tool-open-app').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  const pkg = $('#app-action-package').value.trim();
  if (!pkg) {
    alert('Please enter a package name');
    return;
  }
  
  addToolsConsoleLine('info', `Opening ${pkg}...`);
  
  const result = await window.api.runAdbCommand(selectedDevice.id, 
    `shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
  
  if (result.exitCode === 0) {
    addToolsConsoleLine('success', '✓ App launched');
  } else {
    addToolsConsoleLine('stderr', `✗ Failed: ${result.stderr || result.stdout}`);
  }
});

$('#tool-app-info').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  const pkg = $('#app-action-package').value.trim();
  if (!pkg) {
    alert('Please enter a package name');
    return;
  }
  
  addToolsConsoleLine('info', `Opening settings for ${pkg}...`);
  
  const result = await window.api.runAdbCommand(selectedDevice.id, 
    `shell am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:${pkg}`);
  
  if (result.exitCode === 0) {
    addToolsConsoleLine('success', '✓ App settings opened');
  } else {
    addToolsConsoleLine('stderr', `✗ Failed: ${result.stderr || result.stdout}`);
  }
});

$('#tool-force-stop').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  const pkg = $('#app-action-package').value.trim();
  if (!pkg) {
    alert('Please enter a package name');
    return;
  }
  
  if (!confirm(`Force stop ${pkg}?`)) return;
  
  addToolsConsoleLine('info', `Force stopping ${pkg}...`);
  
  const result = await window.api.runAdbCommand(selectedDevice.id, `shell am force-stop ${pkg}`);
  
  if (result.exitCode === 0) {
    addToolsConsoleLine('success', '✓ App force stopped');
  } else {
    addToolsConsoleLine('stderr', `✗ Failed: ${result.stderr || result.stdout}`);
  }
});

$('#tool-clear-data').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  const pkg = $('#app-action-package').value.trim();
  if (!pkg) {
    alert('Please enter a package name');
    return;
  }
  
  if (!confirm(`Clear all data for ${pkg}? This cannot be undone!`)) return;
  
  addToolsConsoleLine('info', `Clearing data for ${pkg}...`);
  
  const result = await window.api.runAdbCommand(selectedDevice.id, `shell pm clear ${pkg}`);
  
  if (result.stdout.includes('Success')) {
    addToolsConsoleLine('success', '✓ App data cleared');
  } else {
    addToolsConsoleLine('stderr', `✗ Failed: ${result.stderr || result.stdout}`);
  }
});

// === File Browser ===

$('#list-device-files-btn').addEventListener('click', async () => {
  if (!requireDevice()) return;
  
  const path = $('#device-path-input').value.trim() || '/sdcard/';
  const output = $('#device-files-output');
  
  output.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';
  
  const result = await window.api.runAdbCommand(selectedDevice.id, `shell ls -la "${path}"`);
  
  if (result.exitCode === 0 && result.stdout) {
    output.textContent = result.stdout;
  } else {
    output.innerHTML = `<div class="empty-state-small">Error: ${result.stderr || 'Could not list directory'}</div>`;
  }
});

// ============== Logs Panel ==============

let logcatRunning = false;
let logcatAutoScroll = true;
let logLines = [];

// Update logcat device dropdown when devices change
function updateLogcatDeviceDropdown(devices) {
  const select = $('#logcat-device-select');
  const currentValue = select.value;
  
  select.innerHTML = '<option value="">Select a device...</option>' +
    devices
      .filter(d => d.status === 'device')
      .map(d => `<option value="${d.id}" ${d.id === currentValue ? 'selected' : ''}>${d.id}</option>`)
      .join('');
}

$('#start-logcat-btn').addEventListener('click', async () => {
  const deviceId = $('#logcat-device-select').value;
  
  if (!deviceId) {
    alert('Please select a device first');
    return;
  }
  
  logcatRunning = true;
  logLines = [];
  
  // Update UI
  $('#start-logcat-btn').disabled = true;
  $('#stop-logcat-btn').disabled = false;
  $('#logcat-status').textContent = 'Running';
  $('#logcat-status').className = 'logcat-status running';
  $('#logcat-output').innerHTML = '';
  $('#log-line-count').textContent = '0 lines';
  
  // Setup listener
  window.api.onLogcatLine((line) => {
    logLines.push(line);
    appendLogLine(line);
    $('#log-line-count').textContent = `${logLines.length} lines`;
  });
  
  // Start logcat
  const filter = $('#logcat-package-filter').value.trim();
  await window.api.startLogcat(deviceId, filter);
});

$('#stop-logcat-btn').addEventListener('click', async () => {
  await window.api.stopLogcat();
  window.api.removeLogcatListener();
  
  logcatRunning = false;
  
  // Update UI
  $('#start-logcat-btn').disabled = false;
  $('#stop-logcat-btn').disabled = true;
  $('#logcat-status').textContent = 'Stopped';
  $('#logcat-status').className = 'logcat-status stopped';
});

function appendLogLine(line) {
  const viewer = $('#logcat-output');
  const filterText = $('#logcat-filter-text').value.toLowerCase();
  const levelFilter = $('#logcat-level-filter').value;
  
  // Apply filters
  if (filterText && !line.toLowerCase().includes(filterText)) {
    return;
  }
  
  // Extract log level (format: date time pid tid level tag: message)
  const levelMatch = line.match(/^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+([VDIWEF])\s/);
  const level = levelMatch ? levelMatch[1] : '';
  
  if (levelFilter && level && level !== levelFilter) {
    return;
  }
  
  const lineEl = document.createElement('div');
  lineEl.className = `log-line ${level}`;
  lineEl.textContent = line;
  viewer.appendChild(lineEl);
  
  // Auto scroll
  if (logcatAutoScroll) {
    viewer.scrollTop = viewer.scrollHeight;
  }
}

// Re-filter on filter change
$('#logcat-filter-text').addEventListener('input', refilterLogs);
$('#logcat-level-filter').addEventListener('change', refilterLogs);

function refilterLogs() {
  const viewer = $('#logcat-output');
  viewer.innerHTML = '';
  
  logLines.forEach(line => appendLogLine(line));
}

$('#clear-logcat-btn').addEventListener('click', () => {
  logLines = [];
  $('#logcat-output').innerHTML = '';
  $('#log-line-count').textContent = '0 lines';
});

$('#scroll-logcat-btn').addEventListener('click', () => {
  logcatAutoScroll = !logcatAutoScroll;
  $('#scroll-logcat-btn').classList.toggle('active', logcatAutoScroll);
  
  if (logcatAutoScroll) {
    $('#logcat-output').scrollTop = $('#logcat-output').scrollHeight;
  }
});

// ============== Settings ==============

async function loadSettings() {
  const settings = await window.api.getSettings();
  $('#settings-llm-url').value = settings.llmBaseUrl || '';
  $('#settings-llm-model').value = settings.llmModel || '';
}

$('#save-settings-btn').addEventListener('click', async () => {
  const settings = {
    llmBaseUrl: $('#settings-llm-url').value.trim(),
    llmModel: $('#settings-llm-model').value.trim()
  };
  
  await window.api.saveSettings(settings);
  showStatus('settings-status', 'Settings saved successfully!', 'success');
});

$('#test-llm-btn').addEventListener('click', async () => {
  const btn = $('#test-llm-btn');
  btn.disabled = true;
  btn.textContent = 'Testing...';
  
  try {
    const result = await window.api.testLlm();
    showStatus('settings-status', result.message, result.success ? 'success' : 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
});

function showStatus(elementId, message, type) {
  const el = $(`#${elementId}`);
  el.textContent = message;
  el.className = `status-message ${type}`;
  el.style.display = 'block';
  
  setTimeout(() => {
    el.style.display = 'none';
  }, 5000);
}

// ============== Utilities ==============

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============== Initialize ==============

document.addEventListener('DOMContentLoaded', () => {
  startDeviceRefresh();
  loadWorkspaces();
  loadSettings();
});

