/**
 * Ketchup Capture — Extension Content Script (Web App Bridge)
 * 
 * Automatically injected into the Ketchup Webapp domain.
 * Implements the EXTENSION_PROTOCOL to communicate with the web app UI.
 */

// 1. Inject DOM Marker for immediate detection
const meta = document.createElement("meta");
meta.name = "ketchup-extension";
meta.content = "installed";
meta.dataset.version = chrome.runtime.getManifest().version;
document.head.appendChild(meta);

// 2. Allowed origins
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3003",
  "https://ketchup-webapp.vercel.app",
  "https://app.gitketchup.com"
];

// 3. Message Listener
window.addEventListener("message", (event) => {
  if (!ALLOWED_ORIGINS.includes(event.origin)) return;
  if (!event.data || !event.data.type) return;

  const { type, payload } = event.data;

  // ----------------------------------------------------------------
  // PING / PONG (Fallback Detection)
  // ----------------------------------------------------------------
  if (type === "KETCHUP_PING") {
    window.postMessage({
      type: "KETCHUP_PONG",
      payload: {
        version: chrome.runtime.getManifest().version,
        capabilities: ["rrweb"]
      }
    }, event.origin);
    return;
  }

  // ----------------------------------------------------------------
  // AUTH SYNC
  // ----------------------------------------------------------------
  if (type === "KETCHUP_AUTH_SYNC" && payload) {
    const { projectId, token, environment } = payload;
    
    if (!projectId || !token) {
      window.postMessage({
        type: "KETCHUP_AUTH_ACK",
        payload: { success: false, error: "Missing projectId or token" }
      }, event.origin);
      return;
    }

    // Save to extension storage
    chrome.storage.local.set({
      ketchupAuth: {
        projectId,
        token,
        environment: environment || "production",
        syncedAt: Date.now()
      }
    }, () => {
      console.log(`[Ketchup Extension] 🔑 Magic Auth Sync successful for Project: ${projectId}`);
      window.postMessage({
        type: "KETCHUP_AUTH_ACK",
        payload: { success: true }
      }, event.origin);
    });
    return;
  }

  // ----------------------------------------------------------------
  // SESSION CONTROLS
  // ----------------------------------------------------------------
  if (type === "KETCHUP_STOP_RECORDING") {
    // Relay to background script
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
    return;
  }

  if (type === "KETCHUP_CANCEL_RECORDING") {
    // Relay cancel to background script (if background script supports it)
    chrome.runtime.sendMessage({ type: "CANCEL_RECORDING" });
    
    // Also notify the web app immediately
    window.postMessage({
      type: "KETCHUP_RECORDING_ERROR",
      payload: { error: "Cancelled by user", code: "cancelled" }
    }, event.origin);
    return;
  }
});

// 4. Listen for Background Script events to relay to Web App
chrome.runtime.onMessage.addListener((message) => {
  // Translate background events to web app events
  if (message.type === "RECORDING_STATUS") {
    window.postMessage({
      type: "KETCHUP_RECORDING_STATUS",
      payload: { 
        recording: message.isRecording,
        durationMs: message.durationMs || 0
      }
    }, window.location.origin);
  }
  
  if (message.type === "UPLOAD_COMPLETE") {
    window.postMessage({
      type: "KETCHUP_RECORDING_COMPLETE",
      payload: {
        captureId: message.captureId,
        type: "rrweb",
        durationMs: message.durationMs || 0
      }
    }, window.location.origin);
  }
  
  if (message.type === "UPLOAD_ERROR") {
    window.postMessage({
      type: "KETCHUP_RECORDING_ERROR",
      payload: {
        error: message.error || "Upload failed",
        code: "upload_failed"
      }
    }, window.location.origin);
  }
});

console.log("[Ketchup Extension] 🌉 Bridge active (v" + chrome.runtime.getManifest().version + ")");
