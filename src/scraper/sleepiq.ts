import { Browser, Page } from 'puppeteer';
import { logger } from '../shared/logger';
import { SLEEPIQ_URLS } from '../shared/constants';
import { SleepMetrics, SleepIQCredentials, ScraperOptions, SleepDataBySleeper } from '../shared/types';
import { launchBrowser, newPage, takeDebugScreenshot } from './browser';
import { DASHBOARD_SELECTORS, MESSAGE_PATTERNS } from './selectors';
import { 
  withRetries, 
  safeClick, 
  getTextOrEmpty, 
  extractMatchingText, 
  closeModal, 
  waitForModalDismissed 
} from './helpers';
import { SessionManager } from './session';
import { 
  extractBiosignalsMessagesImproved, 
  extractSleepSessionMessageImproved 
} from './improved-biosignals';

export async function scrapeSleepMetrics(
  credentials: SleepIQCredentials,
  options: ScraperOptions = {},
  env?: any
): Promise<SleepDataBySleeper> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  const sessionManager = new SessionManager();

  try {
    browser = await launchBrowser(options, env);
    page = await newPage(browser, options);

    // Try to restore existing session first
    logger.info('Checking for existing session...');
    const sessionRestored = await sessionManager.loadSession(page);
    
    if (sessionRestored) {
      // Check if we're actually logged in
      const isLoggedIn = await sessionManager.isLoggedIn(page);
      
      if (isLoggedIn) {
        logger.info('Session restored successfully, skipping login');
        
        // Navigate to dashboard if not already there
        const currentUrl = page.url();
        logger.debug('Current URL after session restore:', currentUrl);
        
        // Always navigate to the sleep dashboard to ensure we're in the right place
        logger.info('Navigating to sleep dashboard');
        await page.goto(SLEEPIQ_URLS.DASHBOARD, { waitUntil: 'networkidle2' });
        
        // Wait a bit for the dashboard to fully load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const finalUrl = page.url();
        logger.debug('Final URL after navigation:', finalUrl);
        
        // Handle sleeper selection page if we end up there
        if (finalUrl.includes('select-default-sleeper')) {
          logger.info('On sleeper selection page, selecting default sleeper...');
          
          try {
            // Try to find and click a sleeper selection button or continue
            const sleeperSelected = await page.evaluate(() => {
              // Look for buttons or clickable elements that might advance us
              const buttons = Array.from(document.querySelectorAll('button, [role="button"], .btn, .continue, .next'));
              
              for (const button of buttons) {
                const text = (button as HTMLElement).textContent?.toLowerCase() || '';
                const htmlButton = button as HTMLElement;
                
                // Look for continue, next, or sleeper names
                if (text.includes('continue') || text.includes('next') || text.includes('rafa') || text.includes('miki')) {
                  htmlButton.click();
                  return true;
                }
              }
              
              // If no specific button found, click the first available sleeper or continue button
              if (buttons.length > 0) {
                (buttons[0] as HTMLElement).click();
                return true;
              }
              
              return false;
            });
            
            if (sleeperSelected) {
              await new Promise(resolve => setTimeout(resolve, 3000));
              await page.goto(SLEEPIQ_URLS.DASHBOARD, { waitUntil: 'networkidle2' });
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            logger.warn('Could not handle sleeper selection page:', error);
          }
        }
      } else {
        logger.info('Session restoration failed, proceeding with login');
        await sessionManager.clearSession();
      }
    }
    
    // If no valid session, proceed with login
    if (!sessionRestored || !(await sessionManager.isLoggedIn(page))) {
      logger.info('Performing fresh login to SleepIQ');
      await performLogin(page, credentials, options);
      
      // Save session after successful login
      logger.info('Saving session for future use');
      await sessionManager.saveSession(page);
    }
    
    // Wait for sleep data to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (options.debug) {
      await takeDebugScreenshot(page, 'dashboard.png');
    }

    // Extract sleep data for both sleepers using the enhanced orchestrated approach
    const sleepData = await extractSleepDataForBothSleepersEnhanced(page);
    
    logger.info('Successfully extracted sleep data for both sleepers');
    return sleepData;

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

/**
 * Perform login to SleepIQ
 */
async function performLogin(
  page: Page, 
  credentials: SleepIQCredentials, 
  options: ScraperOptions
): Promise<void> {
  logger.info('Navigating to SleepIQ login page');
  
  await page.goto(SLEEPIQ_URLS.LOGIN, { waitUntil: 'networkidle2' });
  
  // Clear all browser data to prevent autofill interference
  try {
    // Clear all cookies
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');
    await client.send('Storage.clearDataForOrigin', {
      origin: 'https://sleepiq.sleepnumber.com',
      storageTypes: 'all'
    });
    
    await page.evaluate(() => {
      // Clear localStorage
      localStorage.clear();
      // Clear sessionStorage
      sessionStorage.clear();
      
      // Clear any cached form data
      if ('webkitStorageInfo' in window) {
        // @ts-ignore
        window.webkitStorageInfo.requestQuota(PERSISTENT, 0, () => {}, () => {});
      }
    });
    
    // Clear cookies via page API as backup
    const cookies = await page.cookies();
    if (cookies.length > 0) {
      await page.deleteCookie(...cookies);
    }
    
    logger.info('Browser data cleared to prevent autofill');
  } catch (error) {
    logger.debug('Could not clear browser data:', error);
    // Continue anyway
  }

  // Wait for login form to be ready and interactive
  await page.waitForSelector('input[type="email"], input[name="email"], input[id*="email"]', { timeout: 10000 });
  
  // Wait for the form to be fully interactive
  await page.waitForFunction(() => {
    const emailInput = document.querySelector('input[type="email"], input[name="email"], input[id*="email"]') as HTMLInputElement;
    const passwordInput = document.querySelector('input[type="password"], input[name="password"], input[id*="password"]') as HTMLInputElement;
    return emailInput && passwordInput && !emailInput.disabled && !passwordInput.disabled;
  }, { timeout: 10000 });
  
  logger.info('Logging in to SleepIQ');
  
  // Clear any existing values and fill in credentials
  const emailSelector = 'input[type="email"], input[name="email"], input[id*="email"]';
  const passwordSelector = 'input[type="password"], input[name="password"], input[id*="password"]';
  
  // Disable autofill on the form before filling
  await page.evaluate(() => {
    const form = document.querySelector('form');
    if (form) {
      form.setAttribute('autocomplete', 'off');
    }
    
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
      input.setAttribute('autocomplete', 'new-password');
      input.setAttribute('data-form-type', 'other');
    });
  });
  
  // Wait a moment for autofill to settle
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Clear and type email with enhanced clearing
  await page.evaluate((selector) => {
    const input = document.querySelector(selector) as HTMLInputElement;
    if (input) {
      input.value = '';
      input.setAttribute('value', '');
    }
  }, emailSelector);
  
  // More human-like interaction with random delays
  await page.click(emailSelector, { delay: Math.random() * 100 + 50 });
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Delete');
  // Type with variable delays to mimic human typing
  for (const char of credentials.username) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 100 });
  }
  
  // Clear and type password with enhanced clearing
  await page.evaluate((selector) => {
    const input = document.querySelector(selector) as HTMLInputElement;
    if (input) {
      input.value = '';
      input.setAttribute('value', '');
    }
  }, passwordSelector);
  
  await page.click(passwordSelector, { delay: Math.random() * 100 + 50 });
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Delete');
  // Type password with variable delays
  for (const char of credentials.password) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 100 });
  }
  
  // Trigger input events to ensure the SPA recognizes the changes
  await page.evaluate((emailSel, passSel) => {
    const emailInput = document.querySelector(emailSel) as HTMLInputElement;
    const passwordInput = document.querySelector(passSel) as HTMLInputElement;
    
    if (emailInput) {
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      emailInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    
    if (passwordInput) {
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
      passwordInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, emailSelector, passwordSelector);
  
  // Wait for any validation or dynamic updates and form to be ready
  // In Lambda/headless, SPAs often need extra time
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Wait for login button to be enabled (form validation may take time)
  try {
    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button')).find(btn => {
        const text = btn.textContent?.trim().toLowerCase();
        return text === 'login' && !btn.disabled;
      });
      return button !== undefined;
    }, { timeout: 5000 });
    logger.debug('Login button is now enabled');
  } catch (error) {
    logger.debug('Timeout waiting for login button to enable, proceeding anyway');
  }
  
  // Debug: Check what elements are available for clicking
  const pageInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
      tag: 'button',
      text: btn.textContent?.trim(),
      type: btn.getAttribute('type'),
      className: btn.className,
      disabled: btn.disabled,
      id: btn.id,
      visible: btn.offsetWidth > 0 && btn.offsetHeight > 0
    }));
    
    // Look for elements with "login" text
    const loginElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent?.trim().toLowerCase();
      const htmlEl = el as HTMLElement;
      return text === 'login' && htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0;
    }).map(el => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim(),
      className: el.className,
      id: el.id,
      type: el.getAttribute('type'),
      role: el.getAttribute('role')
    }));
    
    return { buttons, loginElements };
  });
  
  // Only show available elements if login fails
  if (process.env.VERBOSE_LOGIN === 'true') {
    logger.debug('Available elements:', JSON.stringify(pageInfo, null, 2));
  }
  
  // Try to find and click the login button
  let buttonClicked = false;
  
  // Strategy 1: Target the Angular button component specifically
  try {
    const clickResult = await page.evaluate(() => {
      // Try to find the Angular button component
      const appButton = document.querySelector('app-siq-button');
      const primaryBtn = document.querySelector('.primary-btn[role="button"]');
      const targetButton = primaryBtn || appButton;
      
      if (targetButton) {
        const htmlButton = targetButton as HTMLElement;
        const buttonInfo = {
          tag: htmlButton.tagName,
          className: htmlButton.className,
          text: htmlButton.textContent?.trim()
        };
        
        // Trigger multiple events to ensure Angular picks it up
        htmlButton.focus();
        
        // Create and dispatch mouse events with full detail
        const mouseDownEvent = new MouseEvent('mousedown', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: htmlButton.getBoundingClientRect().left + 10,
          clientY: htmlButton.getBoundingClientRect().top + 10
        });
        htmlButton.dispatchEvent(mouseDownEvent);
        
        const mouseUpEvent = new MouseEvent('mouseup', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: htmlButton.getBoundingClientRect().left + 10,
          clientY: htmlButton.getBoundingClientRect().top + 10
        });
        htmlButton.dispatchEvent(mouseUpEvent);
        
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: htmlButton.getBoundingClientRect().left + 10,
          clientY: htmlButton.getBoundingClientRect().top + 10
        });
        htmlButton.dispatchEvent(clickEvent);
        
        // Native click as backup
        htmlButton.click();
        
        return buttonInfo;
      }
      return null;
    });
    
    if (clickResult) {
      buttonClicked = true;
      logger.debug('Login button clicked successfully:', JSON.stringify(clickResult));
    } else {
      logger.debug('No login button found in Strategy 1');
    }
  } catch (error) {
    logger.debug('Login button click failed:', error);
  }
  
  // Strategy 2: Try common button selectors and click via evaluate
  if (!buttonClicked) {
    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:not([disabled])',
      '[role="button"]:not([disabled])',
      '.btn:not([disabled])',
      '.button:not([disabled])'
    ];
    
    for (const selector of buttonSelectors) {
      try {
        const clicked = await page.evaluate((sel) => {
          const button = document.querySelector(sel);
          if (button) {
            (button as HTMLElement).click();
            return true;
          }
          return false;
        }, selector);
        
        if (clicked) {
          logger.debug(`Successfully clicked button with selector: ${selector}`);
          buttonClicked = true;
          break;
        }
      } catch (error) {
        logger.debug(`Selector ${selector} failed:`, error);
      }
    }
  }
  
  // Strategy 3: Try Puppeteer's click at element coordinates
  if (!buttonClicked) {
    logger.debug('Trying Puppeteer click at coordinates...');
    try {
      const buttonCoords = await page.evaluate(() => {
        const btn = document.querySelector('.primary-btn[role="button"]') || document.querySelector('app-siq-button');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            found: true as const
          };
        }
        return { x: 0, y: 0, found: false as const };
      });
      
      if (buttonCoords.found && buttonCoords.x && buttonCoords.y) {
        await page.mouse.click(buttonCoords.x, buttonCoords.y);
        logger.debug(`Clicked at coordinates (${buttonCoords.x}, ${buttonCoords.y})`);
        buttonClicked = true;
      }
    } catch (error) {
      logger.debug('Coordinate click failed:', error);
    }
  }
  
  // Strategy 4: Press Enter on password field (common SPA pattern)
  if (!buttonClicked) {
    logger.debug('Trying Enter key on password field...');
    await page.focus(passwordSelector);
    await page.keyboard.press('Enter');
    buttonClicked = true;
  }
  
  // Strategy 4: Try form submission directly
  if (!buttonClicked) {
    logger.debug('Trying direct form submission...');
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        form.submit();
      }
    });
    buttonClicked = true;
  }

  logger.debug('Waiting for navigation after login');
  
  // Wait for either navigation or error messages
  try {
    // Wait for navigation with a reasonable timeout
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }),
      page.waitForFunction(() => {
        // Check if we're no longer on login page
        const currentPath = window.location.pathname + window.location.hash;
        return !currentPath.includes('login') && !currentPath.includes('signin');
      }, { timeout: 8000 }),
      // Also wait for any error messages to appear
      page.waitForSelector('[class*="error"], [class*="invalid"], .alert, .message', { timeout: 5000 }).catch(() => null)
    ]);
    
    logger.debug('Navigation or page change detected');
  } catch (error) {
    logger.debug('Navigation timeout, checking current state...');
  }
  
  // Additional wait for any dynamic content to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check for error messages and validation feedback
  const loginPageInfo = await page.evaluate(() => {
    // Look for error messages
    const errorElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent?.toLowerCase() || '';
      const isSmallElement = el.textContent && el.textContent.length < 200;
      return isSmallElement && (
        text.includes('invalid') || 
        text.includes('incorrect') || 
        text.includes('wrong') ||
        text.includes('error') ||
        text.includes('failed') ||
        text.includes('try again') ||
        text.includes('check') ||
        el.classList.toString().includes('error') ||
        el.classList.toString().includes('invalid')
      );
    });
    
    // Check for any red text or error styling
    const redElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const style = window.getComputedStyle(el);
      const isRed = style.color.includes('255, 0, 0') || style.color.includes('red') || style.backgroundColor.includes('red');
      const hasText = el.textContent && el.textContent.trim().length > 0 && el.textContent.length < 100;
      return isRed && hasText;
    });
    
    // Check if still on login page or moved
    const currentPath = window.location.pathname + window.location.hash;
    
    return {
      errorMessages: errorElements.map(el => el.textContent?.trim()).filter(text => text),
      redElements: redElements.map(el => el.textContent?.trim()).filter(text => text),
      currentPath,
      title: document.title,
      hasLoginForm: !!document.querySelector('input[type="email"], input[type="password"]')
    };
  });
  
  logger.debug('Page status after login attempt:', JSON.stringify(loginPageInfo, null, 2));

  // Check if we're still on the login page (indicating failed login)
  const currentUrl = page.url();
  const currentPath = loginPageInfo.currentPath;
  
  // More specific check: we're still on login if we have BOTH a login form AND are on any login page
  // This includes /#/login, /#/auth/login, or any other login variant
  const isStillOnLogin = loginPageInfo.hasLoginForm && 
                        (currentPath.includes('/login') || currentPath.includes('auth'));
  
  // If we're on any auth/login page, wait for potential redirect
  if (currentPath.includes('auth/login') && loginPageInfo.hasLoginForm) {
    logger.debug('Detected auth page, waiting for potential redirect...');
    
    // Wait for up to 20 seconds for redirect, checking every 2 seconds (Lambda needs more time)
    let redirectWaitTime = 0;
    const maxWaitTime = 20000;
    
    while (redirectWaitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      redirectWaitTime += 2000;
      
      const currentPageInfo = await page.evaluate(() => ({
        currentPath: window.location.pathname + window.location.hash,
        hasLoginForm: !!document.querySelector('input[type="email"], input[type="password"]'),
        url: window.location.href
      }));
      
      logger.debug(`Auth redirect check (${redirectWaitTime}ms): ${currentPageInfo.currentPath}`);
      
      // If we've moved away from auth/login, break the loop
      if (!currentPageInfo.currentPath.includes('auth/login')) {
        logger.debug('Successfully redirected from auth page');
        break;
      }
      
      // If no login form, we might have progressed even if still on auth path
      if (!currentPageInfo.hasLoginForm) {
        logger.debug('No login form detected, assuming redirect success');
        break;
      }
    }
    
    // Re-check after waiting
    const updatedPageInfo = await page.evaluate(() => ({
      currentPath: window.location.pathname + window.location.hash,
      hasLoginForm: !!document.querySelector('input[type="email"], input[type="password"]')
    }));
    
    // If still on auth page with login form, let's debug what's happening
    const stillOnAuthLogin = updatedPageInfo.hasLoginForm && updatedPageInfo.currentPath.includes('auth/login');
    
    if (stillOnAuthLogin) {
      // Get detailed page info to understand what's on the auth page
      const authPageDebug = await page.evaluate(() => {
        const formElements = Array.from(document.querySelectorAll('input, button, form')).map(el => ({
          tag: el.tagName,
          type: el.getAttribute('type'),
          name: el.getAttribute('name'),
          id: el.id,
          className: el.className,
          text: el.textContent?.trim() || '',
          value: el.tagName === 'INPUT' ? (el as HTMLInputElement).value?.substring(0, 10) + '...' : ''
        }));
        
        const errorMessages = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent?.toLowerCase() || '';
          return text.includes('error') || text.includes('invalid') || text.includes('incorrect') || 
                 text.includes('failed') || text.includes('try again') || text.includes('2fa') || 
                 text.includes('verification') || text.includes('code');
        }).map(el => el.textContent?.trim());
        
        return {
          url: window.location.href,
          path: window.location.pathname + window.location.hash,
          title: document.title,
          bodyText: document.body.innerText.substring(0, 500),
          formElements,
          errorMessages
        };
      });
      
      logger.debug('Auth page debug info:', JSON.stringify(authPageDebug, null, 2));
      
      if (options.debug) {
        await takeDebugScreenshot(page, 'auth-page-debug.png');
      }
      
      // Check if this might be a 2FA page or different auth step
      const bodyText = authPageDebug.bodyText.toLowerCase();
      if (bodyText.includes('verification') || bodyText.includes('2fa') || bodyText.includes('code')) {
        throw new Error('Login requires 2FA or verification code - this is not currently supported');
      }
      
      throw new Error(`Login failed - stuck on auth page: ${authPageDebug.path}. Check debug screenshot.`);
    }
  } else if (isStillOnLogin) {
    if (options.debug) {
      await takeDebugScreenshot(page, 'login-failed.png');
    }
    
    // Build comprehensive error message
    let errorMessage = 'Login failed';
    if (loginPageInfo.errorMessages.length > 0) {
      errorMessage += ` - Error messages: ${loginPageInfo.errorMessages.join(', ')}`;
    }
    if (loginPageInfo.redElements.length > 0) {
      errorMessage += ` - Red text found: ${loginPageInfo.redElements.join(', ')}`;
    }
    if (loginPageInfo.errorMessages.length === 0 && loginPageInfo.redElements.length === 0) {
      errorMessage += ' - No visible error messages. Check credentials or possible 2FA requirement.';
    }
    
    throw new Error(errorMessage);
  }

  logger.info('Login successful');
  
  // Navigate to dashboard
  const currentUrlAfterLogin = page.url();
  if (!currentUrlAfterLogin.includes('pages/sleep') && !currentUrlAfterLogin.includes('dashboard')) {
    logger.info('Navigating to sleep dashboard');
    await page.goto(SLEEPIQ_URLS.DASHBOARD, { waitUntil: 'networkidle2' });
  }
}

