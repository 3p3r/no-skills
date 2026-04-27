export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  level: LogLevel;
  json: boolean;
  scope?: string;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly json: boolean;
  private readonly scope?: string;

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.json = options.json;
    this.scope = options.scope;
  }

  child(scope: string): Logger {
    const nextScope = this.scope ? `${this.scope}:${scope}` : scope;
    return new Logger({
      level: this.level,
      json: this.json,
      scope: nextScope,
    });
  }

  debug(message: string, details?: unknown): void {
    this.write('debug', message, details);
  }

  info(message: string, details?: unknown): void {
    this.write('info', message, details);
  }

  warn(message: string, details?: unknown): void {
    this.write('warn', message, details);
  }

  error(message: string, details?: unknown): void {
    this.write('error', message, details);
  }

  private write(level: LogLevel, message: string, details?: unknown): void {
    if (levelPriority[level] < levelPriority[this.level]) {
      return;
    }

    if (this.json) {
      const payload: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level,
        message,
      };
      if (this.scope) {
        payload.scope = this.scope;
      }
      if (details !== undefined) {
        payload.details = details;
      }
      const line = JSON.stringify(payload);
      if (level === 'error' || level === 'warn') {
        console.error(line);
      } else {
        console.log(line);
      }
      return;
    }

    const prefix = this.scope ? `[${level}] [${this.scope}]` : `[${level}]`;
    const detailSuffix = details === undefined ? '' : ` ${formatDetails(details)}`;
    const line = `${prefix} ${message}${detailSuffix}`;
    if (level === 'error' || level === 'warn') {
      console.error(line);
      return;
    }
    console.log(line);
  }
}

function formatDetails(details: unknown): string {
  if (details instanceof Error) {
    return details.message;
  }

  if (typeof details === 'string') {
    return details;
  }

  return JSON.stringify(details);
}