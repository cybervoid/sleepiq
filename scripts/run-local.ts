#!/usr/bin/env tsx

import 'dotenv/config';
import { scrapeSleepMetrics } from '../src/scraper/sleepiq';
import { SleepIQCredentials, ScraperOptions } from '../src/shared/types';

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

  const credentials: SleepIQCredentials = {
    username,
    password,
  };

  const options: ScraperOptions = {
    headless: process.env.HEADLESS !== 'false',
    debug: process.env.LOG_LEVEL === 'debug',
    timeout: parseInt(process.env.TIMEOUT || '30000'),
  };

  try {
    console.log('Starting SleepIQ scraper...');
    console.log(`Headless mode: ${options.headless}`);
    console.log(`Debug mode: ${options.debug}`);
    
    const sleepMetrics = await scrapeSleepMetrics(credentials, options);
    
    console.log('\\n=== SLEEP METRICS ===');
    console.log(JSON.stringify(sleepMetrics, null, 2));
    
  } catch (error) {
    console.error('\\n❌ Scraping failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);