async function extractSleepData(page: Page): Promise<SleepMetrics> {
  logger.debug('Extracting sleep data from dashboard');
  
  // Initialize with required structure and empty strings
  const sleepMetrics: SleepMetrics = {
    '30-average': '',
    'score': '',
    'all-time-best': '',
    'message': '',
    'heartRateMsg': '',
    'heartRateVariabilityMsg': '',
    'breathRateMsg': '',
    // Legacy fields for compatibility
    date: new Date().toISOString().split('T')[0]
  };

  try {
    logger.debug('Waiting for dashboard metrics to be ready...');
    
    // Wait for the dashboard to load by looking for key text indicators
    await page.waitForFunction(() => {
      const bodyText = document.body.innerText;
      return bodyText.includes('SleepIQ') && (
        bodyText.includes('30-day') || 
        bodyText.includes('All-time') ||
        bodyText.includes('score')
      );
    }, { timeout: 10000 });
    
    logger.debug('Dashboard appears ready, extracting metrics...');
    
    // Extract the three main dashboard numbers using page.evaluate
    const dashboardData = await page.evaluate(() => {
      const results = {
        thirtyDayAvg: '',
        sleepScore: '',
        allTimeBest: '',
        debugInfo: {
          bodyText: document.body.innerText.substring(0, 500),
          foundElements: [],
          error: ''
        }
      };
      
      try {
        // Strategy 1: Find specific elements by their structure
        // Look for the score display pattern from the screenshot
        const scoreContainers = document.querySelectorAll('[class*="score"], [class*="sleepiq"]');
        for (const container of scoreContainers) {
          const scoreText = container.textContent || '';
          if (scoreText.includes('SleepIQ') || scoreText.includes('score')) {
            const scoreMatch = scoreText.match(/\b(\d{2})\b/);
            if (scoreMatch) {
              results.sleepScore = scoreMatch[1];
              break;
            }
          }
        }
        
        // Strategy 2: Use text walking to find the three key metrics
        const allElements = Array.from(document.querySelectorAll('*'));
        
        // Find 30-day avg
        for (const el of allElements) {
          const text = el.textContent || '';
          if (text.includes('30-day') && text.includes('avg')) {
            // Look for number in same element or nearby
            const numberMatch = text.match(/\b(\d{1,3})\b/);
            if (numberMatch) {
              results.thirtyDayAvg = numberMatch[1];
              break;
            }
            // Check parent
            const parent = el.parentElement;
            if (parent) {
              const parentText = parent.textContent || '';
              const parentMatch = parentText.match(/\b(\d{1,3})\b/);
              if (parentMatch) {
                results.thirtyDayAvg = parentMatch[1];
                break;
              }
            }
          }
        }
        
        // Find all-time best
        for (const el of allElements) {
          const text = el.textContent || '';
          if (text.includes('All-time') && text.includes('best')) {
            const numberMatch = text.match(/\b(\d{1,3})\b/);
            if (numberMatch) {
              results.allTimeBest = numberMatch[1];
              break;
            }
            // Check parent
            const parent = el.parentElement;
            if (parent) {
              const parentText = parent.textContent || '';
              const parentMatch = parentText.match(/\b(\d{1,3})\b/);
              if (parentMatch) {
                results.allTimeBest = parentMatch[1];
                break;
              }
            }
          }
        }
        
        // Find SleepIQ score - look for the large central number (65 from screenshot)
        if (!results.sleepScore) {
          for (const el of allElements) {
            const text = el.textContent || '';
            if ((text.includes('SleepIQ') && text.includes('score')) || 
                text.trim().match(/^\d{2}$/)) {
              const numberMatch = text.match(/\b(\d{2})\b/);
              if (numberMatch && parseInt(numberMatch[1]) >= 0 && parseInt(numberMatch[1]) <= 100) {
                results.sleepScore = numberMatch[1];
                break;
              }
              // Check siblings for the actual score number
              const parent = el.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children);
                for (const sibling of siblings) {
                  const sibText = sibling.textContent || '';
                  const sibMatch = sibText.match(/^\s*(\d{2})\s*$/);
                  if (sibMatch && parseInt(sibMatch[1]) >= 0 && parseInt(sibMatch[1]) <= 100) {
                    results.sleepScore = sibMatch[1];
                    break;
                  }
                }
                if (results.sleepScore) break;
              }
            }
          }
        }
        
        // Strategy 3: Use the correct pattern-based extraction from body text
        // The page text has clear structure: "30-day avg\n69\nSleepIQ® score\n65\nAll-time best\n88"
        const bodyText = document.body.innerText;
        
        // Extract 30-day average - look for number immediately after "30-day avg"
        const thirtyDayPattern = /30-day avg[\s\n]+(\d{1,3})/i;
        const thirtyDayMatch = bodyText.match(thirtyDayPattern);
        if (thirtyDayMatch) {
          results.thirtyDayAvg = thirtyDayMatch[1];
        }
        
        // Extract SleepIQ score - look for number immediately after "SleepIQ® score" or "SleepIQ score"
        const scorePattern = /SleepIQ[®]?\s*score[\s\n]+(\d{1,3})/i;
        const scoreMatch = bodyText.match(scorePattern);
        if (scoreMatch) {
          results.sleepScore = scoreMatch[1];
        }
        
        // Extract all-time best - look for number immediately after "All-time best"
        const bestPattern = /All-time best[\s\n]+(\d{1,3})/i;
        const bestMatch = bodyText.match(bestPattern);
        if (bestMatch) {
          results.allTimeBest = bestMatch[1];
        }
        
      } catch (error) {
        results.debugInfo.error = error instanceof Error ? error.message : String(error);
      }
      
      return results;
    });
    
    // Assign the extracted values
    sleepMetrics['30-average'] = dashboardData.thirtyDayAvg;
    sleepMetrics['score'] = dashboardData.sleepScore;
    sleepMetrics['all-time-best'] = dashboardData.allTimeBest;
    
    // Only log detailed extraction results if extraction fails or verbose mode is enabled
    if (process.env.VERBOSE_EXTRACTION === 'true' || !dashboardData.thirtyDayAvg) {
      logger.debug('Dashboard extraction results:', {
        'thirtyDayAvg': dashboardData.thirtyDayAvg,
        'sleepScore': dashboardData.sleepScore,
        'allTimeBest': dashboardData.allTimeBest
      });
    }
    
    if (sleepMetrics['30-average'] && sleepMetrics['score'] && sleepMetrics['all-time-best']) {
      logger.info('Dashboard metrics extracted successfully');
    } else {
      logger.debug('Extracted dashboard metrics:', {
        '30-average': sleepMetrics['30-average'],
        'score': sleepMetrics['score'],
        'all-time-best': sleepMetrics['all-time-best']
      });
    }
    
    // Store raw data for debugging
    const pageText = await page.evaluate(() => document.body.innerText);
    sleepMetrics.raw = {
      pageText: pageText.substring(0, 2000), // More text for debugging
      url: page.url(),
      extractedAt: new Date().toISOString(),
      dashboardData
    };
    
  } catch (error) {
    logger.warn('Error extracting dashboard metrics:', error);
    // Continue with empty strings - don't throw
  }

  return sleepMetrics;
}

