#!/usr/bin/env node

// Simple test script to verify login functionality
require('dotenv').config();
const { scrapeSleepMetrics } = require('./dist/scraper/sleepiq');

async function testLogin() {
  const username = process.env.SLEEPIQ_USERNAME;
  const password = process.env.SLEEPIQ_PASSWORD;

  if (!username || !password) {
    console.error('❌ Missing credentials in .env file');
    console.error('Please set SLEEPIQ_USERNAME and SLEEPIQ_PASSWORD');
    process.exit(1);
  }

  console.log('🧪 Testing SleepIQ login...');
  console.log(`Username: ${username}`);
  console.log(`Password: ${password.substring(0, 3)}***`);
  console.log('');

  try {
    const result = await scrapeSleepMetrics(
      { username, password },
      { 
        headless: false, // Show browser for debugging
        debug: true,
        timeout: 30000
      }
    );
    
    console.log('✅ Login successful!');
    console.log('📊 Sleep metrics:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
  }
}

testLogin().catch(console.error);
