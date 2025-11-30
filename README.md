# Android Kernel AI Dashboard

A **portable desktop app** for managing Android devices via ADB with AI assistance.

**Single .exe file** - No installation required, no Python, no Node.js on user machine.

---

## Features

- **Device Panel** - Auto-detects connected Android devices every 2 seconds
- **AI Command Center** - Natural language commands converted to safe execution plans
- **Kernel Editor** - Browse and edit kernel files with AI assistance
- **100% Local** - All AI requests go to your local LLM (Ollama, LM Studio)
- **Safety First** - Dangerous commands are blocked automatically

---

## Quick Start (End User)

1. **Download** the `Android Kernel AI Dashboard.exe` from releases
2. **Download ADB** from [Android Platform Tools](https://developer.android.com/studio/releases/platform-tools)
3. **Place ADB files** in the same folder as the .exe (or it will use bundled ones)
4. **Run the .exe** - No installation needed!
5. **Start Ollama** (or another local LLM) for AI features

That's it! The app runs completely standalone.

---

## Build From Source

### Prerequisites

- Node.js 18+ installed
- npm (comes with Node.js)

### Setup

```powershell
# Clone or download this folder
cd android-kernel-ai-dashboard

# Install dependencies
npm install

# Download ADB binaries and place in electron/adb/
# - adb.exe
# - AdbWinApi.dll
# - AdbWinUsbApi.dll
```

### Run in Development

```powershell
npm start
```

### Build Portable .exe

```powershell
npm run build
```

This creates: `dist/Android Kernel AI Dashboard.exe`

The .exe is fully portable and includes:
- Bundled Node.js runtime
- Bundled ADB binaries
- All application code

---

## Project Structure

```
android-kernel-ai-dashboard/
├── electron/
│   ├── main.js          # Electron main process
│   ├── preload.js       # IPC bridge
│   ├── renderer/
│   │   ├── index.html   # UI layout
│   │   ├── ui.js        # UI logic
│   │   └── style.css    # Styling
│   └── adb/             # ADB binaries go here
│       ├── adb.exe
│       ├── AdbWinApi.dll
│       └── AdbWinUsbApi.dll
├── ai/
│   └── ai.js            # Local LLM client
├── kernel/
│   ├── kernel.js        # File operations
│   └── workspaces/      # Kernel source folders
├── package.json
└── README.md
```

---

## Local LLM Setup

The app requires a local LLM server for AI features.

### Option 1: Ollama (Recommended)

```powershell
# Install Ollama from https://ollama.ai
# Then run:
ollama pull llama2
ollama serve
```

Default endpoint: `http://localhost:11434/v1`

### Option 2: LM Studio

1. Install from https://lmstudio.ai
2. Download a model (e.g., CodeLlama, Mistral)
3. Start the local server
4. Update endpoint in Settings

---

## Usage Guide

### 1. Connect Your Device

1. Enable USB Debugging on your Android device
2. Connect via USB
3. The app auto-detects devices every 2 seconds
4. Click a device to select it

### 2. AI Commands

1. Select a device
2. Type what you want to do:
   - "Check battery stats"
   - "Show CPU frequency"
   - "Generate performance tweaks"
3. Click "Generate AI Plan"
4. Review the steps and commands
5. Uncheck any commands you don't want
6. Click "Execute Selected"

### 3. Kernel Editor

1. Place kernel source in `kernel/workspaces/YOUR_DEVICE/`
2. Select the workspace
3. Browse to a file (defconfig, Kconfig, etc.)
4. Enter an AI instruction:
   - "Optimize for battery life"
   - "Enable this feature"
5. Review the diff
6. Click "Apply Changes"

---

## Safety Features

The app automatically blocks dangerous commands:

- `fastboot flash` - Flashing partitions
- `dd if=` / `dd of=` - Raw disk operations
- `/dev/block/*` - Block device access
- `format` / `wipe` - Data destruction

These commands are shown but cannot be executed through the app.

---

## Troubleshooting

### "No devices connected"
- Enable USB Debugging in Developer Options
- Try different USB cable/port
- Run `adb devices` in terminal to verify

### "Cannot connect to LLM"
- Make sure Ollama is running (`ollama serve`)
- Check the endpoint URL in Settings
- Verify model name is correct

### App won't start
- Make sure ADB files are in the correct location
- Try running as Administrator

---

## License

MIT License - Free for personal and commercial use.

---

**Note**: This tool is for advanced users. Always review commands before executing. Keep backups of important data.
