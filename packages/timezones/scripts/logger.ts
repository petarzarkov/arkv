const colors = {
  cyan: (text: string) => `\x1B[36m${text}\x1B[39m`,
  magenta: (text: string) => `\x1B[35m${text}\x1B[0m`,
  yellow: (text: string) => `\x1B[33m${text}\x1B[39m`,
  red: (text: string) => `\x1B[31m${text}\x1B[39m`,
};

const step = (
  message: string,
  color: keyof typeof colors,
  ctx?: unknown,
): void => {
  const prefix = process.env.TZDB_NO_COLOR
    ? `[@arkv/timezones] ${message}`
    : colors[color](`[@arkv/timezones] ${message}`);

  if (ctx) {
    console.log(prefix, ctx);
    return;
  }

  console.log(prefix);
};

export const logger = {
  debug: (message: string, ctx?: unknown) => step(message, 'cyan', ctx),
  info: (message: string, ctx?: unknown) => step(message, 'magenta', ctx),
  warn: (message: string, ctx?: unknown) => step(message, 'yellow', ctx),
  error: (message: string, ctx?: unknown) => step(message, 'red', ctx),
};
