/**
 * Robust selector strategies for SleepIQ dashboard elements
 * Uses text-based and role-based selectors for better reliability across UI changes
 */

export const DASHBOARD_SELECTORS = {
  // Main dashboard metrics - using Puppeteer-compatible selectors
  THIRTY_DAY_AVG: {
    // Standard CSS selectors that work with Puppeteer
    container: 'body',
    alternatives: [
      '[data-testid*="thirty-day"], [data-test*="thirty-day"]',
      '[class*="thirty-day"], [class*="30-day"]',
      '[aria-label*="30-day"], [title*="30-day"]',
      // We'll use page.evaluate to find text-based elements
    ]
  },
  
  SLEEPIQ_SCORE: {
    // Main circular score display
    container: 'body',
    alternatives: [
      '[data-testid*="sleep-score"], [data-test*="sleep-score"]',
      '[class*="sleep-score"], [class*="sleepiq-score"]',
      '.score-circle, .score-ring, [class*="score-display"]',
      '[aria-label*="score"], [title*="score"]'
    ]
  },
  
  ALL_TIME_BEST: {
    // All-time best score display
    container: 'body',
    alternatives: [
      '[data-testid*="all-time"], [data-test*="all-time"]',
      '[class*="all-time"], [class*="best-score"]',
      '[aria-label*="best"], [title*="best"]'
    ]
  },
  
  // Sleep session card (contains the timeline and View Details button)
  SLEEP_SESSION: {
    card: 'body',
    viewDetailsButton: 'button',
    alternatives: {
      card: [
        '[data-testid*="sleep-session"]',
        '[class*="sleep-session"]',
        '[class*="session"]'
      ],
      viewDetailsButton: [
        'button[data-testid*="details"], button[data-test*="details"]',
        'button[aria-label*="details"]',
        'button[class*="details"]',
        '[role="button"][aria-label*="details"]'
      ]
    }
  },
  
  // Biosignals card (contains heart rate, HRV, breath rate metrics)
  BIOSIGNALS: {
    card: 'body',
    viewDetailsButton: 'button',
    alternatives: {
      card: [
        '[data-testid*="biosignal"]',
        '[class*="biosignal"]',
        '[class*="bio-signal"]',
        '[class*="vitals"]'
      ],
      viewDetailsButton: [
        'button[data-testid*="details"], button[data-test*="details"]',
        'button[aria-label*="details"]',
        'button[class*="details"]',
        '[role="button"][aria-label*="details"]'
      ]
    }
  },
  
  // Sleeper selection controls
  SLEEPER_SELECTOR: {
    dropdown: 'select',
    buttons: 'button',
    alternatives: [
      '[data-testid*="sleeper"], [data-test*="sleeper"]',
      '[role="combobox"]',
      '[class*="sleeper"], [class*="selector"]',
      '[aria-label*="sleeper"], [aria-label*="user"]'
    ]
  },
  
  // Modal and overlay selectors
  MODALS: {
    overlay: '[role="dialog"], .modal, .overlay, [data-testid*="modal"]',
    closeButton: 'button[aria-label*="close"], button.close',
    alternatives: {
      closeButton: [
        '[role="button"][aria-label*="close"]',
        'button[data-testid*="close"]',
        'button.close, .close-button',
        'button[class*="close"]'
      ]
    }
  }
};

// Text patterns for extracting messages from detail views
export const MESSAGE_PATTERNS = {
  // General sleep message patterns (from sleep session details)
  SLEEP_MESSAGE: [
    // Positive messages
    /keep it up.*restless.*down/i,
    /great.*sleep.*quality/i,
    /excellent.*night.*sleep/i,
    // Improvement suggestions
    /try.*improve.*sleep/i,
    /consider.*bedtime.*routine/i,
    // Status messages
    /your.*sleep.*was.*\w+.*average/i,
    /sleep.*quality.*\w+.*usual/i
  ],
  
  // Heart rate messages
  HEART_RATE: [
    /heart.*rate.*\w+.*average/i,
    /resting.*heart.*rate/i,
    /cardiovascular.*health/i
  ],
  
  // Heart rate variability messages
  HRV: [
    /heart.*rate.*variability/i,
    /hrv.*indicates/i,
    /recovery.*readiness/i,
    /stress.*recovery/i
  ],
  
  // Breathing rate messages
  BREATH_RATE: [
    /breathing.*rate.*\w+.*normal/i,
    /respiratory.*pattern/i,
    /breath.*quality/i
  ]
};