/**
 * Open sleep session details and extract the general sleep message
 */
async function openSleepSessionDetails(page: Page): Promise<string> {
  if (process.env.VERBOSE_NAVIGATION === 'true') {
    logger.debug('Attempting to extract sleep session message from Sleep Session details page...');
  }
  
  try {
    // Store the current URL to navigate back later
    const originalUrl = page.url();
    
    // Navigate directly to the Sleep Session details page instead of clicking buttons
    const sleepSessionUrl = originalUrl.replace('#/pages/sleep', '#/pages/sleep/details/sleep-session');
    
    try {
      // Navigate directly to the sleep session details page
      await page.goto(sleepSessionUrl, { waitUntil: 'networkidle2' });
    } catch (error) {
      logger.debug('Direct navigation failed, trying alternative URL construction:', error);
      
      // Fallback: construct URL from base
      const baseUrl = originalUrl.split('#')[0];
      const fallbackUrl = baseUrl + '#/pages/sleep/details/sleep-session';
      
      try {
        await page.goto(fallbackUrl, { waitUntil: 'networkidle2' });
        logger.debug('Successfully navigated using fallback URL:', fallbackUrl);
      } catch (fallbackError) {
        logger.debug('Both navigation attempts failed:', fallbackError);
        return '';
      }
    }
    
    // Wait a moment for the page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    const currentUrl = page.url();
    logger.debug('Current URL after navigation:', currentUrl);
    
    // Verify we're on the sleep session details page
    if (!currentUrl.includes('sleep-session')) {
      logger.debug('Not on expected sleep session details page, URL:', currentUrl);
      return '';
    }
    
    logger.debug('Successfully on sleep session details page');
    
    
    // Extract the message from the details page
    logger.debug('Extracting message from page...');
    const sleepMessage = await page.evaluate(() => {
      // Try the specific selector first
      const messageElement = document.querySelector('span.siq-text-900.fs-16.white.mt-24.p-12.text-center');
      if (messageElement) {
        const text = messageElement.textContent?.trim() || '';
        console.log('Found message using specific selector:', text);
        return text;
      }
      
      // Fallback: look for any span with similar classes that contains sleep advice
      const fallbackElements = document.querySelectorAll('span.siq-text-900');
      for (const element of fallbackElements) {
        const text = element.textContent?.trim() || '';
        // Look for message-like text (longer than 20 chars, contains advice/feedback)
        if (text.length > 20 && text.length < 300 && 
            (text.includes('you') || text.includes('your')) && 
            (text.includes('sleep') || text.includes('restless') || text.includes('bed')) &&
            !text.includes('30-day') && !text.includes('SleepIQ') && 
            !text.includes('PM') && !text.includes('AM') && 
            !text.includes('Average') && !text.includes('Details') &&
            !text.includes('Wind down') && !text.includes('Workout')) {
          console.log('Found message using fallback selector:', text);
          return text;
        }
      }
      
      // Final fallback: use regex patterns but be more specific
      const pageText = document.body.innerText;
      const messagePatterns = [
        /You were more restless than normal\. Is there a change you can make to your sleep routine to get back on track\?/,
        /You had fewer bed exits than your average, which may help you achieve your sleep goal more often\./,
        /Your restless sleep was higher[^.]*\.[^.]*\./,
        /(?:You|Your)[^.]*(?:restless|sleep)[^.]*(?:routine|track|average|goal)[^.]*\./
      ];
      
      for (const pattern of messagePatterns) {
        const match = pageText.match(pattern);
        if (match) {
          console.log('Found message using pattern:', match[0]);
          return match[0].trim();
        }
      }
      
      console.log('No sleep session message found');
      return '';
    });
    
    // Navigate back to the dashboard
    if (page.url() !== originalUrl) {
      logger.debug('Navigating back to dashboard...');
      
      try {
        // Try using the back button first by finding it with evaluate
        const backButtonFound = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('a, button, [role="button"]'));
          const backButton = buttons.find(btn => {
            const text = btn.textContent?.toLowerCase() || '';
            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
            return text.includes('back') || ariaLabel.includes('back') || text.includes('←');
          });
          
          if (backButton) {
            (backButton as HTMLElement).click();
            return true;
          }
          return false;
        });
        
        if (backButtonFound) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          logger.debug('Used back button to return to dashboard');
        } else {
          // Fallback to direct navigation
          await page.goto(originalUrl, { waitUntil: 'networkidle2' });
          logger.debug('Used direct navigation to return to dashboard');
        }
      } catch (error) {
        logger.debug('Error navigating back, continuing...', error);
      }
    }
    
    if (sleepMessage) {
      logger.debug('Successfully extracted sleep session message:', sleepMessage.substring(0, 100) + '...');
      return sleepMessage.trim();
    }
    
    logger.debug('No sleep session message found');
    return '';
    
  } catch (error) {
    logger.warn('Error extracting sleep session message:', error);
    return '';
  }
}

