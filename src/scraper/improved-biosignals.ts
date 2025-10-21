/**
 * Improved biosignals extraction with proper tab handling and message scoping
 */

import { Page } from 'puppeteer';
import { logger } from '../shared/logger';

/**
 * Improved biosignals message extraction with proper tab handling
 */
export async function extractBiosignalsMessagesImproved(page: Page): Promise<{
  heartRateMsg: string;
  heartRateVariabilityMsg: string;
  breathRateMsg: string;
}> {
  logger.debug('Starting improved biosignals extraction...');
  
  const results = {
    heartRateMsg: '',
    heartRateVariabilityMsg: '',
    breathRateMsg: ''
  };

  try {
    const originalUrl = page.url();
    logger.debug('Current URL:', originalUrl);
    
    // Ensure we're on the biosignals details page
    let biosignalsUrl = originalUrl;
    if (originalUrl.includes('#/pages/sleep/details/biosignals')) {
      logger.debug('Already on biosignals page');
    } else if (originalUrl.includes('#/pages/sleep')) {
      biosignalsUrl = originalUrl.replace('#/pages/sleep', '#/pages/sleep/details/biosignals');
    logger.debug('Navigating to biosignals page:', biosignalsUrl);
      // Disable cache for fresh content
      await page.setCacheEnabled(false);
      await page.goto(biosignalsUrl, { waitUntil: 'networkidle2' });
    } else {
      logger.warn('Not on expected sleep pages, attempting direct navigation');
      const baseUrl = originalUrl.split('#')[0];
      biosignalsUrl = baseUrl + '#/pages/sleep/details/biosignals';
      await page.setCacheEnabled(false);
      await page.goto(biosignalsUrl, { waitUntil: 'networkidle2' });
    }

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const currentUrl = page.url();
    if (!currentUrl.includes('biosignals')) {
      logger.warn('Failed to navigate to biosignals page, current URL:', currentUrl);
      return results;
    }

    logger.debug('Successfully on biosignals page');

    /**
     * Extract message from the active tab content area, avoiding tab headers
     */
    const extractActiveTabMessage = async (): Promise<string> => {
      return await page.evaluate(() => {
        // The message should be in the main content area, not in the tabs section
        // Based on MCP observations, find the first substantial text element that:
        // 1. Is not a tab header
        // 2. Is not a metric number
        // 3. Contains message-like content (ends with . or !)
        // 4. Is longer than 30 characters
        
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const element of allElements) {
          const text = element.textContent?.trim() || '';
          const elementRect = element.getBoundingClientRect();
          
          // Skip if not visible or too small
          if (elementRect.width === 0 || elementRect.height === 0) continue;
          
          // Look for message-like content
          if (text.length > 30 && text.length < 500 && 
              (text.endsWith('.') || text.endsWith('!'))) {
            
            // Skip if it contains tab-like text
            if (text.includes('Heart Rate Variability') || 
                text.includes('Breath Rate') ||
                text.includes('Trends') ||
                text.includes('30-day') ||
                text.includes('BPM') ||
                text.includes('HRV') && text.includes('Breath Rate')) {
              continue;
            }
            
            // Skip numbers only
            if (/^\d+$/.test(text.trim())) continue;
            
            // This looks like a message
            console.log('Found potential message:', text.substring(0, 50) + '...');
            return text;
          }
        }
        
        return '';
      });
    };

    /**
     * Click a tab and wait for content to load
     */
    const clickTab = async (tabName: string): Promise<boolean> => {
      logger.debug(`Clicking ${tabName} tab...`);
      
      const clicked = await page.evaluate((name) => {
        const allElements = Array.from(document.querySelectorAll('*'));
        
        // Find the tab element
        for (const element of allElements) {
          const text = element.textContent?.trim() || '';
          const htmlEl = element as HTMLElement;
          
          // Match tab names exactly
          if (text === name && 
              htmlEl.offsetWidth > 0 && 
              htmlEl.offsetHeight > 0) {
            console.log(`Found ${name} tab, clicking...`);
            htmlEl.click();
            return true;
          }
        }
        
        console.log(`${name} tab not found`);
        return false;
      }, tabName);
      
      if (clicked) {
        // Wait for tab content to update
        await new Promise(resolve => setTimeout(resolve, 1500));
        logger.debug(`${tabName} tab clicked successfully`);
      } else {
        logger.warn(`Could not find or click ${tabName} tab`);
      }
      
      return clicked;
    };

    // Extract Heart Rate message (default active tab)
    logger.debug('Extracting Heart Rate message from default tab...');
    results.heartRateMsg = await extractActiveTabMessage();
    logger.debug('Heart Rate message:', results.heartRateMsg);

    // Click Heart Rate Variability tab and extract
    logger.debug('Switching to Heart Rate Variability tab...');
    const hrvClicked = await clickTab('Heart Rate Variability');
    if (hrvClicked) {
      results.heartRateVariabilityMsg = await extractActiveTabMessage();
      logger.debug('HRV message:', results.heartRateVariabilityMsg);
    } else {
      logger.warn('Could not click HRV tab, trying alternative extraction...');
      // Try alternative pattern matching for HRV
      results.heartRateVariabilityMsg = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const patterns = [
          /Your heart rate variability was in the high range[^.]*\./,
          /Way to go, your HRV is in the high range[^.]*\./,
          /HRV.*high range[^.]*\./
        ];
        
        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match) return match[0].trim();
        }
        return '';
      });
    }

    // Click Breath Rate tab and extract
    logger.debug('Switching to Breath Rate tab...');
    const breathClicked = await clickTab('Breath Rate');
    if (breathClicked) {
      results.breathRateMsg = await extractActiveTabMessage();
      logger.debug('Breath Rate message:', results.breathRateMsg);
    } else {
      logger.warn('Could not click Breath Rate tab, trying alternative extraction...');
      // Try alternative pattern matching for Breath Rate
      results.breathRateMsg = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const patterns = [
          /Don't take it for granted! A breath rate around[^.]*\./,
          /breath rate.*around your average.*SleepIQ.*score[^.]*\./
        ];
        
        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match) return match[0].trim();
        }
        return '';
      });
    }

    // Navigate back to original page
    if (originalUrl !== currentUrl) {
      logger.debug('Navigating back to:', originalUrl);
      await page.goto(originalUrl, { waitUntil: 'networkidle2' });
    }

    logger.debug('Biosignals extraction completed:', {
      heartRate: results.heartRateMsg ? 'extracted' : 'empty',
      hrv: results.heartRateVariabilityMsg ? 'extracted' : 'empty', 
      breathRate: results.breathRateMsg ? 'extracted' : 'empty'
    });

  } catch (error) {
    logger.error('Error in improved biosignals extraction:', error);
  }

  // Clean up messages
  Object.keys(results).forEach(key => {
    const typedKey = key as keyof typeof results;
    if (results[typedKey]) {
      results[typedKey] = results[typedKey]
        .replace(/\s+/g, ' ')
        .replace(/[\u00A0\u2000-\u200B\u2028\u2029]/g, ' ') // Remove non-breaking spaces
        .trim();
    }
  });

  return results;
}

