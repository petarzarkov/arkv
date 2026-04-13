import type { OpenAPIObject } from '@nestjs/swagger';
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import type {
  CmsLookup,
  CmsAuth,
  CmsField,
  CmsEndpoints,
  CmsModel,
  CmsBlueprint,
  HttpMethod,
  CmsPagination,
  PaginationStyle,
} from './blueprint.types.js';

export type {
  CmsLookup,
  CmsAuth,
  CmsField,
  CmsEndpoints,
  CmsModel,
  CmsBlueprint,
  HttpMethod,
  CmsPagination,
  PaginationStyle,
};

export const CMS_OPTIONS = 'CMS_OPTIONS';

export interface CmsOptions {
  /** Mount path for the CMS UI and schema endpoint. Default: '/cms' */
  path?: string;
  /** Strip this prefix when grouping paths into models. Default: '/api' */
  apiPrefix?: string;
  /** Resource names (lowercase) to exclude from the CMS. */
  exclude?: string[];
  /** Title shown in the CMS UI. */
  title?: string;
  /** URL for the logo image shown in the sidebar header. Falls back to the built-in SVG icon. */
  logoUrl?: string;
  /**
   * Configure relational dropdowns for specific field names.
   * The key is the field name (e.g. 'authorId') and applies
   * across all models that contain that field.
   *
   * @example
   * lookups: {
   *   authorId: { path: '/api/users', labelField: 'name' },
   *   categoryId: { path: '/api/categories', labelField: 'title' },
   * }
   */
  lookups?: Record<string, CmsLookup>;
}

export interface CmsModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  useFactory: (...args: unknown[]) => CmsOptions | Promise<CmsOptions>;
  inject?: ModuleMetadata['imports'];
}

export type CmsSetupFn = (
  app: INestApplication,
  document: OpenAPIObject,
  options?: CmsOptions,
) => Promise<void>;
