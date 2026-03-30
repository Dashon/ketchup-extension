/**
 * Ketchup Capture — Popup Controller
 *
 * Manages the UI state machine and coordinates with the
 * background service worker to start/stop recording.
 *
 * States: idle → recording → uploading → done | error
 */

// ─── Configuration ───
const KETCHUP_API_BASE = "https://ketchup-webapp.vercel.app"; // TODO: env-based config
const CAPTURES_ENDPOINT = "/api/captures";

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
  // Check if we're currently recording (popup may have been closed and reopened)
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (response?.isRecording) {
    showState("recording");
    recordingStartTime = response.startTime;
    startTimer();
    updateRecordingUrl();
  }
});

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
 * Handle the captured events — upload to Ketchup API.
 */
async function handleEventsReady(events, metadata) {
  try {
    const payload = {
      events,
      metadata: {
        ...metadata,
        capturedAt: new Date().toISOString(),
        source: "chrome-extension",
        version: chrome.runtime.getManifest().version,
      },
    };

    // ── Upload to Ketchup API ──
    // For now, log to console. When the API endpoint is live, uncomment the fetch.
    console.log("[Ketchup Capture] 📦 Payload ready:", {
      eventCount: events.length,
      durationMs: metadata.duration,
      url: metadata.url,
      payloadSizeKb: Math.round(JSON.stringify(payload).length / 1024),
    });
    console.log("[Ketchup Capture] 📋 Full payload (paste into API test):", JSON.stringify(payload));

    /*
    const res = await fetch(`${KETCHUP_API_BASE}${CAPTURES_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`API returned ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    btnView.href = `${KETCHUP_API_BASE}/catchup/${data.projectId}/captures`;
    */

    // Show success
    const durationSec = Math.round(metadata.duration / 1000);
    doneSummaryEl.textContent = `${events.length} events · ${durationSec}s`;
    showState("done");
  } catch (err) {
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
