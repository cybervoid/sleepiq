import { Page } from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../shared/logger';

export interface SessionData {
  cookies: any[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  url: string;
  timestamp: number;
}

export class SessionManager {
  private sessionFile: string;
  
  constructor(sessionDir: string = '.sessions') {
    // Create session directory if it doesn't exist
    this.sessionFile = path.join(sessionDir, 'sleepiq-session.json');
  }
  
  /**
   * Save the current browser session (cookies, localStorage, etc.)
   */
  async saveSession(page: Page): Promise<void> {
    try {
      // Ensure session directory exists
      const sessionDir = path.dirname(this.sessionFile);
      await fs.mkdir(sessionDir, { recursive: true });
      
      // Get cookies
      const cookies = await page.cookies();
      
      // Get localStorage and sessionStorage
      const storageData = await page.evaluate(() => {
        const localStorage: Record<string, string> = {};
        const sessionStorage: Record<string, string> = {};
        
        // Extract localStorage
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            localStorage[key] = window.localStorage.getItem(key) || '';
          }
        }
        
        // Extract sessionStorage
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key) {
            sessionStorage[key] = window.sessionStorage.getItem(key) || '';
          }
        }
        
        return {
          localStorage,
          sessionStorage,
          url: window.location.href
        };
      });
      
      const sessionData: SessionData = {
        cookies,
        localStorage: storageData.localStorage,
        sessionStorage: storageData.sessionStorage,
        url: storageData.url,
        timestamp: Date.now()
      };
      
      await fs.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2));
      logger.debug(`Session saved to ${this.sessionFile}`);
      
    } catch (error) {
      logger.warn('Failed to save session:', error);
    }
  }
  
  /**
   * Load and restore a saved browser session
   */
  async loadSession(page: Page): Promise<boolean> {
    try {
      // Check if session file exists
      const sessionExists = await fs.access(this.sessionFile).then(() => true).catch(() => false);
      if (!sessionExists) {
        logger.debug('No saved session found');
        return false;
      }
      
      // Read session data
      const sessionContent = await fs.readFile(this.sessionFile, 'utf-8');
      const sessionData: SessionData = JSON.parse(sessionContent);
      
      // Check if session is too old (older than 24 hours)
      const sessionAge = Date.now() - sessionData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      if (sessionAge > maxAge) {
        logger.debug('Saved session is too old, ignoring');
        await this.clearSession();
        return false;
      }
      
      logger.debug(`Loading session from ${this.sessionFile}`);
      
      // Navigate to SleepIQ first (needed for setting domain-specific cookies)
      await page.goto('https://sleepiq.sleepnumber.com/', { waitUntil: 'domcontentloaded' });
      
      // Set cookies
      if (sessionData.cookies && sessionData.cookies.length > 0) {
        await page.setCookie(...sessionData.cookies);
        logger.debug(`Restored ${sessionData.cookies.length} cookies`);
      }
      
      // Set localStorage and sessionStorage
      await page.evaluate((data) => {
        // Restore localStorage
        for (const [key, value] of Object.entries(data.localStorage)) {
          try {
            localStorage.setItem(key, value);
          } catch (e) {
            console.warn('Failed to set localStorage item:', key, e);
          }
        }
        
        // Restore sessionStorage
        for (const [key, value] of Object.entries(data.sessionStorage)) {
          try {
            sessionStorage.setItem(key, value);
          } catch (e) {
            console.warn('Failed to set sessionStorage item:', key, e);
          }
        }
      }, sessionData);
      
      // Navigate to the URL where the session was saved
      if (sessionData.url && sessionData.url !== 'https://sleepiq.sleepnumber.com/') {
        await page.goto(sessionData.url, { waitUntil: 'networkidle2' });
      }
      
      // Wait a bit for the session to be applied
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      logger.info('Session restored successfully');
      return true;
      
    } catch (error) {
      logger.warn('Failed to load session:', error);
      await this.clearSession();
      return false;
    }
  }
  
  /**
   * Check if the current page indicates a successful login
   */
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url();
      const pageInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          hasLoginForm: !!document.querySelector('input[type="email"], input[type="password"]'),
          title: document.title
        };
      });
      
      // If we're not on a login page and don't see login forms, assume we're logged in
      const isOnLoginPage = currentUrl.includes('login') || currentUrl.includes('auth') || pageInfo.hasLoginForm;
      return !isOnLoginPage;
      
    } catch (error) {
      logger.warn('Error checking login status:', error);
      return false;
    }
  }
  
  /**
   * Clear the saved session
   */
  async clearSession(): Promise<void> {
    try {
      await fs.unlink(this.sessionFile);
      logger.debug('Session cleared');
    } catch (error) {
      // File might not exist, that's okay
      logger.debug('No session to clear');
    }
  }
  
  /**
   * Check if a session exists
   */
  async hasSession(): Promise<boolean> {
    try {
      await fs.access(this.sessionFile);
      return true;
    } catch {
      return false;
    }
  }
}