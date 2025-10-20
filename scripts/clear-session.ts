#!/usr/bin/env tsx

import { SessionManager } from '../src/scraper/session';

async function clearSession() {
  const sessionManager = new SessionManager();
  
  const hasSession = await sessionManager.hasSession();
  
  if (hasSession) {
    await sessionManager.clearSession();
    console.log('✓ Session cleared successfully');
  } else {
    console.log('ℹ No session found to clear');
  }
}

clearSession().catch(error => {
  console.error('❌ Error clearing session:', error);
  process.exit(1);
});