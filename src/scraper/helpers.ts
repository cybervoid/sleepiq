import { Page, ElementHandle } from 'puppeteer';
import { logger } from '../shared/logger';

/**
 * Utility functions for reliable browser automation
 * Provides retry logic, safe element interactions, and text extraction
 */

export interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  timeout?: number;
}

/**
 * Execute a function with retry logic
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000 } = options;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      logger.debug(`Attempt ${attempt}/${maxAttempts} failed:`, error);
      
      if (attempt === maxAttempts) {
        throw error;
      }
      
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error('Retry logic failed - this should not be reached');
}

/**
 * Wait for an element to be visible with retries
 */
export async function waitForVisible(
  page: Page,
  selector: string,
  options: { timeout?: number; retries?: number } = {}
): Promise<ElementHandle | null> {
  const { timeout = 10000, retries = 2 } = options;
  
  return withRetries(async () => {
    try {
      logger.debug(`Waiting for visible element: ${selector}`);
      const element = await page.waitForSelector(selector, { 
        visible: true, 
        timeout 
      });
      
      if (element) {
        // Additional check to ensure element is actually visible
        const isVisible = await element.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && 
                 rect.height > 0 && 
                 style.visibility !== 'hidden' && 
                 style.display !== 'none';
        });
        
        if (isVisible) {
          logger.debug(`Element found and visible: ${selector}`);
          return element;
        }
      }
      
      throw new Error(`Element not visible: ${selector}`);
    } catch (error) {
      logger.debug(`waitForVisible failed for ${selector}:`, error);
      throw error;
    }
  }, { maxAttempts: retries, delay: 1000 });
}

/**
 * Safely click an element with scroll, stability wait, and retries
 */
export async function safeClick(
  page: Page,
  selector: string,
  options: RetryOptions & { waitForNavigation?: boolean } = {}
): Promise<boolean> {
  const { maxAttempts = 3, delay = 500, waitForNavigation = false } = options;
  
  return withRetries(async () => {
    logger.debug(`Attempting safe click on: ${selector}`);
    
    // First, try to find the element
    const element = await waitForVisible(page, selector, { timeout: 5000, retries: 1 });
    if (!element) {
      throw new Error(`Element not found for clicking: ${selector}`);
    }
    
    // Scroll element into view
    await element.evaluate(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    
    // Wait for scroll to complete and element to be stable
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Ensure element is still clickable
    const isClickable = await element.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const elementAtPoint = document.elementFromPoint(centerX, centerY);
      return elementAtPoint === el || el.contains(elementAtPoint);
    });
    
    if (!isClickable) {
      throw new Error(`Element not clickable (obscured): ${selector}`);
    }
    
    // Perform the click
    if (waitForNavigation) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
        element.click()
      ]);
    } else {
      await element.click();
    }
    
    logger.debug(`Successfully clicked: ${selector}`);
    return true;
  }, { maxAttempts, delay });
}

/**
 * Extract text content from an element, returning empty string on failure
 */
export async function getTextOrEmpty(
  page: Page,
  selector: string
): Promise<string> {
  try {
    const element = await page.$(selector);
    if (!element) {
      logger.debug(`Element not found for text extraction: ${selector}`);
      return '';
    }
    
    const text = await element.evaluate(el => el.textContent?.trim() || '');
    logger.debug(`Extracted text from ${selector}: "${text}"`);
    return text;
  } catch (error) {
    logger.debug(`Failed to extract text from ${selector}:`, error);
    return '';
  }
}

/**
 * Extract the first 1-3 digit number from an element
 */
export async function getFirstNumberOrEmpty(
  page: Page,
  selector: string
): Promise<string> {
  try {
    const text = await getTextOrEmpty(page, selector);
    const match = text.match(/\b(\d{1,3})\b/);
    const number = match ? match[1] : '';
    
    logger.debug(`Extracted number from ${selector}: "${number}" (from text: "${text}")`);
    return number;
  } catch (error) {
    logger.debug(`Failed to extract number from ${selector}:`, error);
    return '';
  }
}

/**
 * Try multiple selectors and return the first that works
 */
