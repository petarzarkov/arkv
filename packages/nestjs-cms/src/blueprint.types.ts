// Pure CMS blueprint types — no NestJS dependencies.
// Imported by both the backend (src/types.ts) and the frontend (frontend/src/types.ts).

export interface CmsLookup {
  /** API path to fetch options from, e.g. '/api/users' */
  path: string;
  /** Field on each item to display as label */
  labelField: string;
  /** Field on each item to use as value (default: 'id') */
  valueField?: string;
  /**
   * Query param name used for server-side search (e.g. 'search', 'q', 'name').
   * When set, the dropdown fetches as-you-type instead of loading all records upfront.
   * Requires the backend endpoint to support this param.
   */
  searchParam?: string;
  /**
   * Maximum number of records to request. Sent as `?limit=N` if the endpoint accepts it.
   * Only used when searchParam is NOT set (i.e. the eager-load path).
   * Default: 100.
   */
  limit?: number;
}

export interface CmsAuth {
  required: boolean;
  scheme?: 'bearer' | 'cookie' | 'oauth2' | 'apiKey';
  /** Path to POST credentials to. Sourced from x-cms-login-endpoint. */
  loginEndpoint?: string;
  /** Dot-path into the login response JSON to extract the token. Default: 'access_token' */
  tokenPath?: string;
}

export interface CmsField {
  type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'date';
  format?: string;
  required?: boolean;
  readOnly?: boolean;
  nullable?: boolean;
  description?: string;
  options?: (string | number)[];
  lookup?: CmsLookup;
  items?: CmsField;
  properties?: Record<string, CmsField>;
}

export type PaginationStyle = 'page' | 'offset' | 'cursor' | 'none';

export interface CmsPagination {
  style: PaginationStyle;
  /** Query param carrying the page number (page style) */
  pageParam?: string;
  /** Query param carrying the byte offset (offset style) */
  offsetParam?: string;
  /** Query param carrying the opaque cursor token (cursor style) */
  cursorParam?: string;
  /** Query param carrying the page size / limit */
  limitParam?: string;
  /** Default page size sent with each request */
  pageSize: number;
}

export interface CmsEndpoints {
  list?: { method: 'GET'; path: string; pagination: CmsPagination };
  create?: { method: 'POST'; path: string };
  update?: { method: 'PUT' | 'PATCH'; path: string };
  delete?: { method: 'DELETE'; path: string };
  custom?: { label: string; method: string; path: string }[];
}

export interface CmsModel {
  name: string;
  endpoints: CmsEndpoints;
  /** Fields derived from the list-response schema — used for the table and edit form. */
  schema: Record<string, CmsField>;
  /** Fields derived from the create-request body — used for the create form only. */
  createSchema?: Record<string, CmsField>;
  /**
   * Maximum number of columns shown in the table by default.
   * Users can still toggle hidden columns via the UI.
   * When omitted, all columns are shown.
   */
  maxTableColumns?: number;
}

export interface CmsBlueprint {
  title: string;
  auth: CmsAuth;
  models: Record<string, CmsModel>;
}

export type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'head'
  | 'options';
