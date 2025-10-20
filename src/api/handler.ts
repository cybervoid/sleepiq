import { scrapeSleepMetrics } from '../scraper/sleepiq';
import { SleepIQCredentials, ScraperOptions } from '../shared/types';

/**
 * API-ready function that returns the sleep data as JSON
 */
export async function getSleepData(credentials: SleepIQCredentials, options: ScraperOptions = {}) {
  try {
    const sleepData = await scrapeSleepMetrics(credentials, options);
    
    // Return the clean JSON structure as documented
    const response = {
      rafa: {
        "30-average": sleepData.rafa['30-average'],
        "score": sleepData.rafa['score'],
        "all-time-best": sleepData.rafa['all-time-best'],
        "message": sleepData.rafa['message'],
        "heartRateMsg": sleepData.rafa['heartRateMsg'],
        "heartRateVariabilityMsg": sleepData.rafa['heartRateVariabilityMsg'],
        "breathRateMsg": sleepData.rafa['breathRateMsg']
      },
      miki: {
        "30-average": sleepData.miki['30-average'],
        "score": sleepData.miki['score'],
        "all-time-best": sleepData.miki['all-time-best'],
        "message": sleepData.miki['message'],
        "heartRateMsg": sleepData.miki['heartRateMsg'],
        "heartRateVariabilityMsg": sleepData.miki['heartRateVariabilityMsg'],
        "breathRateMsg": sleepData.miki['breathRateMsg']
      }
    };

    return {
      success: true,
      data: response,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * AWS Lambda handler
 */
export async function lambdaHandler(event: any, context: any) {
  // Get credentials from environment variables (set in Lambda)
  const username = process.env.SLEEPIQ_USERNAME;
  const password = process.env.SLEEPIQ_PASSWORD;

  if (!username || !password) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Missing SLEEPIQ_USERNAME or SLEEPIQ_PASSWORD environment variables',
        timestamp: new Date().toISOString()
      })
    };
  }

  const credentials: SleepIQCredentials = { username, password };
  const options: ScraperOptions = {
    headless: true, // Always headless in Lambda
    debug: false,   // No debug in production
    timeout: parseInt(process.env.TIMEOUT || '30000')
  };

  const result = await getSleepData(credentials, options);

  return {
    statusCode: result.success ? 200 : 500,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Adjust CORS as needed
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST'
    },
    body: JSON.stringify(result)
  };
}

/**
 * Cloudflare Workers handler
 */
export async function cloudflareFetch(request: Request): Promise<Response> {
  // Get credentials from environment variables (set in Cloudflare Workers)
  const username = process.env.SLEEPIQ_USERNAME;
  const password = process.env.SLEEPIQ_PASSWORD;

  if (!username || !password) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Missing SLEEPIQ_USERNAME or SLEEPIQ_PASSWORD environment variables',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const credentials: SleepIQCredentials = { username, password };
  const options: ScraperOptions = {
    headless: true, // Always headless
    debug: false,   // No debug in production
    timeout: parseInt(process.env.TIMEOUT || '30000')
  };

  const result = await getSleepData(credentials, options);

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Adjust CORS as needed
    }
  });
}