/**
 * Improved sleep session message extraction
 */
export async function extractSleepSessionMessageImproved(page: Page): Promise<string> {
  logger.debug('Starting improved sleep session extraction...');
  
  try {
    const originalUrl = page.url();
    
    // Navigate to sleep session details page with cache busting
    let sleepSessionUrl = originalUrl;
    if (originalUrl.includes('#/pages/sleep')) {
      sleepSessionUrl = originalUrl.replace('#/pages/sleep', '#/pages/sleep/details/sleep-session');
    } else {
      const baseUrl = originalUrl.split('#')[0];
      sleepSessionUrl = baseUrl + '#/pages/sleep/details/sleep-session';
    }
    
    logger.debug('Navigating to sleep session page:', sleepSessionUrl);
    
    // Disable cache to get fresh content
    await page.setCacheEnabled(false);
    
    // Navigate to sleep session details page
    await page.goto(sleepSessionUrl, { 
      waitUntil: 'networkidle2',
    });
    
    // Wait for page to fully load and render
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const currentUrl = page.url();
    if (!currentUrl.includes('sleep-session')) {
      logger.warn('Failed to navigate to sleep session page, current URL:', currentUrl);
      return '';
    }

    logger.debug('Successfully on sleep session page');

    // Extract the main coaching message
    const message = await page.evaluate(() => {
      // The message appears right after the metrics section and before the sleep timeline
      // It's a short coaching message (1-2 sentences)
      // It does NOT include "Did you know?" which is at the bottom
      
      const allElements = Array.from(document.querySelectorAll('*'));
      
      for (const element of allElements) {
        const text = element.textContent?.trim() || '';
        const elementRect = element.getBoundingClientRect();
        
        // Skip if not visible
        if (elementRect.width === 0 || elementRect.height === 0) continue;
        
        // Look for the coaching message - it's between 20-200 characters typically
        // and ends with . or !
        if (text.length >= 20 && text.length <= 200 && 
            (text.endsWith('.') || text.endsWith('!'))) {
          
          // Skip if it's a metric label
          if (text.includes('30-day') || 
              text.includes('All-time') ||
              text.includes('Details') ||
              text.includes('Time in bed') ||
              text.includes('Sleep Number') ||
              text.includes('Exit at') ||
              /\d+h \d+m/.test(text) || // time format like "8h 54m"
              /^\d/.test(text)) { // starts with number
            continue;
          }
          
          // Skip "Did you know?" and similar tips
          if (text.includes('Did you know?') || 
              text.includes('Why your sleep matters')) {
            continue;
          }
          
          // Skip if it contains child text patterns that indicate it's a container
          const childrenText = Array.from(element.children)
            .map(child => child.textContent?.trim())
            .join(' ');
          if (childrenText.includes('Details') || 
              childrenText.includes('Restful') ||
              childrenText.includes('Restless')) {
            continue;
          }
          
          // This looks like the coaching message
          console.log('Found sleep session message:', text);
          return text;
        }
      }
      
      return '';
    });

    // Navigate back
    if (originalUrl !== currentUrl) {
      logger.debug('Navigating back to:', originalUrl);
      await page.goto(originalUrl, { waitUntil: 'networkidle2' });
    }

    logger.debug('Sleep session message extracted:', message ? 'success' : 'empty');
    return message.trim();

  } catch (error) {
    logger.error('Error in improved sleep session extraction:', error);
    return '';
  }
}