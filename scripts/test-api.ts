#!/usr/bin/env tsx

import 'dotenv/config';
import { getSleepData } from '../src/api/handler';
import { SleepIQCredentials, ScraperOptions } from '../src/shared/types';

async function main() {
  // Get credentials from environment variables
  const username = process.env.SLEEPIQ_USERNAME;
  const password = process.env.SLEEPIQ_PASSWORD;

  if (!username || !password) {
    console.error('Missing required environment variables:');
    console.error('SLEEPIQ_USERNAME and SLEEPIQ_PASSWORD must be set');
    process.exit(1);
  }

  const credentials: SleepIQCredentials = {
    username,
    password,
  };

  const options: ScraperOptions = {
    headless: process.env.HEADLESS !== 'false',
    debug: process.env.LOG_LEVEL === 'debug',
    timeout: parseInt(process.env.TIMEOUT || '30000'),
  };

  console.log('🧪 Testing API response format...\n');

  try {
    const result = await getSleepData(credentials, options);
    
    console.log('✅ API Response:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n📋 Response Summary:');
      console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`Timestamp: ${result.timestamp}`);
      console.log(`Rafa Data: ${Object.keys(result.data?.rafa || {}).length} fields`);
      console.log(`Miki Data: ${Object.keys(result.data?.miki || {}).length} fields`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);