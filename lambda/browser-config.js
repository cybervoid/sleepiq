let chromium;
try {
  // When running on Lambda with the layer, this should resolve from /opt/nodejs/node_modules
  chromium = require("@sparticuz/chromium");
} catch (e) {
  // Optional local dev fallback
  try {
    chromium = require("@sparticuz/chromium");
  } catch (err) {
    console.warn("Could not load @sparticuz/chromium. Ensure the Lambda layer is configured.");
  }
}

/**
 * Returns launch options for puppeteer-core on Lambda with Chromium layer.
 * Consumers can pass this into puppeteer.launch(options).
 */
async function getPuppeteerLaunchOptions() {
  let executablePath;
  
  if (chromium) {
    // Let chromium download/extract the binary if needed
    executablePath = await chromium.executablePath();
  } else {
    executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH;
  }

  return {
    headless: chromium ? chromium.headless : true,
    executablePath,
    args: [
      ...(chromium?.args || []),
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--single-process"
    ],
    defaultViewport: chromium?.defaultViewport || { width: 1280, height: 800 }
  };
}

module.exports = { getPuppeteerLaunchOptions };