/**
 * Open biosignals details and extract heart rate, HRV, and breath rate messages
 */
async function openBiosignalsDetails(page: Page): Promise<{
  heartRateMsg: string;
  heartRateVariabilityMsg: string;
  breathRateMsg: string;
}> {
  logger.debug('Attempting to extract biosignals messages...');
  
  const results = {
    heartRateMsg: '',
    heartRateVariabilityMsg: '',
    breathRateMsg: ''
  };
  
  try {
    const originalUrl = page.url();
    logger.debug('Starting from URL:', originalUrl);
    
    // Direct navigation approach - construct the biosignals URL
    let biosignalsUrl = originalUrl;
    if (originalUrl.includes('#/pages/sleep')) {
      biosignalsUrl = originalUrl.replace('#/pages/sleep', '#/pages/sleep/details/biosignals');
    } else {
      const baseUrl = originalUrl.split('#')[0];
      biosignalsUrl = baseUrl + '#/pages/sleep/details/biosignals';
    }
    
    logger.debug('Navigating directly to biosignals details page:', biosignalsUrl);
    
    try {
      await page.goto(biosignalsUrl, { waitUntil: 'networkidle2' });
      logger.debug('Successfully navigated to biosignals page');
    } catch (error) {
      logger.debug('Direct navigation failed, trying button click approach...', error);
      
      // Fallback to button click approach if direct navigation fails
      const biosignalsButtonFound = await page.evaluate(() => {
        // Look for View Details button specifically for biosignals
        const allButtons = Array.from(document.querySelectorAll('button'));
        return allButtons.some(button => {
          const buttonText = button.textContent?.toLowerCase() || '';
          const parentText = button.parentElement?.textContent?.toLowerCase() || '';
          return buttonText.includes('view details') && 
                 (parentText.includes('biosignals') || parentText.includes('heart rate'));
        });
      });
      
      if (!biosignalsButtonFound) {
        logger.debug('No biosignals View Details button found, skipping biosignals extraction');
        return results;
      }
      
      // Click the biosignals View Details button
      const clicked = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const biosignalsButton = allButtons.find(button => {
          const buttonText = button.textContent?.toLowerCase() || '';
          const parentText = button.parentElement?.textContent?.toLowerCase() || '';
          return buttonText.includes('view details') && 
                 (parentText.includes('biosignals') || parentText.includes('heart rate'));
        });
        
        if (biosignalsButton) {
          (biosignalsButton as HTMLElement).click();
          return true;
        }
        return false;
      });
      
      if (!clicked) {
        logger.debug('Could not click biosignals View Details button');
        return results;
      }
      
      // Wait for navigation after button click
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Wait for the biosignals page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify we're on the biosignals details page
    const currentUrl = page.url();
    logger.debug('Current URL after navigation:', currentUrl);
    
    if (!currentUrl.includes('biosignals')) {
      logger.debug('Not on biosignals details page, URL:', currentUrl);
      return results;
    }
    
    logger.debug('Successfully on biosignals details page');
    
    // Function to extract message from current active tab
    const extractCurrentTabMessage = async () => {
      return await page.evaluate(() => {
        // Look for message text in the active tab content area
        // Based on MCP observation, the message is in the main content area
        const contentDiv = document.querySelector('div[class*="317"]') || 
                          document.querySelector('div[class*="content"]') ||
                          document.querySelector('div.generic');
        
        if (contentDiv) {
          const textElements = Array.from(contentDiv.querySelectorAll('*')).filter(el => {
            const text = el.textContent?.trim();
            return text && text.length > 40 && text.length < 500 &&
                   (text.includes('heart rate') || text.includes('HRV') || text.includes('breath rate') ||
                    text.includes('efficiently') || text.includes('variability') || text.includes('SleepIQ') ||
                    text.includes('average range') || text.includes('working more') || text.includes('impacted')) &&
                   (text.includes('.') || text.includes('!')) &&
                   !text.includes('30-day') && !text.includes('Why is') && !text.includes('BPM') &&
                   !text.includes('Trends') && !text.includes('Min') && !text.includes('Max');
          });
          
          // Return the first matching message
          for (const element of textElements) {
            const text = element.textContent?.trim();
            if (text && !text.includes('\n') && text.length > 40) {
              console.log('Found biosignals message:', text);
              return text;
            }
          }
        }
        
        // Fallback: look anywhere on the page for characteristic messages
        const allText = document.body.innerText;
        
        // Heart Rate message patterns
        if (allText.includes('heart is working more efficiently')) {
          const match = allText.match(/A lower heart rate generally means your heart is working more efficiently\. That's great news!/i);
          if (match) return match[0];
        }
        
        // HRV message patterns - multiple variants
        if (allText.includes('HRV can be impacted')) {
          const match = allText.match(/HRV can be impacted by the quality of your sleep\. Your HRV is in the mid-range, so way to go\./i);
          if (match) return match[0];
        }
        
        // Miki's HRV message pattern
        if (allText.includes('relaxing activity may help to raise HRV')) {
          const match = allText.match(/A relaxing activity may help to raise HRV, especially since stress can lower it\. Your HRV is in the mid-range\./i);
          if (match) return match[0];
        }
        
        // More general HRV message patterns
        if (allText.includes('HRV') && allText.includes('mid-range')) {
          const patterns = [
            /A relaxing activity may help to raise HRV[^.]*\. Your HRV is in the mid-range\./i,
            /Your HRV[^.]*mid-range[^.]*\./i,
            /HRV[^.]*stress[^.]*mid-range[^.]*\./i
          ];
          
          for (const pattern of patterns) {
            const match = allText.match(pattern);
            if (match) return match[0];
          }
        }
        
        // Breath Rate message patterns
        if (allText.includes('SleepIQ') && allText.includes('breath rate') && allText.includes('average range')) {
          const match = allText.match(/Your SleepIQ[®]? score was positively affected because your breath rate was within your average range\. Sometimes, average is good!/i);
          if (match) return match[0];
        }
        
        console.log('No specific biosignals message found');
        return '';
      });
    };
    
    // Revert to the working approach and fix it properly
    // Extract Heart Rate message (should be default active tab)
    logger.debug('Extracting Heart Rate message...');
    const heartRateMessage = await extractCurrentTabMessage();
    results.heartRateMsg = heartRateMessage;
    logger.debug('Heart Rate message extracted:', heartRateMessage);
    
    // Debug: Check what tabs are available on the biosignals page
    const availableTabs = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const potentialTabs = [];
      
      for (const el of allElements) {
        const text = el.textContent?.trim();
        const htmlEl = el as HTMLElement;
        if (text && (text.includes('Heart') || text.includes('HRV') || text.includes('Breath') || text.includes('Rate') || text.includes('Variability')) &&
            text.length < 50 && htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0) {
          potentialTabs.push({
            text: text,
            tagName: el.tagName,
            className: htmlEl.className,
            clickable: window.getComputedStyle(htmlEl).cursor === 'pointer' || el.tagName === 'GENERIC'
          });
        }
      }
      return potentialTabs;
    });
    logger.debug('Available tabs on biosignals page:', availableTabs);
    
    // Click on Heart Rate Variability tab and extract message
    logger.debug('Clicking on Heart Rate Variability tab...');
    try {
      const hrvTabClicked = await page.evaluate(() => {
        // Look for HRV tab with flexible matching
        const allElements = Array.from(document.querySelectorAll('*'));
        
        // Try different variations of HRV tab text
        const hrvTexts = ['Heart Rate Variability', 'HRV'];
        
        for (const hrvText of hrvTexts) {
          const hrvTab = allElements.find(el => {
            const text = el.textContent?.trim();
            const htmlEl = el as HTMLElement;
            return text === hrvText && htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0;
          });
          
          if (hrvTab) {
            console.log('Found HRV tab:', hrvText);
            (hrvTab as HTMLElement).click();
            return hrvText;
          }
        }
        
        console.log('HRV tab not found');
        return false;
      });
      
      if (hrvTabClicked) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Debug: Check what content is available after clicking HRV tab
        const hrvPageContent = await page.evaluate(() => {
          const allText = document.body.innerText;
          const hrvRelatedText = [];
          
          // Look for any text containing HRV or variability
          const lines = allText.split('\n');
          for (const line of lines) {
            if (line.toLowerCase().includes('hrv') || line.toLowerCase().includes('variability')) {
              hrvRelatedText.push(line.trim());
            }
          }
          
          return {
            hasHrvText: allText.toLowerCase().includes('hrv'),
            hasVariabilityText: allText.toLowerCase().includes('variability'),
            hrvRelatedLines: hrvRelatedText,
            pageUrl: window.location.href
          };
        });
        
        logger.debug('HRV page content analysis:', hrvPageContent);
        
        const hrvMessage = await extractCurrentTabMessage();
        results.heartRateVariabilityMsg = hrvMessage;
        logger.debug('HRV message extracted:', hrvMessage);
        
        // If no message found, try alternative extraction
        if (!hrvMessage && hrvPageContent.hasHrvText) {
          const alternativeHrv = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const patterns = [
              /HRV can be impacted[^.!]*[.!]/i,
              /Your HRV[^.!]*[.!]/i,
              /heart rate variability[^.!]*[.!]/i,
              /A relaxing activity may help to raise HRV[^.!]*[.!]/i,
              /relaxing activity[^.!]*HRV[^.!]*mid-range[^.!]*[.!]/i
            ];
            
            for (const pattern of patterns) {
              const match = bodyText.match(pattern);
              if (match) {
                return match[0].trim();
              }
            }
            return '';
          });
          
          if (alternativeHrv) {
            results.heartRateVariabilityMsg = alternativeHrv;
            logger.debug('Alternative HRV extraction successful:', alternativeHrv);
          }
        }
      }
    } catch (error) {
      logger.debug('Could not extract HRV message:', error);
    }
    
    // Click on Breath Rate tab and extract message
    logger.debug('Clicking on Breath Rate tab...');
    try {
      const breathTabClicked = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        const breathTab = allElements.find(el => {
          const text = el.textContent?.trim();
          const htmlEl = el as HTMLElement;
          return text === 'Breath Rate' && htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0;
        });
        
        if (breathTab) {
          (breathTab as HTMLElement).click();
          console.log('Clicked Breath Rate tab');
          return true;
        }
        console.log('Breath Rate tab not found');
        return false;
      });
      
      if (breathTabClicked) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const breathMessage = await extractCurrentTabMessage();
        results.breathRateMsg = breathMessage;
        logger.debug('Breath Rate message extracted:', breathMessage);
      }
    } catch (error) {
      logger.debug('Could not extract breath rate message:', error);
    }
    
    logger.debug('Final biosignals extraction results:', {
      heartRate: results.heartRateMsg ? results.heartRateMsg.substring(0, 50) + '...' : 'empty',
      hrv: results.heartRateVariabilityMsg ? results.heartRateVariabilityMsg.substring(0, 50) + '...' : 'empty',
      breathRate: results.breathRateMsg ? results.breathRateMsg.substring(0, 50) + '...' : 'empty'
    });
    
    // Navigate back to dashboard
    try {
      if (originalUrl !== currentUrl) {
        logger.debug('Navigating back to dashboard...');
        await page.goto(originalUrl, { waitUntil: 'networkidle2' });
        logger.debug('Successfully navigated back to dashboard');
      }
    } catch (error) {
      logger.debug('Error navigating back to dashboard:', error);
    }
    
  } catch (error) {
    logger.warn('Error extracting biosignals messages:', error);
  }
  
  // Clean up messages (normalize whitespace)
  Object.keys(results).forEach(key => {
    const typedKey = key as keyof typeof results;
    if (results[typedKey]) {
      results[typedKey] = results[typedKey]
        .replace(/\s+/g, ' ')
        .trim();
    }
  });
  
  return results;
}

