export interface Logger {
  debug(message: string, ...data: unknown[]): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  captureException?(error: unknown, extra?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  debug: (...args) => console.debug(...args),
  info: (m, d) => console.info(m, d ?? ''),
  warn: (m, d) => console.warn(m, d ?? ''),
  error: (m, d) => console.error(m, d ?? ''),
  captureException: (e, extra) => console.error(e, extra ?? ''),
};

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  captureException: () => {},
};
