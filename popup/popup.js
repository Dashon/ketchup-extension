/**
 * Ketchup Capture — Popup Controller
 *
 * Manages the UI state machine and coordinates with the
 * background service worker to start/stop recording.
 *
 * States: idle → recording → uploading → done | error
 */

// ─── Configuration ───
const API_BASE = {
  local: "http://localhost:3003",
  production: "https://app.gitketchup.com",
};
const CAPTURES_ENDPOINT = "/api/captures";

// Auth State cache
let currentAuth = null;

// ─── DOM References ───
const states = {
  idle: document.getElementById("state-idle"),
  recording: document.getElementById("state-recording"),
  uploading: document.getElementById("state-uploading"),
  done: document.getElementById("state-done"),
  error: document.getElementById("state-error"),
};

const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnNew = document.getElementById("btn-new");
const btnRetry = document.getElementById("btn-retry");
const btnView = document.getElementById("btn-view");
const timerEl = document.getElementById("timer");
const eventCountEl = document.getElementById("event-count");
const recordingUrlEl = document.getElementById("recording-url");
const doneSummaryEl = document.getElementById("done-summary");
const errorMessageEl = document.getElementById("error-message");

let timerInterval = null;
let recordingStartTime = null;

// ─── State Machine ───
function showState(stateName) {
  Object.values(states).forEach((el) => el.classList.remove("active"));
  states[stateName].classList.add("active");
}

// ─── Initialize ───
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Check if we have synced Ketchup credentials
  currentAuth = await getAuthCredentials();
  
  if (!currentAuth) {
    // If no credentials, we literally can't upload. Force them to sync.
    btnStart.disabled = true;
    btnStart.style.opacity = "0.3";
    btnStart.title = "Please click 'Start Manual Capture' in your Ketchup Workspace to sync credentials.";
    showError("Workspace not connected. Open your Ketchup project, click 'New Capture' → 'Start manual session' to link this extension.");
    return;
  }

  // 2. Check if we're currently recording (popup reopened mid-session)
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (response?.isRecording) {
    showState("recording");
    recordingStartTime = response.startTime;
    startTimer();
    updateRecordingUrl();
    eventCountEl.textContent = response.eventCount || 0;
  }
});

function getAuthCredentials() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["ketchupAuth"], (result) => {
      resolve(result.ketchupAuth || null);
    });
  });
}

// ─── Start Recording ───
btnStart.addEventListener("click", async () => {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab found");
    }

    // Tell the background to inject and start
    const response = await chrome.runtime.sendMessage({
      type: "START_RECORDING",
      tabId: tab.id,
    });

    if (!response.ok) {
      throw new Error(response.error || "Failed to start recording");
    }

    // Transition UI
    recordingStartTime = Date.now();
    showState("recording");
    startTimer();

    // Show the current URL
    recordingUrlEl.textContent = new URL(tab.url).hostname;
  } catch (err) {
    showError(err.message);
  }
});

// ─── Stop Recording ───
btnStop.addEventListener("click", async () => {
  try {
    showState("uploading");
    stopTimer();

    const response = await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
    if (!response.ok) {
      throw new Error(response.error || "Failed to stop recording");
    }

    // The events will arrive asynchronously via EVENTS_READY message
  } catch (err) {
    showError(err.message);
  }
});

// ─── Listen for events from background ───
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "EVENTS_READY") {
    handleEventsReady(message.events, message.metadata);
  }
});

/**
 * Handle the assembled events — upload to Ketchup API using synced credentials.
 */
async function handleEventsReady(events, metadata) {
  try {
    if (!currentAuth) {
      throw new Error("Missing Ketchup Auth credentials. Cannot upload.");
    }

    const payload = {
      projectId: currentAuth.projectId,
      events,
      metadata: {
        ...metadata,
        capturedAt: new Date().toISOString(),
        source: "chrome-extension",
        version: chrome.runtime.getManifest().version,
      },
    };

    const baseUrl = API_BASE[currentAuth.environment] || API_BASE.production;
    const url = `${baseUrl}${CAPTURES_ENDPOINT}`;

    console.log(`[Ketchup Capture] 🚀 Uploading ${events.length} events to ${url}...`);

    const res = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${currentAuth.token}` 
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Ketchup Capture] Upload failed:", res.status, errorText);
      throw new Error(`Upload Failed (${res.status}): ${errorText.substring(0, 50)}...`);
    }

    const data = await res.json();
    console.log("[Ketchup Capture] ✅ Upload success:", data);

    // Relay captureId back to web app via content scripts
    // This triggers KETCHUP_RECORDING_COMPLETE in the auth-bridge
    const captureId = data.captureId || null;
    chrome.runtime.sendMessage({
      type: "UPLOAD_COMPLETE",
      captureId: String(captureId),
      durationMs: metadata.duration || 0,
    });

    // Link directly to the capture in the registry
    btnView.href = `${baseUrl}/catchup/${currentAuth.projectId}/captures`;

    // Show success
    const durationSec = Math.round(metadata.duration / 1000);
    doneSummaryEl.textContent = `${events.length} events · ${durationSec}s`;
    showState("done");
  } catch (err) {
    // Relay error to web app via content scripts
    chrome.runtime.sendMessage({
      type: "UPLOAD_ERROR",
      error: err.message,
    });
    showError(err.message);
  }
}

// ─── New Capture / Retry ───
btnNew.addEventListener("click", () => {
  showState("idle");
});
btnRetry.addEventListener("click", () => {
  showState("idle");
});

// ─── Timer ───
function startTimer() {
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimer() {
  if (!recordingStartTime) return;
  const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  timerEl.textContent = `${mins}:${secs}`;
}

async function updateRecordingUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      recordingUrlEl.textContent = new URL(tab.url).hostname;
    }
  } catch {
    // silently fail
  }
}

// ─── Error Handler ───
function showError(message) {
  stopTimer();
  errorMessageEl.textContent = message;
  showState("error");
}