/**
 * Orchestrated sleep data extraction that combines all extraction steps
 */
async function extractSleepDataOrchestrated(page: Page): Promise<SleepMetrics> {
  logger.debug('Starting orchestrated sleep data extraction...');
  
  // Initialize with empty values
  const sleepMetrics: SleepMetrics = {
    '30-average': '',
    'score': '',
    'all-time-best': '',
    'message': '',
    'heartRateMsg': '',
    'heartRateVariabilityMsg': '',
    'breathRateMsg': '',
    // Legacy fields
    date: new Date().toISOString().split('T')[0]
  };
  
  try {
    // Step 1: Extract the three main dashboard numbers
    logger.debug('Step 1: Extracting dashboard metrics...');
    const dashboardData = await extractSleepData(page);
    
    // Copy the numeric values
    sleepMetrics['30-average'] = dashboardData['30-average'];
    sleepMetrics['score'] = dashboardData['score'];
    sleepMetrics['all-time-best'] = dashboardData['all-time-best'];
    
    // Copy legacy fields if they exist
    if (dashboardData.raw) sleepMetrics.raw = dashboardData.raw;
    
    logger.debug('Dashboard metrics extracted:', {
      '30-average': sleepMetrics['30-average'],
      'score': sleepMetrics['score'],
      'all-time-best': sleepMetrics['all-time-best']
    });
    
    // Step 2: Extract the general sleep message using improved method
    logger.debug('Step 2: Extracting sleep session message...');
    const sleepMessage = await extractSleepSessionMessageImproved(page);
    sleepMetrics['message'] = sleepMessage;
    
    logger.debug('Sleep message extracted:', sleepMessage);
    
    // Step 3: Extract biosignals messages using improved method
    logger.debug('Step 3: Extracting biosignals messages...');
    const biosignalsData = await extractBiosignalsMessagesImproved(page);
    
    sleepMetrics['heartRateMsg'] = biosignalsData.heartRateMsg;
    sleepMetrics['heartRateVariabilityMsg'] = biosignalsData.heartRateVariabilityMsg;
    sleepMetrics['breathRateMsg'] = biosignalsData.breathRateMsg;
    
    logger.debug('Biosignals messages extracted:', {
      heartRate: sleepMetrics['heartRateMsg'],
      hrv: sleepMetrics['heartRateVariabilityMsg'],
      breathRate: sleepMetrics['breathRateMsg']
    });
    
    // Final validation - ensure all required fields are strings
    const requiredFields: (keyof SleepMetrics)[] = [
      '30-average', 'score', 'all-time-best', 'message', 
      'heartRateMsg', 'heartRateVariabilityMsg', 'breathRateMsg'
    ];
    
    requiredFields.forEach(field => {
      if (typeof sleepMetrics[field] !== 'string') {
        logger.warn(`Field ${String(field)} is not a string, converting...`);
        sleepMetrics[field] = String(sleepMetrics[field] || '');
      }
    });
    
    logger.info('Orchestrated sleep data extraction completed successfully');
    
  } catch (error) {
    logger.error('Error in orchestrated sleep data extraction:', error);
    // Don't throw - return partial results with empty strings for failed extractions
  }
  
  return sleepMetrics;
}

