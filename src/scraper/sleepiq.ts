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
    
    // Extra wait for JavaScript to finish loading dynamic content
    logger.debug('Waiting for page to fully load...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    logger.info('Logging in to SleepIQ');
    
    // Fill in credentials
    const emailSelector = 'input[type="email"], input[name="email"], input[id*="email"]';
    const passwordSelector = 'input[type="password"], input[name="password"], input[id*="password"]';
    
    await page.type(emailSelector, credentials.username);
    await page.type(passwordSelector, credentials.password);
    
    // Wait a moment for any dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Debug: List all buttons and interactive elements on the page
    const pageInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
        tag: 'button',
        text: btn.textContent?.trim(),
        type: btn.getAttribute('type'),
        className: btn.className,
        disabled: btn.disabled,
        id: btn.id
      }));
      
      const inputs = Array.from(document.querySelectorAll('input')).map(inp => ({
        tag: 'input',
        type: inp.getAttribute('type'),
        value: inp.getAttribute('value'),
        className: inp.className,
        id: inp.id
      }));
      
      const clickableElements = Array.from(document.querySelectorAll('[onclick], .btn, .button, div[class*="login"], div[class*="submit"], span[class*="login"], span[class*="submit"]')).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim(),
        className: el.className,
        onclick: el.getAttribute('onclick')
      }));
      
      // Look for any element containing "login" text
      const loginElements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent?.trim().toLowerCase().includes('login') && 
        el.children.length === 0 // Only leaf elements
      ).map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim(),
        className: el.className,
        id: el.id
      }));
      
      return { buttons, inputs, clickableElements, loginElements, html: document.body.innerHTML.substring(0, 1000) };
    });
    
    logger.debug('Page elements:', JSON.stringify(pageInfo, null, 2));
    
    // Submit the form - try to find the Login button
    let buttonClicked = false;
    
    // Try multiple approaches to find and click the login button
    try {
      // Approach 1: Look for elements by coordinates (where the button visually appears)
      const buttonClicked1 = await page.evaluate(() => {
        // Find all elements at the typical login button position
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const centerX = viewportWidth / 2;
        const buttonY = viewportHeight * 0.6; // Typical login button position
        
        const element = document.elementFromPoint(centerX, buttonY);
        if (element && (element.textContent?.toLowerCase().includes('login') || 
                       element.getAttribute('type') === 'submit' ||
                       element.tagName === 'BUTTON')) {
          element.click();
          return true;
        }
        return false;
      });
      
      if (buttonClicked1) {
        logger.debug('Successfully clicked button using coordinate approach');
        buttonClicked = true;
      } else {
        // Approach 2: Find by CSS selectors commonly used for login buttons
        const selectors = [
          'button[type="submit"]',
          'input[type="submit"]',
          'div[role="button"]',
          '.login-button',
          '.btn-login',
          '.submit-btn',
          '[data-testid*="login"]',
          '[data-testid*="submit"]'
        ];
        
        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              logger.debug(`Found button with selector: ${selector}`);
              await element.click();
              buttonClicked = true;
              break;
            }
          } catch (err) {
            continue;
          }
        }
        
        // Approach 3: Look for any element containing "Login" and try clicking its parent containers
        if (!buttonClicked) {
          const clicked = await page.evaluate(() => {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            let node;
            while (node = walker.nextNode()) {
              if (node.textContent?.trim().toLowerCase() === 'login') {
                let parent = node.parentElement;
                // Go up the DOM tree to find a clickable parent
                for (let i = 0; i < 5 && parent; i++) {
                  const computedStyle = window.getComputedStyle(parent);
                  if (computedStyle.cursor === 'pointer' || 
                      parent.tagName === 'BUTTON' ||
                      parent.getAttribute('role') === 'button' ||
                      parent.onclick) {
                    parent.click();
                    return true;
                  }
                  parent = parent.parentElement;
                }
              }
            }
            return false;
          });
          
          if (clicked) {
            logger.debug('Successfully clicked using DOM tree walker approach');
            buttonClicked = true;
          }
        }
      }
    } catch (error) {
      logger.debug('Enhanced button detection failed:', error);
    }
    
    // Fallback selectors if text search didn't work
    if (!buttonClicked) {
      const submitSelectors = [
        'button[type="submit"]', 
        'input[type="submit"]',
        'button',  // Last resort - any button
        '.login-btn',
        '[data-testid="login-button"]'
      ];
      
      for (const selector of submitSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            logger.debug(`Found login button with selector: ${selector}`);
            await button.click();
            buttonClicked = true;
            break;
          }
        } catch (error) {
          logger.debug(`Selector failed: ${selector}`);
        }
      }
    }
    
    // If no button selectors worked, try alternative approaches
    if (!buttonClicked) {
      logger.debug('Button click failed, trying form submission approaches');
      
      // Try 1: Submit the form programmatically
      try {
        const formSubmitted = await page.evaluate(() => {
          const forms = document.querySelectorAll('form');
          if (forms.length > 0) {
            forms[0].submit();
            return true;
          }
          return false;
        });
        
        if (formSubmitted) {
          logger.debug('Submitted form programmatically');
          buttonClicked = true;
        }
      } catch (error) {
        logger.debug('Form submission failed:', error);
      }
      
      // Try 2: Press Enter on password field
      if (!buttonClicked) {
        logger.debug('Trying Enter key on password field');
        await page.focus(passwordSelector);
        await page.keyboard.press('Enter');
      }
    }

    logger.debug('Waiting for navigation after login');
    
    // Wait a bit for any error messages to appear or navigation to start
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
    
    // Wait for navigation to complete (either dashboard or error)
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    } catch (error) {
      logger.debug('Navigation timeout, checking current URL');
    }

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
