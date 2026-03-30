/**
 * Ketchup Capture — Auth Bridge
 *
 * This script is automatically injected ONLY into the Ketchup Webapp domain
 * (e.g. localhost:3000, ketchup-webapp.vercel.app).
 *
 * It acts as the "Magic Bridge", listening for a specific window.postMessage
 * emitted by the Webapp when the user clicks 'Start Manual Capture'.
 *
 * When received, it instantly saves the user's active Project ID and Supabase
 * Auth Token into chrome.storage so the extension can securely upload
 * captures later without requiring a manual login.
 */

window.addEventListener("message", (event) => {
  // 1. Verify Origin (Security)
  const allowedOrigins = [
    "http://localhost:3000",
    "https://ketchup-webapp.vercel.app"
  ];
  if (!allowedOrigins.includes(event.origin)) return;

  // 2. Verify Payload Signature
  const { type, payload } = event.data;
  if (type !== "KETCHUP_AUTH_SYNC" || !payload) return;

  const { projectId, token, environment } = payload;
  if (!projectId || !token) {
    console.error("[Ketchup Extension] Auth Sync failed: Missing projectId or token");
    return;
  }

  // 3. Save to Extension Storage
  chrome.storage.local.set({
    ketchupAuth: {
      projectId,
      token,
      environment: environment || "production",
      syncedAt: Date.now()
    }
  }, () => {
    console.log(`[Ketchup Extension] 🔑 Magic Auth Sync successful for Project: ${projectId}`);
    
    // Optional: Alert the webapp that the sync was successful
    window.postMessage({ type: "KETCHUP_AUTH_SYNC_SUCCESS" }, event.origin);
  });
});

console.log("[Ketchup Extension] 🌉 Auth Bridge active. Listening for credentials...");
