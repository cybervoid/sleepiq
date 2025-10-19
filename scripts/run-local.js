#!/usr/bin/env tsx
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const sleepiq_1 = require("../src/scraper/sleepiq");
async function main() {
    // Get credentials from environment variables
    const username = process.env.SLEEPIQ_USERNAME;
    const password = process.env.SLEEPIQ_PASSWORD;
    if (!username || !password) {
        console.error('Missing required environment variables:');
        console.error('SLEEPIQ_USERNAME and SLEEPIQ_PASSWORD must be set');
        console.error('\\nCopy .env.example to .env and fill in your credentials');
        process.exit(1);
    }
    const credentials = {
        username,
        password,
    };
    const options = {
        headless: process.env.HEADLESS !== 'false',
        debug: process.env.LOG_LEVEL === 'debug',
        timeout: parseInt(process.env.TIMEOUT || '30000'),
    };
    try {
        console.log('Starting SleepIQ scraper...');
        console.log(`Headless mode: ${options.headless}`);
        console.log(`Debug mode: ${options.debug}`);
        const sleepMetrics = await (0, sleepiq_1.scrapeSleepMetrics)(credentials, options);
        console.log('\\n=== SLEEP METRICS ===');
        console.log(JSON.stringify(sleepMetrics, null, 2));
    }
    catch (error) {
        console.error('\\n❌ Scraping failed:', error);
        process.exit(1);
    }
}
main().catch(console.error);
//# sourceMappingURL=run-local.js.map