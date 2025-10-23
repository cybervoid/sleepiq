/**
 * Lambda handler: Basic Auth, runs SleepIQ scrape, stores session in S3.
 */

const { S3SessionManager } = require("./s3-session-manager");
const { getPuppeteerLaunchOptions } = require("./browser-config");
const puppeteer = require("puppeteer-core");

// Import your scraper function - adjust this path to match your actual implementation
const { scrapeSleepMetrics } = require("../src/scraper/sleepiq");

function parseBasicAuth(headerVal) {
  if (!headerVal || !headerVal.startsWith("Basic ")) return null;
  const base64 = headerVal.slice("Basic ".length).trim();
  try {
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx === -1) return null;
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function response(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  try {
    const envApiUser = process.env.API_USERNAME;
    const envApiPass = process.env.API_PASSWORD;
    const sleepUser = process.env.SLEEPIQ_USERNAME;
    const sleepPass = process.env.SLEEPIQ_PASSWORD;
    const sessionBucket = process.env.SESSION_BUCKET_NAME;

    if (!envApiUser || !envApiPass || !sleepUser || !sleepPass || !sessionBucket) {
      console.error("Missing required environment variables");
      return response(500, { error: "Server is not configured correctly" });
    }

    // Validate Basic Auth from request
    const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || "";
    const creds = parseBasicAuth(authHeader);

    if (!creds || creds.username !== envApiUser || creds.password !== envApiPass) {
      return response(401, { error: "Unauthorized" }, { "WWW-Authenticate": "Basic realm=\"sleepiq\"" });
    }

    console.log("Authenticated successfully, starting sleep data extraction");

    // Prepare credentials and options for scraper
    const credentials = {
      username: sleepUser,
      password: sleepPass
    };

    // Get Puppeteer launch options optimized for Lambda
    const launchOptions = await getPuppeteerLaunchOptions();
    
    const scraperOptions = {
      headless: true,
      timeout: 90000,
      debug: true, // Enable debug for troubleshooting
      puppeteerLaunchOptions: launchOptions,
      puppeteerInstance: puppeteer
    };

    console.log("Launching browser with executable:", launchOptions.executablePath);
    const data = await scrapeSleepMetrics(credentials, scraperOptions);

    console.log("Sleep data extracted successfully");
    return response(200, { success: true, data });

  } catch (err) {
    console.error("Handler error:", err);
    return response(500, { 
      error: "Internal Server Error",
      message: err.message
    });
  }
};
