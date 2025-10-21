import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from '../shared/logger';
import { DEFAULT_TIMEOUT, DEFAULT_USER_AGENT } from '../shared/constants';
import { ScraperOptions } from '../shared/types';

// Types for Cloudflare Workers Browser API
interface CloudflareBrowser {
  newPage(): Promise<Page>;
}

interface CloudflareEnv {
  BROWSER?: CloudflareBrowser;
}

// Create a wrapper to make Cloudflare Browser API compatible with Puppeteer interface
class CloudflareBrowserWrapper {
  constructor(private cfBrowser: CloudflareBrowser) {}
  
  async newPage(): Promise<Page> {
    return await this.cfBrowser.newPage();
  }
  
  async close(): Promise<void> {
    // Cloudflare Workers Browser API doesn't need explicit close
    logger.debug('Browser close called - no action needed in Cloudflare Workers');
    return Promise.resolve();
  }
  
  // Add other Browser interface methods as needed
  async pages(): Promise<Page[]> {
    // Not available in Cloudflare Workers
    return [];
  }
  
  async targets() {
    return [];
  }
  
  isConnected(): boolean {
    return true;
  }
  
  async version(): Promise<string> {
    return 'cloudflare-workers-browser';
  }
  
  async userAgent(): Promise<string> {
    return 'Chrome/WebKit Cloudflare Workers';
  }
}

export async function launchBrowser(options: ScraperOptions = {}, env?: CloudflareEnv): Promise<Browser> {
  const { headless = process.env.HEADLESS !== 'false', debug = false } = options;

  logger.debug('Launching browser', { headless, debug });

  // Check if we're in Cloudflare Workers environment
  if (env?.BROWSER) {
    logger.debug('Using Cloudflare Workers Browser API');
    // Return the wrapped Cloudflare browser
    const wrapper = new CloudflareBrowserWrapper(env.BROWSER);
    return wrapper as unknown as Browser;
  }

  // For local development, use full puppeteer
  logger.debug('Using local Puppeteer');
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
  
  // Enable minimal request logging for debugging
  if (process.env.LOG_LEVEL === 'debug' && process.env.VERBOSE_REQUESTS === 'true') {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Only log important requests (auth, API calls)
      const url = request.url();
      if (url.includes('login') || url.includes('auth') || url.includes('signin') || url.includes('api')) {
        logger.debug(`Request: ${request.method()} ${url}`);
      }
      request.continue();
    });
    
    // Monitor responses for login-related requests only
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('login') || url.includes('auth') || url.includes('signin')) {
        logger.debug(`Login Response: ${response.status()} ${url}`);
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