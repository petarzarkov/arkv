// Re-exported from the backend source — single source of truth.
// Vite resolves this relative TS import directly (no build step needed).
export type {
  CmsLookup,
  CmsAuth,
  CmsField,
  CmsEndpoints,
  CmsModel,
  CmsBlueprint,
  CmsPagination,
  PaginationStyle,
} from '../../src/blueprint.types.ts';