export async function trySelectors(
  page: Page,
  selectors: string[],
  extractor: (selector: string) => Promise<string>
): Promise<string> {
  for (const selector of selectors) {
    try {
      const result = await extractor(selector);
      if (result) {
        logger.debug(`Selector succeeded: ${selector} -> "${result}"`);
        return result;
      }
    } catch (error) {
      logger.debug(`Selector failed: ${selector}`, error);
    }
  }
  
  logger.debug(`All selectors failed: ${selectors.join(', ')}`);
  return '';
}

/**
 * Wait for a modal or overlay to be dismissed
 */
export async function waitForModalDismissed(
  page: Page,
  modalSelector: string = '[role="dialog"], .modal, .overlay',
  timeout: number = 5000
): Promise<void> {
  try {
    logger.debug(`Waiting for modal to be dismissed: ${modalSelector}`);
    
    // Wait for the modal to be removed from DOM or hidden
    await page.waitForFunction(
      (selector) => {
        const modal = document.querySelector(selector);
        if (!modal) return true; // Modal removed from DOM
        
        const style = window.getComputedStyle(modal);
        return style.display === 'none' || 
               style.visibility === 'hidden' || 
               style.opacity === '0';
      },
      { timeout },
      modalSelector
    );
    
    logger.debug('Modal dismissed successfully');
  } catch (error) {
    logger.debug('Modal dismiss wait timeout - continuing anyway');
  }
}

/**
 * Extract text that matches specific patterns from a container
 */
export async function extractMatchingText(
  page: Page,
  containerSelector: string,
  patterns: RegExp[]
): Promise<string> {
  try {
    const element = await page.$(containerSelector);
    if (!element) {
      return '';
    }
    
    const allText = await element.evaluate(el => {
      // Get all text content including from child elements
      const walker = document.createTreeWalker(
        el,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      const texts: string[] = [];
      let node;
      while (node = walker.nextNode()) {
        const text = node.textContent?.trim();
        if (text && text.length > 5) { // Ignore very short text
          texts.push(text);
        }
      }
      return texts.join(' ');
    });
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match) {
        let result = match[0].trim();
        // Clean up common artifacts
        result = result.replace(/[.!]+$/, ''); // Remove trailing punctuation
        result = result.replace(/\s+/g, ' '); // Normalize whitespace
        
        logger.debug(`Pattern matched in ${containerSelector}: "${result}"`);
        return result;
      }
    }
    
    // If no patterns match, look for any substantial text
    const sentences = allText.match(/[^.!?]+[.!?]/g);
    if (sentences && sentences.length > 0) {
      const result = sentences[0].trim();
      logger.debug(`Fallback text from ${containerSelector}: "${result}"`);
      return result;
    }
    
  } catch (error) {
    logger.debug(`Failed to extract matching text from ${containerSelector}:`, error);
  }
  
  return '';
}

/**
 * Close any open modals using multiple strategies
 */
export async function closeModal(page: Page): Promise<boolean> {
  const strategies = [
    // Strategy 1: Click close button
    async () => {
      const closeSelectors = [
        'button:has-text("Close")',
        'button:has-text("×")',
        'button[aria-label*="close"]',
        '[role="button"][aria-label*="close"]',
        'button.close',
        '.close-button'
      ];
      
      for (const selector of closeSelectors) {
        try {
          const success = await safeClick(page, selector, { maxAttempts: 1 });
          if (success) {
            logger.debug(`Modal closed with: ${selector}`);
            return true;
          }
        } catch (error) {
          // Continue to next selector
        }
      }
      return false;
    },
    
    // Strategy 2: Press Escape key
    async () => {
      await page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 500));
      logger.debug('Modal close attempted with Escape key');
      return true;
    },
    
    // Strategy 3: Click outside modal
    async () => {
      await page.click('body');
      await new Promise(resolve => setTimeout(resolve, 500));
      logger.debug('Modal close attempted by clicking outside');
      return true;
    }
  ];
  
  for (const strategy of strategies) {
    try {
      const success = await strategy();
      if (success) {
        await waitForModalDismissed(page);
        return true;
      }
    } catch (error) {
      logger.debug('Modal close strategy failed:', error);
    }
  }
  
  return false;
}