export async function scrapeSleepDataBySleeper(
  credentials: SleepIQCredentials,
  options: ScraperOptions = {}
): Promise<SleepDataBySleeper> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await launchBrowser(options);
    page = await newPage(browser, options);

    logger.info('Navigating to SleepIQ login page');
    await page.goto(SLEEPIQ_URLS.LOGIN, { waitUntil: 'networkidle2' });

    // Wait for login form to be ready and interactive
    await page.waitForSelector('input[type="email"], input[name="email"], input[id*="email"]', { timeout: 10000 });
    
    // Wait for the form to be fully interactive
    logger.debug('Waiting for form to be interactive...');
    await page.waitForFunction(() => {
      const emailInput = document.querySelector('input[type="email"], input[name="email"], input[id*="email"]') as HTMLInputElement;
      const passwordInput = document.querySelector('input[type="password"], input[name="password"], input[id*="password"]') as HTMLInputElement;
      return emailInput && passwordInput && !emailInput.disabled && !passwordInput.disabled;
    }, { timeout: 10000 });
    
    logger.info('Logging in to SleepIQ');
    
    // Clear any existing values and fill in credentials
    const emailSelector = 'input[type="email"], input[name="email"], input[id*="email"]';
    const passwordSelector = 'input[type="password"], input[name="password"], input[id*="password"]';
    
    // Clear and type email
    await page.click(emailSelector);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.type(emailSelector, credentials.username);
    
    // Clear and type password
    await page.click(passwordSelector);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.type(passwordSelector, credentials.password);
    
    // Trigger input events to ensure the SPA recognizes the changes
    await page.evaluate((emailSel, passSel) => {
      const emailInput = document.querySelector(emailSel) as HTMLInputElement;
      const passwordInput = document.querySelector(passSel) as HTMLInputElement;
      
      if (emailInput) {
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        emailInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      
      if (passwordInput) {
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }, emailSelector, passwordSelector);
    
    // Wait for any validation or dynamic updates
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Try to find and click the login button
    let buttonClicked = false;
    
    // Strategy 1: Look for button with "login" text
    try {
      const loginButton = await page.evaluateHandle(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        return allElements.find(el => {
          const text = el.textContent?.trim().toLowerCase();
          const htmlEl = el as HTMLElement;
          return text === 'login' && 
                 htmlEl.offsetWidth > 0 && 
                 htmlEl.offsetHeight > 0 &&
                 (el.tagName === 'BUTTON' || 
                  el.getAttribute('role') === 'button' ||
                  (htmlEl as any).onclick ||
                  window.getComputedStyle(el).cursor === 'pointer');
        });
      });
      
      if (loginButton && loginButton.asElement()) {
        logger.debug('Found login button, attempting to click...');
        await (loginButton.asElement() as any)!.click();
        buttonClicked = true;
        logger.debug('Login button clicked successfully');
      }
    } catch (error) {
      logger.debug('Login button click failed:', error);
    }
    
    // Strategy 2: Try common button selectors
    if (!buttonClicked) {
      const buttonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:not([disabled])',
        '[role="button"]:not([disabled])',
        '.btn:not([disabled])',
        '.button:not([disabled])'
      ];
      
      for (const selector of buttonSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            logger.debug(`Found button with selector: ${selector}`);
            await button.click();
            buttonClicked = true;
            break;
          }
        } catch (error) {
          logger.debug(`Selector ${selector} failed:`, error);
        }
      }
    }
    
    // Strategy 3: Press Enter on password field (common SPA pattern)
    if (!buttonClicked) {
      logger.debug('Trying Enter key on password field...');
      await page.focus(passwordSelector);
      await page.keyboard.press('Enter');
      buttonClicked = true;
    }

    logger.debug('Waiting for navigation after login');
    
    // Wait for either navigation or error messages
    try {
      // Wait for navigation with a reasonable timeout
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }),
        page.waitForFunction(() => {
          // Check if we're no longer on login page
          const currentPath = window.location.pathname + window.location.hash;
          return !currentPath.includes('login') && !currentPath.includes('signin');
        }, { timeout: 8000 }),
        // Also wait for any error messages to appear
        page.waitForSelector('[class*="error"], [class*="invalid"], .alert, .message', { timeout: 5000 }).catch(() => null)
      ]);
      
      logger.debug('Navigation or page change detected');
    } catch (error) {
      logger.debug('Navigation timeout, checking current state...');
    }
    
    // Additional wait for any dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for error messages and validation feedback
    const loginPageInfo = await page.evaluate(() => {
      // Look for error messages
      const errorElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent?.toLowerCase() || '';
        const isSmallElement = el.textContent && el.textContent.length < 200;
        return isSmallElement && (
          text.includes('invalid') || 
          text.includes('incorrect') || 
          text.includes('wrong') ||
          text.includes('error') ||
          text.includes('failed') ||
          text.includes('try again') ||
          text.includes('check') ||
          el.classList.toString().includes('error') ||
          el.classList.toString().includes('invalid')
        );
      });
      
      // Check for any red text or error styling
      const redElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        const isRed = style.color.includes('255, 0, 0') || style.color.includes('red') || style.backgroundColor.includes('red');
        const hasText = el.textContent && el.textContent.trim().length > 0 && el.textContent.length < 100;
        return isRed && hasText;
      });
      
      // Check if still on login page or moved
      const currentPath = window.location.pathname + window.location.hash;
      
      return {
        errorMessages: errorElements.map(el => el.textContent?.trim()).filter(text => text),
        redElements: redElements.map(el => el.textContent?.trim()).filter(text => text),
        currentPath,
        title: document.title,
        hasLoginForm: !!document.querySelector('input[type="email"], input[type="password"]')
      };
    });
    
    logger.debug('Page status after login attempt:', JSON.stringify(loginPageInfo, null, 2));

    // Check if we're still on the login page (indicating failed login)
    const currentUrl = page.url();
    const isStillOnLogin = currentUrl.includes('login') || loginPageInfo.hasLoginForm;
    
    if (isStillOnLogin) {
      if (options.debug) {
        await takeDebugScreenshot(page, 'login-failed.png');
      }
      
      // Build comprehensive error message
      let errorMessage = 'Login failed';
      if (loginPageInfo.errorMessages.length > 0) {
        errorMessage += ` - Error messages: ${loginPageInfo.errorMessages.join(', ')}`;
      }
      if (loginPageInfo.redElements.length > 0) {
        errorMessage += ` - Red text found: ${loginPageInfo.redElements.join(', ')}`;
      }
      if (loginPageInfo.errorMessages.length === 0 && loginPageInfo.redElements.length === 0) {
        errorMessage += ' - No visible error messages. Check credentials or possible 2FA requirement.';
      }
      
      throw new Error(errorMessage);
    }

    logger.info('Login successful, extracting sleep data for both sleepers');

    // Navigate to dashboard if not already there
    if (!currentUrl.includes('dashboard')) {
      await page.goto(SLEEPIQ_URLS.DASHBOARD, { waitUntil: 'networkidle2' });
    }

    // Wait for sleep data to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (options.debug) {
      await takeDebugScreenshot(page, 'dashboard.png');
    }

    // Extract sleep data for both sleepers using the enhanced orchestrated approach
    const sleepData = await extractSleepDataForBothSleepersEnhanced(page);
    
    logger.info('Successfully extracted sleep data for both sleepers');
    return sleepData;

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
async function extractSleepDataForBothSleepers(page: Page): Promise<SleepDataBySleeper> {
  logger.debug('Extracting sleep data for both sleepers from dashboard');
  
  const sleepData: SleepDataBySleeper = {
    rafa: {
      '30-average': '',
      'score': '',
      'all-time-best': '',
      'message': '',
      'heartRateMsg': '',
      'heartRateVariabilityMsg': '',
      'breathRateMsg': '',
      date: new Date().toISOString().split('T')[0],
    },
    miki: {
      '30-average': '',
      'score': '',
      'all-time-best': '',
      'message': '',
      'heartRateMsg': '',
      'heartRateVariabilityMsg': '',
      'breathRateMsg': '',
      date: new Date().toISOString().split('T')[0],
    }
  };

  try {
    // First, let's explore the dashboard to understand the structure
    const dashboardInfo = await page.evaluate(() => {
      // Look for sleeper dropdown or toggle elements
      const dropdowns = Array.from(document.querySelectorAll('select, [role="combobox"], [aria-haspopup="listbox"]'));
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const sleeperElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent?.toLowerCase() || '';
        return text.includes('rafa') || text.includes('miki') || text.includes('sleeper');
      });

      return {
        dropdowns: dropdowns.map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          className: el.className,
          id: el.id,
          options: Array.from(el.querySelectorAll('option')).map(opt => opt.textContent?.trim())
        })),
        buttons: buttons.map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          className: el.className,
          id: el.id
        })).filter(btn => btn.text && btn.text.length < 50),
        sleeperElements: sleeperElements.map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          className: el.className,
          id: el.id
        }))
      };
    });

    logger.debug('Dashboard structure:', JSON.stringify(dashboardInfo, null, 2));

    // Try to find and interact with sleeper selection
    let sleeperFound = false;
    
    // Look for dropdown with sleeper names
    for (const dropdown of dashboardInfo.dropdowns) {
      if (dropdown.options.some(opt => opt?.toLowerCase().includes('rafa') || opt?.toLowerCase().includes('miki'))) {
        logger.debug('Found sleeper dropdown:', dropdown);
        sleeperFound = true;
        break;
      }
    }

    // Look for buttons that might toggle between sleepers
    const sleeperButtons = dashboardInfo.buttons.filter(btn => 
      btn.text?.toLowerCase().includes('rafa') || 
      btn.text?.toLowerCase().includes('miki') ||
      btn.text?.toLowerCase().includes('sleeper')
    );

    if (sleeperButtons.length > 0) {
      logger.debug('Found sleeper buttons:', sleeperButtons);
      sleeperFound = true;
    }

    if (!sleeperFound) {
      logger.warn('Could not find sleeper selection mechanism, extracting current view data only');
      // Extract data from current view and assign to both sleepers
      const currentData = await extractSleepData(page);
      sleepData.rafa = { ...currentData };
      sleepData.miki = { ...currentData };
      return sleepData;
    }

    // Try to extract data for each sleeper
    const sleeperNames = ['rafa', 'miki'];
    
    for (const sleeperName of sleeperNames) {
      logger.debug(`Extracting data for ${sleeperName}`);
      
      try {
        // Try to find and click sleeper selection
        const sleeperSelected = await page.evaluate((name) => {
          // Look for dropdown options
          const dropdowns = Array.from(document.querySelectorAll('select, [role="combobox"]'));
          for (const dropdown of dropdowns) {
            const options = Array.from(dropdown.querySelectorAll('option'));
            const matchingOption = options.find(opt => 
              opt.textContent?.toLowerCase().includes(name.toLowerCase())
            );
            if (matchingOption) {
              (dropdown as HTMLSelectElement).value = matchingOption.value;
              dropdown.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }

          // Look for buttons
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
          const matchingButton = buttons.find(btn => 
            btn.textContent?.toLowerCase().includes(name.toLowerCase())
          );
          if (matchingButton) {
            (matchingButton as HTMLElement).click();
            return true;
          }

          return false;
        }, sleeperName);

        if (sleeperSelected) {
          logger.debug(`Successfully selected ${sleeperName}`);
          // Wait for data to load
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          logger.debug(`Could not find selection for ${sleeperName}, using current view`);
        }

        // Extract sleep data for current sleeper
        const sleeperData = await extractSleepData(page);
        sleepData[sleeperName as keyof SleepDataBySleeper] = sleeperData;
        
        logger.debug(`Extracted data for ${sleeperName}:`, JSON.stringify(sleeperData, null, 2));

      } catch (error) {
        logger.warn(`Error extracting data for ${sleeperName}:`, error);
        // Set basic structure if extraction fails
        sleepData[sleeperName as keyof SleepDataBySleeper] = {
          '30-average': '',
          'score': '',
          'all-time-best': '',
          'message': '',
          'heartRateMsg': '',
          'heartRateVariabilityMsg': '',
          'breathRateMsg': '',
          date: new Date().toISOString().split('T')[0],
          raw: { error: error instanceof Error ? error.message : String(error) }
        };
      }
    }

  } catch (error) {
    logger.warn('Error in sleeper data extraction, falling back to single extraction:', error);
    // Fallback: extract current view data for both sleepers
    const currentData = await extractSleepData(page);
    sleepData.rafa = { ...currentData };
    sleepData.miki = { ...currentData };
  }

  return sleepData;
}

