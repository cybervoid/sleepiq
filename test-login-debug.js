#!/usr/bin/env node

/**
 * Debug test script for login with screenshots enabled
 */

require('tsx/cjs');
const { scrapeSleepMetrics } = require('./src/scraper/sleepiq');

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  
  if (!username || !password) {
    console.error('Usage: node test-login-debug.js <username> <password>');
    process.exit(1);
  }
  
  const credentials = { username, password };
  
  const scraperOptions = {
    headless: false,  // Show browser
    timeout: 60000,
    debug: true       // Enable debug screenshots
  };
  
  // Set log level to debug
  process.env.LOG_LEVEL = 'debug';
  
  try {
    console.log('Starting login test with debug enabled...');
    const sleepData = await scrapeSleepMetrics(credentials, scraperOptions);
    console.log('Success! Sleep data:', JSON.stringify(sleepData, null, 2));
  } catch (error) {
    console.error('Login failed:', error.message);
    console.error('Check the screenshots in the current directory');
    process.exit(1);
  }
}

main();
