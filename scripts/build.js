/**
 * Build script: bundles the rrweb content script into a single file
 * that can be injected by the Chrome Extension.
 *
 * Usage: node scripts/build.js
 */
const esbuild = require("esbuild");
const path = require("path");

async function build() {
  // Bundle the content script (which imports rrweb) into a single IIFE
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, "../src/content.js")],
    bundle: true,
    format: "iife",
    outfile: path.resolve(__dirname, "../dist/content.bundle.js"),
    minify: true,
    target: ["chrome110"],
  });

  console.log("✅ Content script bundled → dist/content.bundle.js");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
