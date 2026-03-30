/**
 * Ketchup Capture — Background Service Worker
 *
 * Orchestrates multi-tab session recording.
 * Maintains the master `masterEvents` array and auto-injects the content script
 * into new pages whenever a recording session is active.
 */

// Master Session State
let masterSession = {
  isRecording: false,
  startTime: null,
  startUrl: null,
  events: [],       // The combined rrweb stream
  activeTabs: new Set(),
};

// ─── Message Handling ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "GET_STATE":
      // Let the popup know we are capturing, how long, and how many events we hold
      sendResponse({ 
        isRecording: masterSession.isRecording, 
        startTime: masterSession.startTime,
        eventCount: masterSession.events.length
      });
      return false;

    case "CHECK_RECORDING_STATUS":
      // A new page loaded and its content script wants to know if it should record
      if (masterSession.isRecording && sender.tab) {
        masterSession.activeTabs.add(sender.tab.id);
        sendResponse({ isRecording: true });
      } else {
        sendResponse({ isRecording: false });
      }
      return false;

    case "START_RECORDING":
      handleStartRecording(message.tabId).then(sendResponse);
      return true; // async

    case "STOP_RECORDING":
      handleStopRecording().then(sendResponse);
      return true; // async

    case "STREAM_EVENTS_CHUNK":
      // Append the streamed 1s chunk to the master array
      if (masterSession.isRecording) {
        masterSession.events.push(...message.events);
      }
      return false;

    default:
      return false;
  }
});

// ─── Auto-Injection on Navigation ───
// If the user clicks a link and ruins the current DOM context, we inject again!
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (masterSession.isRecording && changeInfo.status === "complete") {
    // Inject the recorder into the newly loaded page
    // Note: Chrome restricts script injection on some URLs (chrome://, chrome-extension://)
    if (tab.url && !tab.url.startsWith("chrome://")) {
      try {
         await chrome.scripting.executeScript({
          target: { tabId },
          files: ["dist/content.bundle.js"],
        });
        masterSession.activeTabs.add(tabId);
      } catch (e) {
        console.warn("[Ketchup Capture] Could not auto-inject into tab", tabId, e.message);
      }
    }
  }
});

// Clean up dead tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  if (masterSession.activeTabs.has(tabId)) {
    masterSession.activeTabs.delete(tabId);
  }
});

// ─── Core Logic ───

async function handleStartRecording(tabId) {
  try {
    masterSession = {
      isRecording: true,
      startTime: Date.now(),
      startUrl: null,
      events: [],
      activeTabs: new Set([tabId]),
    };

    // Note: The active tab handles its own injection via popup.js or the onUpdated hook will catch it.
    // We just manually inject the VERY FIRST initialization
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content.bundle.js"],
    });

    await chrome.tabs.sendMessage(tabId, { type: "START" });

    // UX
    await chrome.action.setBadgeText({ text: "REC" });
    await chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });

    return { ok: true };
  } catch (err) {
    console.error("[Ketchup Background] Failed to start:", err);
    masterSession.isRecording = false; // abort
    return { ok: false, error: err.message };
  }
}

async function handleStopRecording() {
  try {
    if (!masterSession.isRecording) {
      return { ok: false, error: "No active recording" };
    }

    // Tell all currently active tabs to stop buffering immediately
    masterSession.activeTabs.forEach((tabId) => {
      chrome.tabs.sendMessage(tabId, { type: "STOP" }).catch(() => {});
    });

    // Wait a brief moment for the final `STREAM_EVENTS_CHUNK` to arrive from content scripts
    await new Promise(resolve => setTimeout(resolve, 300));

    const finalPayload = {
      events: masterSession.events,
      duration: Date.now() - masterSession.startTime,
    };

    // Clean up
    masterSession.isRecording = false;
    masterSession.activeTabs.clear();
    await chrome.action.setBadgeText({ text: "" });

    // Send the massive assembled payload back to the Popup so it can upload it to Ketchup API
    chrome.runtime.sendMessage({
      type: "EVENTS_READY",
      events: finalPayload.events,
      metadata: { duration: finalPayload.duration, url: masterSession.startUrl || "multi-page-journey" },
    });

    return { ok: true };
  } catch (err) {
    masterSession.isRecording = false;
    return { ok: false, error: err.message };
  }
}
