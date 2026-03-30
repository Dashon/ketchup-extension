/**
 * Ketchup Capture — Content Script
 *
 * Injected into the active tab by the background service worker.
 * Uses rrweb to record all DOM mutations, user interactions,
 * mouse movements, and scroll events as structured JSON events.
 *
 * This file is bundled by esbuild (scripts/build.js) into dist/content.bundle.js
 * so that rrweb is included inline.
 */

import { record } from "rrweb";

let stopFn = null;
let events = [];

/**
 * Listen for START/STOP commands from the background service worker.
 */
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
 * Initialize rrweb recording.
 *
 * rrweb.record() sets up MutationObservers and event listeners on the page.
 * Every DOM change, click, scroll, input, etc. is captured as a typed event
 * object with a timestamp. These events can later be replayed pixel-perfectly.
 */
function startRecording() {
  events = []; // Reset buffer

  stopFn = record({
    emit(event) {
      events.push(event);
    },
    // Capture options
    checkoutEveryNms: 10000,       // Full DOM snapshot every 10s for safety
    blockClass: "ketchup-ignore",  // CSS class to exclude sensitive elements
    maskAllInputs: false,          // Don't mask — we need the real UI state
    recordCanvas: true,            // Capture canvas elements (charts, etc.)
    recordCrossOriginIframes: false, // Skip cross-origin iframes
    sampling: {
      mousemove: 50,    // Sample mouse position every 50ms
      mouseInteraction: true,
      scroll: 150,      // Sample scroll events every 150ms
      input: "last",    // Only capture the final input value
    },
  });

  console.log("[Ketchup Capture] 🔴 Recording started — DOM mutations are being captured.");
}

/**
 * Stop recording, collect events, and send them back to the extension.
 */
function stopRecording() {
  if (stopFn) {
    stopFn(); // rrweb cleanup — removes observers and listeners
    stopFn = null;
  }

  console.log(`[Ketchup Capture] ⏹ Recording stopped — ${events.length} events captured.`);

  // Send the event payload back to the background service worker
  chrome.runtime.sendMessage({
    type: "EVENTS_CAPTURED",
    events: events,
    url: window.location.href,
    title: document.title,
  });

  events = []; // Clear buffer
}
