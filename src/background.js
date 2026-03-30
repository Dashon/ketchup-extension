/**
 * Ketchup Capture — Background Service Worker
 *
 * Manages recording state and coordinates message passing
 * between the popup UI and the content script injected into the active tab.
 */

// Recording state
let recordingState = {
  isRecording: false,
  tabId: null,
  startTime: null,
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "START_RECORDING":
      handleStartRecording(message.tabId).then(sendResponse);
      return true; // async response

    case "STOP_RECORDING":
      handleStopRecording().then(sendResponse);
      return true;

    case "GET_STATE":
      sendResponse({ ...recordingState });
      return false;

    case "EVENTS_CAPTURED":
      // Content script finished collecting — relay to popup
      chrome.runtime.sendMessage({
        type: "EVENTS_READY",
        events: message.events,
        metadata: {
          url: message.url,
          title: message.title,
          duration: Date.now() - (recordingState.startTime || Date.now()),
        },
      });
      recordingState = { isRecording: false, tabId: null, startTime: null };
      sendResponse({ ok: true });
      return false;

    default:
      return false;
  }
});

/**
 * Inject content script and start rrweb recording in the active tab.
 */
async function handleStartRecording(tabId) {
  try {
    // Inject the bundled content script (rrweb + recorder logic)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content.bundle.js"],
    });

    // Tell the content script to start
    await chrome.tabs.sendMessage(tabId, { type: "START" });

    recordingState = {
      isRecording: true,
      tabId,
      startTime: Date.now(),
    };

    // Update the extension icon badge
    await chrome.action.setBadgeText({ text: "REC" });
    await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });

    return { ok: true };
  } catch (err) {
    console.error("[Ketchup] Failed to start recording:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * Signal the content script to stop recording and collect events.
 */
async function handleStopRecording() {
  try {
    if (!recordingState.tabId) {
      return { ok: false, error: "No active recording" };
    }

    // Tell content script to stop and send events back
    await chrome.tabs.sendMessage(recordingState.tabId, { type: "STOP" });

    // Clear the badge
    await chrome.action.setBadgeText({ text: "" });

    return { ok: true };
  } catch (err) {
    console.error("[Ketchup] Failed to stop recording:", err);
    return { ok: false, error: err.message };
  }
}
