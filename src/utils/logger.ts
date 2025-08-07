import pc from 'picocolors';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(pc.gray('[DEBUG]'), ...args);
    }
  }

  debugSensitive(...args: any[]) {
    // Only log sensitive data in debug mode, and redact in production
    if (this.level <= LogLevel.DEBUG && process.env.NODE_ENV !== 'production') {
      console.log(pc.gray('[DEBUG-SENSITIVE]'), ...args);
    }
  }

  info(...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.log(...args);
    }
  }

  warn(...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(pc.yellow('[WARN]'), ...args);
    }
  }

  error(...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(pc.red('[ERROR]'), ...args);
    }
  }
}

export const logger = new Logger();