/**
 * Select a specific sleeper and wait for dashboard to update
 */
async function selectSleeper(page: Page, sleeperName: string): Promise<boolean> {
  logger.debug(`Attempting to select sleeper: ${sleeperName}`);
  
  try {
    // Step 1: Find and click the sleeper dropdown to open it
    const dropdownFound = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      
      for (const el of allElements) {
        const text = el.textContent?.trim().toLowerCase() || '';
        const htmlEl = el as HTMLElement;
        
        // Look for elements that contain sleeper names and have dropdown indicators
        if ((text.includes('rafa') || text.includes('miki')) && 
            (text.includes('▼') || htmlEl.classList.toString().includes('dropdown') ||
             htmlEl.getAttribute('role') === 'button' || el.tagName === 'BUTTON' ||
             window.getComputedStyle(htmlEl).cursor === 'pointer')) {
          console.log('Found sleeper dropdown button:', text);
          htmlEl.click();
          return true;
        }
      }
      return false;
    });
    
    if (!dropdownFound) {
      logger.debug('Could not find sleeper dropdown button');
      return false;
    }
    
    // Step 2: Wait for dropdown to open, then find and click the target sleeper
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const sleeperSelected = await page.evaluate((name) => {
      const allElements = Array.from(document.querySelectorAll('*'));
      
      for (const el of allElements) {
        const text = el.textContent?.trim().toLowerCase() || '';
        const htmlEl = el as HTMLElement;
        
        // Look for clickable element with the target sleeper name
        if (text === name.toLowerCase() && 
            (htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0) &&
            (el.tagName === 'BUTTON' || htmlEl.getAttribute('role') === 'button' ||
             htmlEl.classList.contains('clickable') || 
             window.getComputedStyle(htmlEl).cursor === 'pointer')) {
          console.log(`Clicking sleeper option: ${text}`);
          htmlEl.click();
          return true;
        }
      }
      return false;
    }, sleeperName);
    
    if (!sleeperSelected) {
      logger.debug(`Could not find clickable option for ${sleeperName}`);
      return false;
    }
    
    if (sleeperSelected) {
      // Wait for the dashboard to update
      logger.debug('Waiting for dashboard to update after sleeper selection...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return true;
    }
    
    return false;
  } catch (error) {
    logger.warn(`Error selecting sleeper ${sleeperName}:`, error);
    return false;
  }
}

