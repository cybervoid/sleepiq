#!/usr/bin/env node

/**
 * Test runner for the enhanced SleepIQ scraper
 * This script tests the new comprehensive JSON structure
 */

require('dotenv').config();
const { scrapeSleepDataBySleeper } = require('./dist/scraper/sleepiq');

async function main() {
  console.log('🌙 Enhanced SleepIQ Scraper Test');
  console.log('==================================');
  
  const credentials = {
    username: process.env.SLEEPIQ_USERNAME,
    password: process.env.SLEEPIQ_PASSWORD
  };

  if (!credentials.username || !credentials.password) {
    console.error('❌ Please set SLEEPIQ_USERNAME and SLEEPIQ_PASSWORD in your .env file');
    process.exit(1);
  }

  try {
    console.log('🔍 Starting enhanced sleep data extraction...');
    console.log('This will extract:');
    console.log('  - 30-day average score');
    console.log('  - Current SleepIQ score');
    console.log('  - All-time best score');
    console.log('  - General sleep message');
    console.log('  - Heart rate message');
    console.log('  - Heart rate variability message');
    console.log('  - Breathing rate message');
    console.log('');
    
    const startTime = Date.now();
    
    const sleepData = await scrapeSleepDataBySleeper(credentials, {
      headless: process.env.HEADLESS !== 'false', // Allow override via env
      debug: process.env.LOG_LEVEL === 'debug',
      timeout: 30000
    });

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`✅ Successfully extracted sleep data in ${duration}s!`);
    console.log('');
    
    // Validate the structure
    console.log('🔍 Validating JSON structure...');
    const expectedFields = [
      '30-average', 'score', 'all-time-best', 'message',
      'heartRateMsg', 'heartRateVariabilityMsg', 'breathRateMsg'
    ];
    
    let validationPassed = true;
    
    for (const sleeper of ['rafa', 'miki']) {
      console.log(`\n📊 ${sleeper.toUpperCase()} - Validation:`);
      
      for (const field of expectedFields) {
        const value = sleepData[sleeper][field];
        const isString = typeof value === 'string';
        const status = isString ? '✅' : '❌';
        const displayValue = isString ? (value || '(empty)') : `(${typeof value})`;
        
        console.log(`  ${status} ${field}: ${displayValue}`);
        
        if (!isString) {
          validationPassed = false;
        }
      }
    }
    
    console.log('');
    
    if (validationPassed) {
      console.log('✅ JSON structure validation PASSED');
    } else {
      console.log('❌ JSON structure validation FAILED');
    }
    
    console.log('');
    console.log('📊 Complete Results:');
    console.log('====================');
    
    // Pretty print the final JSON
    const cleanedResults = {
      rafa: {
        '30-average': sleepData.rafa['30-average'],
        'score': sleepData.rafa['score'],
        'all-time-best': sleepData.rafa['all-time-best'],
        'message': sleepData.rafa['message'],
        'heartRateMsg': sleepData.rafa['heartRateMsg'],
        'heartRateVariabilityMsg': sleepData.rafa['heartRateVariabilityMsg'],
        'breathRateMsg': sleepData.rafa['breathRateMsg']
      },
      miki: {
        '30-average': sleepData.miki['30-average'],
        'score': sleepData.miki['score'],
        'all-time-best': sleepData.miki['all-time-best'],
        'message': sleepData.miki['message'],
        'heartRateMsg': sleepData.miki['heartRateMsg'],
        'heartRateVariabilityMsg': sleepData.miki['heartRateVariabilityMsg'],
        'breathRateMsg': sleepData.miki['breathRateMsg']
      }
    };
    
    console.log(JSON.stringify(cleanedResults, null, 2));
    
    // Additional statistics
    console.log('');
    console.log('📈 Statistics:');
    console.log(`Duration: ${duration}s`);
    console.log(`Fields extracted per sleeper: ${expectedFields.length}`);
    console.log(`Total fields extracted: ${expectedFields.length * 2}`);
    
    const nonEmptyFields = expectedFields.reduce((count, field) => {
      return count + (sleepData.rafa[field] ? 1 : 0) + (sleepData.miki[field] ? 1 : 0);
    }, 0);
    
    console.log(`Non-empty fields: ${nonEmptyFields}/${expectedFields.length * 2}`);
    console.log(`Success rate: ${Math.round((nonEmptyFields / (expectedFields.length * 2)) * 100)}%`);
    
  } catch (error) {
    console.error('❌ Error during enhanced sleep data extraction:');
    console.error('Error message:', error.message);
    
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error('❌ Unhandled error in test runner:', error);
  process.exit(1);
});