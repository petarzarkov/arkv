import { Injectable, Inject, Optional } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { CMS_OPTIONS } from './types.js';

// Minimal inline types — SchemaObject/ReferenceObject not exported from @nestjs/swagger v11
interface ReferenceObject {
  $ref: string;
}
interface SchemaObject {
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: SchemaObject | ReferenceObject;
  properties?: Record<string, SchemaObject | ReferenceObject>;
  required?: string[];
  readOnly?: boolean;
  nullable?: boolean;
  description?: string;
  [key: string]: unknown;
}
import type {
  CmsOptions,
  CmsBlueprint,
  CmsModel,
  CmsField,
  CmsAuth,
  CmsEndpoints,
  HttpMethod,
  CmsPagination,
} from './types.js';

const DEFAULT_PAGE_SIZE = 20;

const CRUD_METHODS: Record<
  HttpMethod,
  'list' | 'create' | 'update' | 'delete' | null
> = {
  get: 'list',
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'delete',
  head: null,
  options: null,
};

function singularize(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes'))
    return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isRef(obj: SchemaObject | ReferenceObject): obj is ReferenceObject {
  return '$ref' in obj;
}

@Injectable()
export class CmsSchemaService {
  private document: OpenAPIObject | null = null;

  constructor(
    @Optional() @Inject(CMS_OPTIONS) private readonly options: CmsOptions = {},
  ) {}

  setDocument(document: OpenAPIObject): void {
    this.document = document;
  }

  getDocument(): OpenAPIObject | null {
    return this.document;
  }

  generateBlueprint(): CmsBlueprint {
    if (this.options.blueprint) {
      return {
        ...this.options.blueprint,
        title: this.options.title ?? this.options.blueprint.title,
      };
    }

    if (!this.document) {
      return {
        title: this.options.title ?? 'Admin',
        auth: { required: false },
        models: {},
      };
    }

    return {
      title: this.options.title ?? this.document.info?.title ?? 'Admin',
      auth: this.extractAuth(),
      models: this.extractModels(),
    };
  }

  private extractAuth(): CmsAuth {
    const doc = this.document!;
    const schemes = doc.components?.securitySchemes ?? {};
    const keys = Object.keys(schemes);

    if (keys.length === 0) {
      return { required: false };
    }

    const loginEndpoint =
      ((doc as unknown as Record<string, unknown>)['x-cms-login-endpoint'] as
        | string
        | undefined) ??
      ((doc.info as unknown as Record<string, unknown>)?.[
        'x-cms-login-endpoint'
      ] as string | undefined);

    const tokenPath =
      ((doc as unknown as Record<string, unknown>)['x-cms-token-path'] as
        | string
        | undefined) ?? 'access_token';

    // Detect scheme type from the first security scheme
    for (const key of keys) {
      const scheme = schemes[key] as unknown as Record<string, unknown>;
      if (scheme['type'] === 'http' && scheme['scheme'] === 'bearer') {
        return { required: true, scheme: 'bearer', loginEndpoint, tokenPath };
      }
      if (scheme['type'] === 'apiKey' && scheme['in'] === 'cookie') {
        return { required: true, scheme: 'cookie', loginEndpoint };
      }
      if (scheme['type'] === 'oauth2') {
        return { required: true, scheme: 'oauth2', loginEndpoint };
      }
      if (scheme['type'] === 'apiKey') {
        return { required: true, scheme: 'apiKey', loginEndpoint, tokenPath };
      }
    }

    return { required: true, loginEndpoint, tokenPath };
  }

  private extractModels(): Record<string, CmsModel> {
    const doc = this.document!;
    const prefix = this.options.apiPrefix ?? '/api';
    const exclude = new Set(
      (this.options.exclude ?? []).map((e) => e.toLowerCase()),
    );
    const models: Record<string, CmsModel> = {};

    for (const [rawPath, pathItem] of Object.entries(doc.paths ?? {})) {
      // Strip prefix to get resource segment
      const stripped = rawPath.startsWith(prefix)
        ? rawPath.slice(prefix.length)
        : rawPath;
      const segments = stripped.split('/').filter(Boolean);

      if (segments.length === 0) continue;

      const resourceSegment = segments[0].toLowerCase();
      if (exclude.has(resourceSegment)) continue;

      // Skip auth-ish paths
      if (
        ['auth', 'login', 'logout', 'token', 'health', 'metrics'].includes(
          resourceSegment,
        )
      )
        continue;

      const isDetailRoute = segments.some((s) => s.startsWith('{'));
      const modelKey = capitalize(singularize(resourceSegment));

      if (!models[modelKey]) {
        models[modelKey] = { name: modelKey, endpoints: {}, schema: {} };
      }

      const model = models[modelKey];

      for (const [rawMethod, operation] of Object.entries(pathItem ?? {})) {
        const method = rawMethod.toLowerCase() as HttpMethod;
        const crudAction = CRUD_METHODS[method];
        if (!crudAction || !operation || typeof operation !== 'object')
          continue;

        const op = operation as Record<string, unknown>;
        const endpoints = model.endpoints as CmsEndpoints;

        if (crudAction === 'list' && !isDetailRoute && !endpoints.list) {
          endpoints.list = {
            method: 'GET',
            path: rawPath,
            pagination: this.detectPagination(op),
          };
          const responseSchema = this.resolveResponseSchema(op);
          if (responseSchema) {
            const fields = this.schemaToFields(responseSchema);
            Object.assign(model.schema, fields);
          }
        }

        if (crudAction === 'create' && !isDetailRoute && !endpoints.create) {
          endpoints.create = { method: 'POST', path: rawPath };
          const bodySchema = this.resolveRequestBodySchema(op);
          if (bodySchema) {
            model.createSchema = this.schemaToFields(bodySchema);
          }
        }

        if (crudAction === 'update' && isDetailRoute && !endpoints.update) {
          endpoints.update = {
            method: method === 'put' ? 'PUT' : 'PATCH',
            path: rawPath,
          };
          if (Object.keys(model.schema).length === 0) {
            const bodySchema = this.resolveRequestBodySchema(op);
            if (bodySchema) {
              const fields = this.schemaToFields(bodySchema);
              Object.assign(model.schema, fields);
            }
          }
        }

        if (crudAction === 'delete' && isDetailRoute && !endpoints.delete) {
          endpoints.delete = { method: 'DELETE', path: rawPath };
        }
      }
    }

    // Remove models with no endpoints
    for (const key of Object.keys(models)) {
      const m = models[key];
      if (!m.endpoints.list && !m.endpoints.create) {
        delete models[key];
      }
    }

    return models;
  }

  private detectPagination(op: Record<string, unknown>): CmsPagination {
    const params = (op['parameters'] ?? []) as Record<string, unknown>[];
    const queryNames = params
      .filter((p) => p['in'] === 'query')
      .map((p) =>
        (typeof p['name'] === 'string' ? p['name'] : '').toLowerCase(),
      );

    const limitParam = queryNames.find((n) =>
      ['limit', 'take', 'size', 'pagesize', 'per_page', 'perpage'].includes(n),
    );

    const cursorParam = queryNames.find((n) =>
      [
        'cursor',
        'after',
        'before',
        'token',
        'next_token',
        'nexttoken',
      ].includes(n),
    );
    if (cursorParam) {
      return {
        style: 'cursor',
        cursorParam,
        limitParam,
        pageSize: DEFAULT_PAGE_SIZE,
      };
    }

    const offsetParam = queryNames.find((n) =>
      ['offset', 'skip', 'from', 'start'].includes(n),
    );
    if (offsetParam) {
      return {
        style: 'offset',
        offsetParam,
        limitParam,
        pageSize: DEFAULT_PAGE_SIZE,
      };
    }

    const pageParam = queryNames.find((n) =>
      ['page', 'pageno', 'pagenumber'].includes(n),
    );
    if (pageParam) {
      return {
        style: 'page',
        pageParam,
        limitParam,
        pageSize: DEFAULT_PAGE_SIZE,
      };
    }

    return { style: 'none', pageSize: DEFAULT_PAGE_SIZE };
  }

  private resolveRef(ref: string): SchemaObject | null {
    const parts = ref.replace('#/', '').split('/');
    let current: unknown = this.document;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[part];
    }
    return (current as SchemaObject) ?? null;
  }

  private resolveSchema(
    schema: SchemaObject | ReferenceObject,
  ): SchemaObject | null {
    if (isRef(schema)) {
      return this.resolveRef(schema.$ref);
    }
    return schema;
  }

  private resolveRequestBodySchema(
    op: Record<string, unknown>,
  ): SchemaObject | null {
    const body = op['requestBody'] as Record<string, unknown> | undefined;
    if (!body) return null;
    const content = body['content'] as Record<string, unknown> | undefined;
    const jsonContent = content?.['application/json'] as
      | Record<string, unknown>
      | undefined;
    const schema = jsonContent?.['schema'] as
      | SchemaObject
      | ReferenceObject
      | undefined;
    if (!schema) return null;
    return this.resolveSchema(schema);
  }

  private resolveResponseSchema(
    op: Record<string, unknown>,
  ): SchemaObject | null {
    const responses = op['responses'] as Record<string, unknown> | undefined;
    if (!responses) return null;

    const successResponse = (responses['200'] ??
      responses['201'] ??
      responses['default']) as Record<string, unknown> | undefined;
    if (!successResponse) return null;

    const content = successResponse['content'] as
      | Record<string, unknown>
      | undefined;
    const jsonContent = content?.['application/json'] as
      | Record<string, unknown>
      | undefined;
    const schema = jsonContent?.['schema'] as
      | SchemaObject
      | ReferenceObject
      | undefined;
    if (!schema) return null;

    const resolved = this.resolveSchema(schema);
    if (!resolved) return null;

    // If response is an array, get the item schema
    if (resolved.type === 'array' && resolved.items) {
      return this.resolveSchema(
        resolved.items as SchemaObject | ReferenceObject,
      );
    }

    // If response wraps data (e.g. { data: User[], total: number })
    if (resolved.type === 'object' && resolved.properties) {
      const dataSchema = resolved.properties['data'] as
        | SchemaObject
        | ReferenceObject
        | undefined;
      if (dataSchema) {
        const resolvedData = this.resolveSchema(dataSchema);
        if (resolvedData?.type === 'array' && resolvedData.items) {
          return this.resolveSchema(
            resolvedData.items as SchemaObject | ReferenceObject,
          );
        }
        return resolvedData;
      }
    }

    return resolved;
  }

  private schemaToFields(schema: SchemaObject): Record<string, CmsField> {
    const fields: Record<string, CmsField> = {};
    const properties = schema.properties ?? {};
    const required = new Set<string>(schema.required ?? []);

    for (const [name, rawProp] of Object.entries(properties)) {
      const prop = isRef(rawProp as SchemaObject | ReferenceObject)
        ? this.resolveSchema(rawProp as ReferenceObject)
        : (rawProp as SchemaObject);

      if (!prop) continue;

      const ext = prop as unknown as Record<string, unknown>;
      if (ext['x-cms-hidden']) continue;

      fields[name] = this.mapField(prop, name, required.has(name));
    }

    return fields;
  }

  private mapField(
    prop: SchemaObject,
    _name: string,
    required: boolean,
  ): CmsField {
    const ext = prop as unknown as Record<string, unknown>;

    // Enum
    if (prop.enum) {
      return {
        type: 'enum',
        options: prop.enum as (string | number)[],
        required,
        description: prop.description,
        readOnly:
          prop.readOnly ?? (ext['x-cms-readonly'] as boolean | undefined),
        nullable: prop.nullable,
      };
    }

    // Date/datetime
    if (
      prop.type === 'string' &&
      (prop.format === 'date-time' || prop.format === 'date')
    ) {
      return {
        type: 'date',
        format: prop.format,
        required,
        description: prop.description,
        readOnly:
          prop.readOnly ?? (ext['x-cms-readonly'] as boolean | undefined),
        nullable: prop.nullable,
      };
    }

    // Relational lookup — preserve the actual underlying type (e.g. integer authorId)
    const lookup = ext['x-cms-lookup'] as string | undefined;
    if (lookup) {
      const lookupTypeMap: Record<string, CmsField['type']> = {
        string: 'string',
        integer: 'number',
        number: 'number',
        boolean: 'boolean',
        object: 'object',
        array: 'array',
      };
      return {
        type: lookupTypeMap[prop.type as string] ?? 'string',
        required,
        description: prop.description,
        readOnly:
          prop.readOnly ?? (ext['x-cms-readonly'] as boolean | undefined),
        nullable: prop.nullable,
        lookup: {
          path: lookup,
          labelField:
            (ext['x-cms-lookup-label'] as string | undefined) ?? 'name',
          valueField: (ext['x-cms-lookup-value'] as string | undefined) ?? 'id',
          searchParam: ext['x-cms-lookup-search'] as string | undefined,
          limit: ext['x-cms-lookup-limit'] as number | undefined,
        },
      };
    }

    // Array
    if (prop.type === 'array' && prop.items) {
      const itemSchema = this.resolveSchema(
        prop.items as SchemaObject | ReferenceObject,
      );
      return {
        type: 'array',
        required,
        description: prop.description,
        items: itemSchema ? this.mapField(itemSchema, '', false) : undefined,
      };
    }

    // Object / nested
    if (prop.type === 'object' && prop.properties) {
      return {
        type: 'object',
        required,
        description: prop.description,
        properties: this.schemaToFields(prop),
      };
    }

    // Primitives
    const typeMap: Record<string, CmsField['type']> = {
      string: 'string',
      integer: 'number',
      number: 'number',
      boolean: 'boolean',
      object: 'object',
      array: 'array',
    };

    return {
      type: typeMap[prop.type as string] ?? 'string',
      format: prop.format,
      required,
      description: prop.description,
      readOnly: prop.readOnly ?? (ext['x-cms-readonly'] as boolean | undefined),
      nullable: prop.nullable,
    };
  }
}
