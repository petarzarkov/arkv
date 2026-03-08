import { ContextStore } from '@arkv/logger';
import { Injectable } from '@nestjs/common';

/**
 * Injectable NestJS service that provides async
 * context propagation using AsyncLocalStorage.
 *
 * Extends ContextStore from @arkv/logger and is
 * directly compatible with the Logger constructor.
 *
 * Use ContextService in middleware or interceptors
 * to attach request-scoped data (requestId, userId,
 * event, flow, etc.) that will automatically appear
 * in every log entry within that async context.
 *
 * @example
 * ```ts
 * // In a NestJS middleware:
 * export class ContextMiddleware implements NestMiddleware {
 *   constructor(private ctx: ContextService) {}
 *
 *   use(req: Request, _res: Response, next: NextFunction) {
 *     this.ctx.runWithContext(
 *       {
 *         requestId: req.headers['x-request-id'] as string
 *           ?? crypto.randomUUID(),
 *         event: req.path,
 *         method: req.method,
 *         flow: 'http',
 *       },
 *       next,
 *     );
 *   }
 * }
 * ```
 */
@Injectable()
export class ContextService extends ContextStore {}
