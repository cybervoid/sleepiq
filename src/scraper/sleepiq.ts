import { Browser, Page } from 'puppeteer';
import { logger } from '../shared/logger';
import { SLEEPIQ_URLS } from '../shared/constants';
import { SleepMetrics, SleepIQCredentials, ScraperOptions } from '../shared/types';
import { launchBrowser, newPage, takeDebugScreenshot } from './browser';

export async function scrapeSleepMetrics(
  credentials: SleepIQCredentials,
  options: ScraperOptions = {}
): Promise<SleepMetrics> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await launchBrowser(options);
    page = await newPage(browser, options);

    logger.info('Navigating to SleepIQ login page');
    await page.goto(SLEEPIQ_URLS.LOGIN, { waitUntil: 'networkidle2' });

    // Wait for login form to be ready
    await page.waitForSelector('input[type="email"], input[name="email"], input[id*="email"]', { timeout: 10000 });
    
    logger.info('Logging in to SleepIQ');
    
    // Fill in credentials
    const emailSelector = 'input[type="email"], input[name="email"], input[id*="email"]';
    const passwordSelector = 'input[type="password"], input[name="password"], input[id*="password"]';
    
    await page.type(emailSelector, credentials.username);
    await page.type(passwordSelector, credentials.password);
    
    // Submit the form
    const submitSelector = 'button[type="submit"], input[type="submit"]';
    
    // Try to find and click the submit button
    try {
      await page.click(submitSelector);
    } catch (error) {
      logger.debug('Standard submit selectors failed, trying alternative approach');
      // Alternative: press Enter on password field
      await page.focus(passwordSelector);
      await page.keyboard.press('Enter');
    }

    logger.debug('Waiting for navigation after login');
    
    // Wait for navigation to complete (either dashboard or error)
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    } catch (error) {
      logger.debug('Navigation timeout, checking current URL');
    }

    // Check if we're still on the login page (indicating failed login)
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      if (options.debug) {
        await takeDebugScreenshot(page, 'login-failed.png');
      }
      throw new Error('Login failed - still on login page');
    }

    logger.info('Login successful, extracting sleep metrics');

    // Navigate to dashboard if not already there
    if (!currentUrl.includes('dashboard')) {
      await page.goto(SLEEPIQ_URLS.DASHBOARD, { waitUntil: 'networkidle2' });
    }

    // Wait for sleep data to load
    await page.waitForTimeout(3000);
    
    if (options.debug) {
      await takeDebugScreenshot(page, 'dashboard.png');
    }

    // Extract sleep metrics from the page
    const sleepMetrics = await extractSleepData(page);
    
    logger.info('Successfully extracted sleep metrics');
    return sleepMetrics;

  } catch (error) {
    logger.error('Error scraping SleepIQ data:', error);
    
    if (page && options.debug) {
      await takeDebugScreenshot(page, 'error.png');
    }
    
    throw new Error(`Failed to scrape SleepIQ data: ${error}`);
  } finally {
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}

async function extractSleepData(page: Page): Promise<SleepMetrics> {
  logger.debug('Extracting sleep data from dashboard');
  
  // This is a basic implementation - you'll need to adjust selectors based on actual SleepIQ dashboard
  const sleepMetrics: SleepMetrics = {
    date: new Date().toISOString().split('T')[0], // Today's date as default
  };

  try {
    // Try to extract sleep score
    const scoreElement = await page.$('.sleep-score, .score, [data-testid="sleep-score"]');
    if (scoreElement) {
      const scoreText = await scoreElement.evaluate(el => el.textContent);
      const score = parseInt(scoreText?.replace(/\D/g, '') || '0');
      if (score > 0) sleepMetrics.sleepScore = score;
    }

    // Try to extract time in bed
    const timeInBedElement = await page.$('.time-in-bed, [data-testid="time-in-bed"]');
    if (timeInBedElement) {
      const timeText = await timeInBedElement.evaluate(el => el.textContent);
      // Parse time format like "7h 45m" or "7:45"
      const hours = (timeText?.match(/(\d+)h/) || [])[1];
      const minutes = (timeText?.match(/(\d+)m/) || [])[1];
      if (hours || minutes) {
        sleepMetrics.timeInBedMinutes = (parseInt(hours || '0') * 60) + parseInt(minutes || '0');
      }
    }

    // Extract all visible text for debugging
    const pageText = await page.evaluate(() => document.body.innerText);
    sleepMetrics.raw = {
      pageText: pageText.substring(0, 1000), // First 1000 characters
      url: window.location.href,
      extractedAt: new Date().toISOString()
    };

    logger.debug('Extracted sleep metrics:', JSON.stringify(sleepMetrics, null, 2));
    
  } catch (error) {
    logger.warn('Error extracting specific sleep data, returning basic structure:', error);
  }

  return sleepMetrics;
}
