import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const ms = Date.now() - start;
      const { statusCode } = res;
      const color =
        statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';
      this.logger[color](
        `${method} ${originalUrl} ${statusCode} +${ms}ms: ${JSON.stringify({
          body: req.body,
          query: req.query,
          params: req.params,
        })}`,
      );
    });

    next();
  }
}
