/**
 * Kernel Module - Handles kernel workspace file operations
 */

const fs = require('fs');
const path = require('path');

/**
 * Get the path to kernel workspaces directory
 */
function getWorkspacesPath(isPackaged, electronDir) {
  if (isPackaged) {
    // In production, use app data directory
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'kernel_workspaces');
  } else {
    // In development, use project directory
    return path.join(electronDir, '..', 'kernel', 'workspaces');
  }
}

/**
 * List all kernel workspaces
 */
function listWorkspaces(workspacesPath) {
  try {
    if (!fs.existsSync(workspacesPath)) {
      fs.mkdirSync(workspacesPath, { recursive: true });
    }
    
    const items = fs.readdirSync(workspacesPath, { withFileTypes: true });
    const workspaces = items
      .filter(item => item.isDirectory() && !item.name.startsWith('.'))
      .map(item => ({
        name: item.name,
        path: path.join(workspacesPath, item.name)
      }));
    
    return { workspaces, error: null };
  } catch (error) {
    return { workspaces: [], error: error.message };
  }
}

/**
 * List files in a workspace directory
 */
function listFiles(workspacesPath, workspace, relativePath = '') {
  try {
    const targetPath = relativePath 
      ? path.join(workspacesPath, workspace, relativePath)
      : path.join(workspacesPath, workspace);
    
    if (!fs.existsSync(targetPath)) {
      return { files: [], error: 'Directory not found' };
    }
    
    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const files = items
      .filter(item => !item.name.startsWith('.') && item.name !== '__pycache__' && item.name !== 'node_modules')
      .map(item => ({
        name: item.name,
        path: relativePath ? path.join(relativePath, item.name) : item.name,
        isDir: item.isDirectory()
      }))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDir !== b.isDir) return b.isDir - a.isDir;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
    
    return { files, error: null };
  } catch (error) {
    return { files: [], error: error.message };
  }
}

/**
 * Read a file from workspace
 */
function readFile(workspacesPath, workspace, filePath) {
  try {
    const fullPath = path.join(workspacesPath, workspace, filePath);
    
    // Security check - ensure path is within workspace
    const resolvedPath = path.resolve(fullPath);
    const workspaceRoot = path.resolve(workspacesPath, workspace);
    if (!resolvedPath.startsWith(workspaceRoot)) {
      return { content: '', error: 'Invalid path: access denied' };
    }
    
    if (!fs.existsSync(fullPath)) {
      return { content: '', error: 'File not found' };
    }
    
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return { content: '', error: 'Cannot read directory' };
    }
    
    // Check if binary
    const buffer = Buffer.alloc(8192);
    const fd = fs.openSync(fullPath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
    fs.closeSync(fd);
    
    if (buffer.slice(0, bytesRead).includes(0)) {
      return { content: '', error: 'Cannot display binary file' };
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    return { content, error: null };
  } catch (error) {
    return { content: '', error: error.message };
  }
}

/**
 * Write file with backup
 */
function writeFileWithBackup(workspacesPath, workspace, filePath, content) {
  try {
    const fullPath = path.join(workspacesPath, workspace, filePath);
    
    // Security check
    const resolvedPath = path.resolve(fullPath);
    const workspaceRoot = path.resolve(workspacesPath, workspace);
    if (!resolvedPath.startsWith(workspaceRoot)) {
      return { backupPath: '', error: 'Invalid path: access denied' };
    }
    
    // Create backup if file exists
    let backupPath = '';
    if (fs.existsSync(fullPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupName = `${path.basename(filePath)}.bak.${timestamp}`;
      backupPath = path.join(path.dirname(fullPath), backupName);
      
      const originalContent = fs.readFileSync(fullPath, 'utf8');
      fs.writeFileSync(backupPath, originalContent);
      
      // Make backup path relative
      backupPath = path.relative(path.join(workspacesPath, workspace), backupPath);
    }
    
    // Write new content
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    
    return { 
      backupPath: backupPath || 'No backup (new file)', 
      error: null 
    };
  } catch (error) {
    return { backupPath: '', error: error.message };
  }
}

/**
 * Generate unified diff between two strings
 */
function generateDiff(oldContent, newContent, filePath = 'file') {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  const diff = [];
  diff.push(`--- a/${filePath}`);
  diff.push(`+++ b/${filePath}`);
  
  // Simple line-by-line diff
  const maxLen = Math.max(oldLines.length, newLines.length);
  let inHunk = false;
  let hunkStart = 0;
  let hunkLines = [];
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (oldLine === newLine) {
      if (inHunk) {
        hunkLines.push(` ${oldLine || ''}`);
      }
    } else {
      if (!inHunk) {
        inHunk = true;
        hunkStart = i + 1;
        // Add context before
        for (let j = Math.max(0, i - 3); j < i; j++) {
          hunkLines.push(` ${oldLines[j] || ''}`);
        }
      }
      
      if (oldLine !== undefined && (newLine === undefined || oldLine !== newLine)) {
        hunkLines.push(`-${oldLine}`);
      }
      if (newLine !== undefined && (oldLine === undefined || oldLine !== newLine)) {
        hunkLines.push(`+${newLine}`);
      }
    }
  }
  
  if (hunkLines.length > 0) {
    diff.push(`@@ -${hunkStart},${oldLines.length} +${hunkStart},${newLines.length} @@`);
    diff.push(...hunkLines);
  }
  
  return diff.join('\n');
}

module.exports = {
  getWorkspacesPath,
  listWorkspaces,
  listFiles,
  readFile,
  writeFileWithBackup,
  generateDiff
};

