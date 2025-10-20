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
      // Disable autofill and password manager to prevent interference
      '--disable-features=VizDisplayCompositor,PasswordManager,AutofillServerCommunication',
      '--disable-password-manager',
      '--disable-save-password-bubble',
      '--disable-autofill',
      '--disable-autofill-keyboard-accessory-view',
      '--disable-component-extensions-with-background-pages',
      '--disable-ipc-flooding-protection',
      // Use incognito mode to prevent any stored data interference
      '--incognito'
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
  
  // Disable autofill on the page
  await page.evaluateOnNewDocument(() => {
    // Disable autofill on all forms
    const observer = new MutationObserver(() => {
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        form.setAttribute('autocomplete', 'off');
      });
      
      const inputs = document.querySelectorAll('input');
      inputs.forEach(input => {
        input.setAttribute('autocomplete', 'new-password');
        input.setAttribute('data-form-type', 'other');
      });
    });
    
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
    
    // Also disable on page load
    document.addEventListener('DOMContentLoaded', () => {
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        form.setAttribute('autocomplete', 'off');
      });
      
      const inputs = document.querySelectorAll('input');
      inputs.forEach(input => {
        input.setAttribute('autocomplete', 'new-password');
        input.setAttribute('data-form-type', 'other');
      });
    });
  });
  
  // Enable request interception for debugging
  if (process.env.LOG_LEVEL === 'debug') {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      logger.debug(`Request: ${request.method()} ${request.url()}`);
      request.continue();
    });
    
    // Monitor responses for login-related requests
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('login') || url.includes('auth') || url.includes('signin')) {
        logger.debug(`Login Response: ${response.status()} ${url}`);
        try {
          const text = await response.text();
          if (text.length < 500) {
            logger.debug(`Response body: ${text}`);
          }
        } catch (error) {
          logger.debug('Could not read response body');
        }
      }
    });
  }

  return page;
}

export async function takeDebugScreenshot(page: Page, filename: string = 'debug.png'): Promise<void> {
  try {
    await page.screenshot({ path: filename as `${string}.png`, fullPage: true });
    logger.debug(`Screenshot saved to ${filename}`);
  } catch (error) {
    logger.error('Failed to take screenshot', error);
  }
}