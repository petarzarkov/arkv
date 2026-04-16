import {
  Module,
  Logger,
  type DynamicModule,
  type Provider,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { Express, Request, Response } from 'express';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AddressInfo } from 'node:net';
import type { Server as HttpServer } from 'node:http';
import { join, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { CmsSchemaService } from './cms-schema.service.js';
import { CMS_OPTIONS } from './types.js';
import type { CmsOptions, CmsModuleAsyncOptions } from './types.js';

const MIME: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const CORE_PROVIDERS: Provider[] = [CmsSchemaService];

@Module({})
// oxlint-disable-next-line no-static-only-class
export class NestJsCmsModule {
  private static readonly logger = new Logger(NestJsCmsModule.name);

  static async setup(
    app: INestApplication,
    document?: OpenAPIObject,
    options: CmsOptions = {},
  ): Promise<void> {
    const cmsPath = (options.path ?? '/cms').replace(/\/$/, '');
    // CJS: dist/cjs/cms.module.js → join(.., 'public') = dist/public/
    // ESM: dist/esm/cms.module.js → join(.., 'public') = dist/public/
    const publicDir = join(__dirname, '..', 'public');
    const indexPath = join(publicDir, 'index.html');

    if (!existsSync(indexPath)) {
      const distDir = join(publicDir, '..');
      const detail = !existsSync(distDir)
        ? `dist/ not found at ${distDir} — package was not built`
        : !existsSync(publicDir)
          ? `dist/public/ not found — run bun run build:ui inside @arkv/nestjs-cms`
          : !existsSync(join(publicDir, 'assets'))
            ? `dist/public/assets/ missing — Vite build incomplete, re-run bun run build:ui`
            : `dist/public/index.html missing — delete dist/public/ and re-run bun run build:ui`;
      NestJsCmsModule.logger.error(`CMS frontend unavailable: ${detail}`);
      throw new Error(`@arkv/nestjs-cms setup failed: ${detail}`);
    }

    if (options.lookups && document) {
      const schemas = (document.components?.schemas ?? {}) as Record<
        string,
        Record<string, unknown>
      >;
      for (const [fieldName, lookup] of Object.entries(options.lookups)) {
        for (const schema of Object.values(schemas)) {
          const props = schema['properties'] as
            | Record<string, Record<string, unknown>>
            | undefined;
          if (props?.[fieldName]) {
            props[fieldName]['x-cms-lookup'] = lookup.path;
            props[fieldName]['x-cms-lookup-label'] = lookup.labelField;
            if (lookup.valueField)
              props[fieldName]['x-cms-lookup-value'] = lookup.valueField;
            if (lookup.searchParam)
              props[fieldName]['x-cms-lookup-search'] = lookup.searchParam;
            if (lookup.limit != null)
              props[fieldName]['x-cms-lookup-limit'] = lookup.limit;
          }
        }
      }
    }

    const schemaService = app.get(CmsSchemaService);
    schemaService.setOptions(options);
    if (document) {
      schemaService.setDocument(document);
    }

    // Cache the processed HTML once at startup — not per request
    const logoScript = options.logoUrl
      ? `\n    <script>window.__CMS_LOGO__=${JSON.stringify(options.logoUrl)};</script>`
      : '';
    const titleScript = options.title
      ? `\n    <script>window.__CMS_TITLE__=${JSON.stringify(options.title)};</script>`
      : '';
    const indexHtml = readFileSync(indexPath, 'utf8').replace(
      '<head>',
      `<head>\n    <base href="${cmsPath}/">${logoScript}${titleScript}`,
    );

    const httpAdapter = app.getHttpAdapter();
    const adapterType = httpAdapter.getType();
    NestJsCmsModule.logger.log(
      `Registering CMS routes on ${adapterType} at ${cmsPath}`,
    );

    if (adapterType === 'fastify') {
      NestJsCmsModule.registerFastify(
        httpAdapter.getInstance() as FastifyInstance,
        cmsPath,
        publicDir,
        indexHtml,
        schemaService,
      );
    } else {
      NestJsCmsModule.registerExpress(
        httpAdapter.getInstance() as Express,
        cmsPath,
        publicDir,
        indexHtml,
        schemaService,
      );
    }

    // Log full URLs once the HTTP server is actually bound to a port.
    // NestJS has no post-listen lifecycle hook, so we use the underlying
    // server's 'listening' event which fires at exactly that moment.
    const httpServer = app.getHttpServer() as HttpServer;
    httpServer.once('listening', () => {
      const addr = httpServer.address() as AddressInfo | null;
      const base = addr ? `http://localhost:${addr.port}` : '';
      NestJsCmsModule.logger.log(`CMS:    ${base}${cmsPath}`);
      NestJsCmsModule.logger.log(`Schema: ${base}${cmsPath}/schema`);
    });
  }

  private static registerExpress(
    app: Express,
    cmsPath: string,
    publicDir: string,
    indexHtml: string,
    schemaService: CmsSchemaService,
  ): void {
    app.get(`${cmsPath}/schema`, (_req: Request, res: Response) => {
      res.json(schemaService.generateBlueprint());
    });

    app.get(`${cmsPath}/assets/:file`, (req: Request, res: Response) => {
      const raw = req.params['file'];
      const file = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
      const filePath = join(publicDir, 'assets', file);
      if (!existsSync(filePath)) {
        res.status(404).send('Not found');
        return;
      }
      const content = readFileSync(filePath);
      res
        .status(200)
        .setHeader(
          'Content-Type',
          MIME[extname(filePath)] ?? 'application/octet-stream',
        )
        .send(content);
    });

    const serveIndex = (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8').send(indexHtml);
    };

    app.get(`${cmsPath}`, serveIndex);
    app.get(`${cmsPath}/*splat`, serveIndex);
  }

  private static registerFastify(
    app: FastifyInstance,
    cmsPath: string,
    publicDir: string,
    indexHtml: string,
    schemaService: CmsSchemaService,
  ): void {
    app.get(`${cmsPath}/schema`, (_req, reply) => {
      reply.type('application/json').send(schemaService.generateBlueprint());
    });

    app.get<{ Params: { file: string } }>(
      `${cmsPath}/assets/:file`,
      (req, reply) => {
        const file = req.params.file ?? '';
        const filePath = join(publicDir, 'assets', file);
        if (!existsSync(filePath)) {
          reply.code(404).type('text/plain').send('Not found');
          return;
        }
        const content = readFileSync(filePath);
        reply
          .code(200)
          .type(MIME[extname(filePath)] ?? 'application/octet-stream')
          .send(content);
      },
    );

    const serveIndex = (_req: FastifyRequest, reply: FastifyReply) => {
      reply.code(200).type('text/html; charset=utf-8').send(indexHtml);
    };

    app.get(`${cmsPath}`, serveIndex);
    app.get(`${cmsPath}/*`, serveIndex);
  }

  static forRoot(options: CmsOptions = {}): DynamicModule {
    return {
      global: true,
      module: NestJsCmsModule,
      providers: [
        { provide: CMS_OPTIONS, useValue: options },
        ...CORE_PROVIDERS,
      ],
      exports: CORE_PROVIDERS,
    };
  }

  static forRootAsync(asyncOptions: CmsModuleAsyncOptions): DynamicModule {
    const asyncProvider: Provider = {
      provide: CMS_OPTIONS,
      useFactory: asyncOptions.useFactory,
      inject: (asyncOptions.inject ?? []) as never[],
    };

    return {
      global: true,
      module: NestJsCmsModule,
      imports: asyncOptions.imports ?? [],
      providers: [asyncProvider, ...CORE_PROVIDERS],
      exports: CORE_PROVIDERS,
    };
  }
}
