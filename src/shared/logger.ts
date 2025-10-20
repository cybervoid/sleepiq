type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

const logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

// Configuration flags for controlling specific logging areas
export const logConfig = {
  verboseRequests: process.env.VERBOSE_REQUESTS === 'true',
  verboseLogin: process.env.VERBOSE_LOGIN === 'true',
  verboseExtraction: process.env.VERBOSE_EXTRACTION === 'true',
  verboseNavigation: process.env.VERBOSE_NAVIGATION === 'true',
  showFullResults: process.env.SHOW_FULL_RESULTS === 'true'
};

export const logger = new Logger(logLevel);
