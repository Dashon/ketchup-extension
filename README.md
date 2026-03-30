# Ketchup Chrome Extension

A Chrome Extension (Manifest V3) for manually capturing DOM mutations and user interactions using [rrweb](https://github.com/rrweb-io/rrweb). This is the human fallback mechanism for when the autonomous Ketchup AI agent cannot access a specific app flow.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build the content script bundle
npm run build

# 3. Load in Chrome
#    → Go to chrome://extensions
#    → Enable "Developer mode"
#    → Click "Load unpacked"
#    → Select this `ketchup-extension/` directory
```

## How It Works

1. **Click the extension icon** → Opens the Ketchup Capture popup
2. **Click "Start Capture"** → Injects rrweb into the active tab
3. **Navigate your app** → rrweb silently records all DOM mutations, clicks, scrolls, and inputs
4. **Click "Stop & Upload"** → Sends the structured JSON event payload to the Ketchup API
5. **View in Captures Registry** → The capture appears in your workspace's Captures page

## Architecture

```
popup/popup.js          ← UI state machine (idle → recording → uploading → done)
    ↕ chrome.runtime.sendMessage
src/background.js       ← Service worker (manages state, injects content script)
    ↕ chrome.tabs.sendMessage
src/content.js          ← rrweb recorder (injected into active tab)
    ↕ MutationObserver
[Target Web App DOM]    ← The page being captured
```

## File Structure

```
ketchup-extension/
├── manifest.json          # Chrome Extension Manifest V3
├── package.json           # Dependencies (rrweb, esbuild)
├── scripts/build.js       # esbuild bundler for content script
├── src/
│   ├── background.js      # Service worker
│   └── content.js         # rrweb injector (bundled → dist/)
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Dark-themed styles
│   └── popup.js           # Popup controller
├── icons/                 # Extension icons
└── dist/                  # Built output (gitignored)
    └── content.bundle.js  # Bundled content script
```

## Development

The content script (`src/content.js`) uses ES module imports for rrweb. It must be bundled before loading the extension:

```bash
npm run build
```

After changes, reload the extension in `chrome://extensions` to pick up the new bundle.

## API Integration

Currently, captured events are logged to the browser console. To enable real uploads, uncomment the `fetch` block in `popup/popup.js` and set `KETCHUP_API_BASE` to your deployment URL.
