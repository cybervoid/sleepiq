#!/usr/bin/env node

// Test script to verify sleeper data extraction functionality
require('dotenv').config();
const { scrapeSleepDataBySleeper } = require('./dist/scraper/sleepiq');

async function testSleeperData() {
  const username = process.env.SLEEPIQ_USERNAME;
  const password = process.env.SLEEPIQ_PASSWORD;

  if (!username || !password) {
    console.error('❌ Missing credentials in .env file');
    console.error('Please set SLEEPIQ_USERNAME and SLEEPIQ_PASSWORD');
    process.exit(1);
  }

  console.log('🧪 Testing SleepIQ sleeper data extraction...');
  console.log(`Username: ${username}`);
  console.log(`Password: ${password.substring(0, 3)}***`);
  console.log('');

  try {
    const result = await scrapeSleepDataBySleeper(
      { username, password },
      { 
        headless: false, // Show browser for debugging
        debug: true,
        timeout: 30000
      }
    );
    
    console.log('✅ Sleeper data extraction successful!');
    console.log('📊 Sleep data by sleeper:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Sleeper data extraction failed:', error.message);
    process.exit(1);
  }
}

testSleeperData().catch(console.error);