/**
 * Enhanced function to extract sleep data for both sleepers using orchestrated approach
 */
async function extractSleepDataForBothSleepersEnhanced(page: Page): Promise<SleepDataBySleeper> {
  logger.info('Extracting sleep data for both sleepers...');
  
  const sleepData: SleepDataBySleeper = {
    rafa: {
      '30-average': '',
      'score': '',
      'all-time-best': '',
      'message': '',
      'heartRateMsg': '',
      'heartRateVariabilityMsg': '',
      'breathRateMsg': '',
      date: new Date().toISOString().split('T')[0],
    },
    miki: {
      '30-average': '',
      'score': '',
      'all-time-best': '',
      'message': '',
      'heartRateMsg': '',
      'heartRateVariabilityMsg': '',
      'breathRateMsg': '',
      date: new Date().toISOString().split('T')[0],
    }
  };
  
  try {
    const sleepers = ['rafa', 'miki'] as const;
    
    for (const sleeper of sleepers) {
      logger.info(`Extracting data for ${sleeper}...`);
      
      try {
        // Step 1: Select the sleeper
        const sleeperSelected = await selectSleeper(page, sleeper);
        
        if (!sleeperSelected) {
          logger.warn(`Could not select ${sleeper}, using current dashboard data`);
        } else {
          logger.debug(`Successfully selected ${sleeper}`);
        }
        
        // Step 2: Extract all data using orchestrated approach
        const sleeperData = await extractSleepDataOrchestrated(page);
        
        // Assign the data
        sleepData[sleeper] = sleeperData;
        
        // Log completion status
        const hasAllData = sleeperData['30-average'] && sleeperData['score'] && sleeperData['all-time-best'] && 
                          sleeperData['message'] && sleeperData['heartRateMsg'] && sleeperData['breathRateMsg'];
        logger.info(`Data extraction for ${sleeper}: ${hasAllData ? '✓ Complete' : '⚠ Partial'}`);
        
      } catch (error) {
        logger.error(`Error extracting data for ${sleeper}:`, error);
        
        // Keep the initialized empty structure - don't overwrite
        sleepData[sleeper].raw = { 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    
    // Final validation and logging
    const finalResult = {
      rafa: sleepData.rafa,
      miki: sleepData.miki
    };
    
    logger.info('Sleep data extraction completed successfully');
    
    return finalResult;
    
  } catch (error) {
    logger.error('Error in enhanced sleep data extraction:', error);
    
    // Return the initialized structure with error information
    sleepData.rafa.raw = { error: 'Enhanced extraction failed' };
    sleepData.miki.raw = { error: 'Enhanced extraction failed' };
    
    return sleepData;
  }
}
