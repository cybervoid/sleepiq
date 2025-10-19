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
        return text === 'login' && el.offsetWidth > 0 && el.offsetHeight > 0;
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
          return text === 'login' && 
                 el.offsetWidth > 0 && 
                 el.offsetHeight > 0 &&
                 (el.tagName === 'BUTTON' || 
                  el.getAttribute('role') === 'button' ||
                  el.onclick ||
                  window.getComputedStyle(el).cursor === 'pointer');
        });
      });
      
      if (loginButton && loginButton.asElement()) {
        logger.debug('Found login button, attempting to click...');
        await loginButton.asElement()!.click();
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

    logger.info('Login successful, extracting sleep metrics');

    // Navigate to dashboard if not already there
    if (!currentUrl.includes('dashboard')) {
      await page.goto(SLEEPIQ_URLS.DASHBOARD, { waitUntil: 'networkidle2' });
    }

    // Wait for sleep data to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
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
