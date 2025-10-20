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

export async function scrapeSleepMetrics(
  credentials: SleepIQCredentials,
  options: ScraperOptions = {}
): Promise<SleepDataBySleeper> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  const sessionManager = new SessionManager();

  try {
    browser = await launchBrowser(options);
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
        if (!currentUrl.includes('pages/sleep') && !currentUrl.includes('dashboard')) {
          logger.info('Navigating to sleep dashboard');
          await page.goto(SLEEPIQ_URLS.DASHBOARD, { waitUntil: 'networkidle2' });
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
  
  // Clear all cookies and local storage after page loads to ensure clean session
  try {
    await page.evaluate(() => {
      // Clear localStorage
      localStorage.clear();
      // Clear sessionStorage
      sessionStorage.clear();
    });
    
    // Clear cookies
    const cookies = await page.cookies();
    if (cookies.length > 0) {
      await page.deleteCookie(...cookies);
    }
    
    logger.debug('Browser session cleared successfully');
  } catch (error) {
    logger.debug('Could not clear browser session:', error);
    // Continue anyway
  }

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
  
  // Wait for any validation or dynamic updates and form to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
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
  
  logger.debug('Available elements:', JSON.stringify(pageInfo, null, 2));
  
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
      
      // Also try triggering form submission events
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) {
          // Dispatch submit event
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      });
      
      buttonClicked = true;
      logger.debug('Login button clicked and form events triggered');
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
  
  // More specific check: we're still on login if we have BOTH a login form AND are on initial login page
  // Allow for intermediate auth pages like /#/auth/login which might be part of successful flow
  const isStillOnLogin = loginPageInfo.hasLoginForm && 
                        (currentPath.includes('#/login') || currentPath === '/#/login');
  
  // However, if we're on /#/auth/login, let's wait longer for potential redirect
  if (currentPath.includes('auth/login') && !isStillOnLogin) {
    logger.debug('Detected auth page, waiting for potential redirect...');
    
    // Wait for up to 10 seconds for redirect, checking every 2 seconds
    let redirectWaitTime = 0;
    const maxWaitTime = 10000;
    
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
    
    logger.debug('Dashboard extraction results:', {
      'thirtyDayAvg': dashboardData.thirtyDayAvg,
      'sleepScore': dashboardData.sleepScore,
      'allTimeBest': dashboardData.allTimeBest,
      'debugInfo': dashboardData.debugInfo
    });
    
    logger.debug('Extracted dashboard metrics:', {
      '30-average': sleepMetrics['30-average'],
      'score': sleepMetrics['score'],
      'all-time-best': sleepMetrics['all-time-best']
    });
    
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
  logger.debug('Attempting to extract sleep session message from Sleep Session details page...');
  
  try {
    // Store the current URL to navigate back later
    const originalUrl = page.url();
    logger.debug('Original URL:', originalUrl);
    
    // Navigate directly to the Sleep Session details page instead of clicking buttons
    logger.debug('Navigating directly to Sleep Session details page...');
    
    const sleepSessionUrl = originalUrl.replace('#/pages/sleep', '#/pages/sleep/details/sleep-session');
    logger.debug('Target sleep session URL:', sleepSessionUrl);
    
    try {
      // Navigate directly to the sleep session details page
      await page.goto(sleepSessionUrl, { waitUntil: 'networkidle2' });
      logger.debug('Successfully navigated to sleep session details page');
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
      console.log('Current page title:', document.title);
      console.log('Current URL:', window.location.href);
      console.log('Page body text length:', document.body.innerText.length);
      
      // Look for the specific message patterns we found via MCP
      const pageText = document.body.innerText;
      
      // Pattern matching based on the messages we saw:
      // "You were more restless than normal. Is there a change you can make to your sleep routine to get back on track?"
      // "Your restless sleep was higher, but you can get back on track. If stress is keeping you up, reading before bed may help you relax and fall asleep faster."
      
      const messagePatterns = [
        /You were more restless than normal\.[^.]*\./, 
        /Your restless sleep was higher[^.]*\.[^.]*\./,
        /(?:You|Your)[^.]*(?:restless|sleep)[^.]*(?:routine|track)[^.]*\./,
        /(?:You|Your)[^.]*(?:sleep|bed)[^.]*(?:help|relax)[^.]*\./
      ];
      
      for (const pattern of messagePatterns) {
        const match = pageText.match(pattern);
        if (match) {
          console.log('Found message using pattern:', pattern.source);
          console.log('Message:', match[0]);
          return match[0].trim();
        }
      }
      
      // Fallback: Look for standalone meaningful text elements
      const allElements = Array.from(document.querySelectorAll('*'));
      
      for (const element of allElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 40 && text.length < 300) {
          const lowerText = text.toLowerCase();
          
          // Check if this looks like a sleep advice message
          if ((lowerText.includes('you') || lowerText.includes('your')) &&
              (lowerText.includes('sleep') || lowerText.includes('restless')) &&
              (text.includes('?') || text.includes('.')) &&
              !lowerText.includes('30-day') &&
              !lowerText.includes('sleepiq') &&
              !lowerText.includes('contact') &&
              !lowerText.includes('privacy')) {
            
            console.log('Found potential sleep message element:', text);
            return text;
          }
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
    // First, try to scroll to find biosignals section
    await page.evaluate(() => {
      // Look for biosignals-related content and scroll it into view
      const biosignalKeywords = ['biosignal', 'heart rate', 'variability', 'breath', 'breathing'];
      
      for (const keyword of biosignalKeywords) {
        const elements = Array.from(document.querySelectorAll('*'));
        const matchingElement = elements.find(el => 
          el.textContent?.toLowerCase().includes(keyword)
        );
        
        if (matchingElement) {
          matchingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    });
    
    // Wait for scroll to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Look for biosignals "View Details" button
    const biosignalsButtonFound = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      
      for (const button of buttons) {
        const buttonText = button.textContent?.trim().toLowerCase();
        if (buttonText?.includes('view details') || buttonText?.includes('details')) {
          // Check if this button is near biosignals content
          const buttonArea = button.closest('div, section, article') || button.parentElement;
          if (buttonArea) {
            const areaText = buttonArea.textContent?.toLowerCase() || '';
            // Check for biosignals indicators in the area
            if (areaText.includes('biosignal') || 
                areaText.includes('heart rate') ||
                areaText.includes('variability') ||
                areaText.includes('breath') ||
                areaText.includes('respiratory')) {
              return true;
            }
          }
        }
      }
      return false;
    });
    
    if (biosignalsButtonFound) {
      logger.debug('Found biosignals View Details button, attempting to click...');
      
      // Try to click the biosignals details button
      const clickResult = await withRetries(async () => {
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          
          for (const button of buttons) {
            const buttonText = button.textContent?.trim().toLowerCase();
            if (buttonText?.includes('view details') || buttonText?.includes('details')) {
              const buttonArea = button.closest('div, section, article') || button.parentElement;
              if (buttonArea) {
                const areaText = buttonArea.textContent?.toLowerCase() || '';
                if (areaText.includes('biosignal') || 
                    areaText.includes('heart rate') ||
                    areaText.includes('variability') ||
                    areaText.includes('breath') ||
                    areaText.includes('respiratory')) {
                  (button as HTMLElement).click();
                  return true;
                }
              }
            }
          }
          return false;
        });
        
        if (!clicked) {
          throw new Error('Could not click biosignals details button');
        }
        
        // Wait for modal to appear
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if modal opened
        const modalExists = await page.$('[role="dialog"], .modal, .overlay');
        return !!modalExists;
      }, { maxAttempts: 2, delay: 1000 });
      
      if (clickResult) {
        logger.debug('Successfully opened biosignals details modal');
        
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Extract messages from the modal
        const biosignalMessages = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], .modal, .overlay') as Element;
          if (!modal) return { heartRate: '', hrv: '', breathRate: '' };
          
          const results = { heartRate: '', hrv: '', breathRate: '' };
          
          // Helper function to extract message from a section
          function extractMessageFromSection(sectionKeywords: string[], messageLength = { min: 10, max: 300 }) {
            const walker = document.createTreeWalker(
              modal,
              NodeFilter.SHOW_TEXT,
              null
            );
            
            let textNode;
            const relevantTexts: string[] = [];
            
            while (textNode = walker.nextNode()) {
              const text = textNode.textContent?.trim();
              if (text && text.length >= messageLength.min && text.length <= messageLength.max) {
                const lowerText = text.toLowerCase();
                
                // Check if text contains any of the section keywords
                if (sectionKeywords.some(keyword => lowerText.includes(keyword))) {
                  // Look for sentences or substantial text
                  if (text.includes('.') || text.includes('!') || text.includes('?') || 
                      lowerText.includes('your') || lowerText.includes('average') || 
                      lowerText.includes('normal') || lowerText.includes('good') ||
                      lowerText.includes('high') || lowerText.includes('low')) {
                    relevantTexts.push(text);
                  }
                }
              }
            }
            
            // Return the most substantial/relevant text
            if (relevantTexts.length > 0) {
              return relevantTexts.sort((a, b) => b.length - a.length)[0];
            }
            return '';
          }
          
          // Extract heart rate message
          results.heartRate = extractMessageFromSection(
            ['heart rate', 'heartrate', 'resting heart', 'bpm', 'beats per minute']
          );
          
          // Extract HRV message
          results.hrv = extractMessageFromSection(
            ['heart rate variability', 'hrv', 'variability', 'recovery', 'readiness']
          );
          
          // Extract breathing rate message
          results.breathRate = extractMessageFromSection(
            ['breathing rate', 'breath rate', 'respiratory', 'respiration', 'breaths per minute']
          );
          
          return results;
        });
        
        // Assign the extracted messages
        results.heartRateMsg = biosignalMessages.heartRate || '';
        results.heartRateVariabilityMsg = biosignalMessages.hrv || '';
        results.breathRateMsg = biosignalMessages.breathRate || '';
        
        logger.debug('Extracted biosignal messages:', {
          heartRate: results.heartRateMsg,
          hrv: results.heartRateVariabilityMsg,
          breathRate: results.breathRateMsg
        });
        
        // Close the modal
        await closeModal(page);
      } else {
        logger.debug('Could not open biosignals details modal');
      }
    } else {
      logger.debug('No biosignals View Details button found');
    }
    
    // If we couldn't get messages from modal, try to extract from dashboard directly
    if (!results.heartRateMsg && !results.heartRateVariabilityMsg && !results.breathRateMsg) {
      logger.debug('Attempting to extract biosignal messages directly from dashboard...');
      
      const dashboardBiosignals = await page.evaluate(() => {
        const results = { heartRate: '', hrv: '', breathRate: '' };
        
        // Look for any text mentioning biosignals on the dashboard
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        let textNode;
        while (textNode = walker.nextNode()) {
          const text = textNode.textContent?.trim();
          if (text && text.length > 15 && text.length < 200) {
            const lowerText = text.toLowerCase();
            
            // Check for heart rate messages
            if (!results.heartRate && 
                (lowerText.includes('heart rate') || lowerText.includes('bpm')) &&
                (lowerText.includes('average') || lowerText.includes('normal') || 
                 lowerText.includes('high') || lowerText.includes('low'))) {
              results.heartRate = text;
            }
            
            // Check for HRV messages
            if (!results.hrv && 
                (lowerText.includes('variability') || lowerText.includes('hrv')) &&
                (lowerText.includes('recovery') || lowerText.includes('stress') ||
                 lowerText.includes('readiness'))) {
              results.hrv = text;
            }
            
            // Check for breathing rate messages
            if (!results.breathRate && 
                (lowerText.includes('breath') || lowerText.includes('respiratory')) &&
                (lowerText.includes('rate') || lowerText.includes('pattern'))) {
              results.breathRate = text;
            }
          }
        }
        
        return results;
      });
      
      // Use dashboard messages if found
      if (dashboardBiosignals.heartRate) results.heartRateMsg = dashboardBiosignals.heartRate;
      if (dashboardBiosignals.hrv) results.heartRateVariabilityMsg = dashboardBiosignals.hrv;
      if (dashboardBiosignals.breathRate) results.breathRateMsg = dashboardBiosignals.breathRate;
    }
    
  } catch (error) {
    logger.warn('Error extracting biosignals messages:', error);
    
    // Try to close any open modals
    try {
      await closeModal(page);
    } catch (closeError) {
      // Ignore modal close errors
    }
  }
  
  // Clean up messages (normalize whitespace and remove trailing punctuation)
  Object.keys(results).forEach(key => {
    const typedKey = key as keyof typeof results;
    if (results[typedKey]) {
      results[typedKey] = results[typedKey]
        .replace(/\s+/g, ' ')
        .replace(/[.!]+$/, '')
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
    
    // Step 2: Extract the general sleep message
    logger.debug('Step 2: Extracting sleep session message...');
    const sleepMessage = await openSleepSessionDetails(page);
    sleepMetrics['message'] = sleepMessage;
    
    logger.debug('Sleep message extracted:', sleepMessage);
    
    // Step 3: Extract biosignals messages (heart rate, HRV, breathing rate)
    logger.debug('Step 3: Extracting biosignals messages...');
    const biosignalsData = await openBiosignalsDetails(page);
    
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
    // Try to find and click the sleeper selector
    const sleeperSelected = await withRetries(async () => {
      const selected = await page.evaluate((name) => {
        // Strategy 1: Look for dropdown options
        const dropdowns = Array.from(document.querySelectorAll('select, [role="combobox"]'));
        for (const dropdown of dropdowns) {
          const options = Array.from(dropdown.querySelectorAll('option'));
          const matchingOption = options.find(opt => 
            opt.textContent?.toLowerCase().includes(name.toLowerCase())
          );
          if (matchingOption) {
            (dropdown as HTMLSelectElement).value = (matchingOption as HTMLOptionElement).value;
            dropdown.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        
        // Strategy 2: Look for clickable elements with the sleeper name
        const allElements = Array.from(document.querySelectorAll('*'));
        const matchingElement = allElements.find(el => {
          const text = el.textContent?.trim().toLowerCase();
          return text?.includes(name.toLowerCase()) && 
                 (el.tagName === 'BUTTON' || 
                  el.getAttribute('role') === 'button' ||
                  el.classList.contains('clickable') ||
                  window.getComputedStyle(el).cursor === 'pointer');
        });
        
        if (matchingElement) {
          (matchingElement as HTMLElement).click();
          return true;
        }
        
        return false;
      }, sleeperName);
      
      return selected;
    }, { maxAttempts: 2, delay: 1000 });
    
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
  logger.debug('Starting enhanced sleep data extraction for both sleepers...');
  
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
        
        logger.debug(`Completed data extraction for ${sleeper}:`, {
          '30-average': sleeperData['30-average'],
          'score': sleeperData['score'],
          'all-time-best': sleeperData['all-time-best'],
          'message': sleeperData['message'] ? 'present' : 'empty',
          'heartRateMsg': sleeperData['heartRateMsg'] ? 'present' : 'empty',
          'heartRateVariabilityMsg': sleeperData['heartRateVariabilityMsg'] ? 'present' : 'empty',
          'breathRateMsg': sleeperData['breathRateMsg'] ? 'present' : 'empty',
        });
        
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
    
    logger.info('Enhanced sleep data extraction completed');
    logger.debug('Final results structure:', JSON.stringify(finalResult, null, 2));
    
    return finalResult;
    
  } catch (error) {
    logger.error('Error in enhanced sleep data extraction:', error);
    
    // Return the initialized structure with error information
    sleepData.rafa.raw = { error: 'Enhanced extraction failed' };
    sleepData.miki.raw = { error: 'Enhanced extraction failed' };
    
    return sleepData;
  }
}
