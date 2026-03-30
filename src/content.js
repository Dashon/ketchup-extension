/**
 * Ketchup Capture — Content Script (Streaming Architecture)
 *
 * Injected into any active tab while tracking is enabled.
 * Uses rrweb to record all DOM mutations, buffering them into small 1-second
 * chunks and streaming them to the background service worker to prevent
 * data loss if the user navigates away or closes the tab.
 */

import { record } from "rrweb";

let stopFn = null;
let eventBuffer = [];
let streamInterval = null;

// Listen for START/STOP commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START") {
    startRecording();
    sendResponse({ ok: true });
  }

  if (message.type === "STOP") {
    stopRecording();
    sendResponse({ ok: true });
  }

  return false;
});

/**
 * Identify if we missed the start signal due to a fresh page load.
 * We ping the background worker to see if a recording is currently active.
 */
chrome.runtime.sendMessage({ type: "CHECK_RECORDING_STATUS" }, (response) => {
  if (response && response.isRecording) {
    console.log("[Ketchup Capture] 🔄 Re-attaching recorder to new page context...");
    startRecording();
  }
});

function startRecording() {
  if (stopFn) return; // Already recording in this context

  eventBuffer = [];

  stopFn = record({
    emit(event) {
      eventBuffer.push(event);
    },
    checkoutEveryNms: 10000,       // Full DOM snapshot every 10s
    blockClass: "ketchup-ignore",
    maskAllInputs: false,
    recordCanvas: true,
    recordCrossOriginIframes: false,
    sampling: {
      mousemove: 50,
      mouseInteraction: true,
      scroll: 150,
      input: "last",
    },
  });

  // Flush buffer to background worker every 1 second
  streamInterval = setInterval(flushBuffer, 1000);

  console.log("[Ketchup Capture] 🔴 Recording started — Streaming DOM mutations.");
}

function stopRecording() {
  if (stopFn) {
    stopFn();
    stopFn = null;
  }

  if (streamInterval) {
    clearInterval(streamInterval);
    streamInterval = null;
  }

  // Flush any remaining events one last time
  flushBuffer(true);
  console.log(`[Ketchup Capture] ⏹ Recording stopped gracefully on this tab.`);
}

/**
 * Sends the current buffer to the background service worker.
 */
function flushBuffer(isFinal = false) {
  if (eventBuffer.length === 0 && !isFinal) return;

  const payload = [...eventBuffer];
  eventBuffer = []; // Reset local buffer eagerly

  chrome.runtime.sendMessage({
    type: "STREAM_EVENTS_CHUNK",
    events: payload,
    url: window.location.href,
    title: document.title,
    isFinal,
  });
}

