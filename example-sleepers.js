#!/usr/bin/env node

// Example script showing how to extract sleep data for both sleepers
require('dotenv').config();
const { scrapeSleepDataBySleeper } = require('./dist/scraper/sleepiq');

async function main() {
  console.log('🌙 SleepIQ Sleeper Data Extraction Example');
  console.log('==========================================');
  
  const credentials = {
    username: process.env.SLEEPIQ_USERNAME,
    password: process.env.SLEEPIQ_PASSWORD
  };

  if (!credentials.username || !credentials.password) {
    console.error('❌ Please set SLEEPIQ_USERNAME and SLEEPIQ_PASSWORD in your .env file');
    process.exit(1);
  }

  try {
    console.log('🔍 Extracting sleep data for both sleepers...');
    
    const sleepData = await scrapeSleepDataBySleeper(credentials, {
      headless: true, // Set to false to see the browser
      debug: false,   // Set to true for debug screenshots
      timeout: 30000
    });

    console.log('✅ Successfully extracted sleep data!');
    console.log('');
    console.log('📊 Results:');
    console.log('===========');
    
    console.log('🛏️  Rafa\'s Sleep Data:');
    console.log(JSON.stringify(sleepData.rafa, null, 2));
    console.log('');
    
    console.log('🛏️  Miki\'s Sleep Data:');
    console.log(JSON.stringify(sleepData.miki, null, 2));
    console.log('');
    
    // Example of how to access specific data
    console.log('📈 Summary:');
    console.log(`Rafa's Sleep Score: ${sleepData.rafa.sleepScore || 'N/A'}`);
    console.log(`Miki's Sleep Score: ${sleepData.miki.sleepScore || 'N/A'}`);
    console.log(`Rafa's Time in Bed: ${sleepData.rafa.timeInBedMinutes || 'N/A'} minutes`);
    console.log(`Miki's Time in Bed: ${sleepData.miki.timeInBedMinutes || 'N/A'} minutes`);

  } catch (error) {
    console.error('❌ Error extracting sleep data:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
