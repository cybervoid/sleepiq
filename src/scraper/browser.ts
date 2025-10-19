import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../shared/logger';
import { DEFAULT_TIMEOUT, DEFAULT_USER_AGENT } from '../shared/constants';
import { ScraperOptions } from '../shared/types';

export async function launchBrowser(options: ScraperOptions = {}): Promise<Browser> {
  const { headless = process.env.HEADLESS !== 'false', debug = false } = options;

  logger.debug('Launching browser', { headless, debug });

  // For local development, use full puppeteer
  const browser = await puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
    defaultViewport: {
      width: 1280,
      height: 720,
    },
  });

  return browser;
}

export async function newPage(browser: Browser, options: ScraperOptions = {}): Promise<Page> {
  const { timeout = DEFAULT_TIMEOUT } = options;
  
  const page = await browser.newPage();
  
  // Set timeouts
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  
  // Set user agent
  await page.setUserAgent(DEFAULT_USER_AGENT);
  
  // Enable request interception for debugging
  if (process.env.LOG_LEVEL === 'debug') {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      logger.debug(`Request: ${request.method()} ${request.url()}`);
      request.continue();
    });
  }

  return page;
}

export async function takeDebugScreenshot(page: Page, filename: string = 'debug.png'): Promise<void> {
  try {
    await page.screenshot({ path: filename, fullPage: true });
    logger.debug(`Screenshot saved to ${filename}`);
  } catch (error) {
    logger.error('Failed to take screenshot', error);
  }
}