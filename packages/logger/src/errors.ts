import type { Logger } from './logger.js';

export interface CaptureGlobalErrorsOptions {
  /**
   * Exit after logging an uncaught exception. Default `true`.
   *
   * Node terminates on an uncaught exception only while nothing is listening
   * for one; installing a listener suppresses that, and a process that carries
   * on from an unknown state is the classic bug in a hand-rolled handler. Set
   * `false` only if something else arranges the shutdown.
   */
  exitOnUncaught?: boolean;
  exitCode?: number;
}

/**
 * Logs `uncaughtException` at fatal and `unhandledRejection` at error, flushing
 * transports before the process goes away. Returns a function that removes both
 * listeners.
 */
export function captureGlobalErrors(
  logger: Logger,
  options: CaptureGlobalErrorsOptions = {},
): () => void {
  const { exitOnUncaught = true, exitCode = 1 } = options;

  const onUncaught = (error: Error, origin: string): void => {
    logger.fatal('Uncaught exception', { err: error, origin });
    logger.flush();
    if (exitOnUncaught) {
      process.exit(exitCode);
    }
  };

  const onUnhandled = (reason: unknown): void => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled rejection', { err });
    logger.flush();
  };

  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);

  return () => {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onUnhandled);
  };
}
