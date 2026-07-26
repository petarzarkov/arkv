# @arkv/nestjs-cms

[![coverage](https://petarzarkov.github.io/arkv/coverage-nestjs-cms.svg)](https://petarzarkov.github.io/arkv)

Pluggable admin CMS for NestJS, auto-generated from your OpenAPI/Swagger spec.

## How it works

`@arkv/nestjs-cms` reads the OpenAPI document produced by `@nestjs/swagger`, groups routes into CRUD models, and renders a React admin UI at a configurable path (default `/cms`). No separate resource config is needed — models, fields, pagination style, and auth are all derived automatically from your existing Swagger decorators and security schemes. A `x-cms-*` extension family lets you fine-tune field behaviour without touching application logic.

## Installation

```bash
bun add @arkv/nestjs-cms
# or: npm install @arkv/nestjs-cms
```

Peer dependencies (must already be installed in your project):

```bash
bun add @nestjs/common @nestjs/core @nestjs/swagger reflect-metadata
```

If you use the **Fastify** adapter, also install `fastify` (it is an optional peer dependency):

```bash
bun add fastify
```

## Adapter support

Both NestJS HTTP adapters are supported out of the box.

| Adapter | Status |
|---|---|
| `@nestjs/platform-express` | Supported (default) |
| `@nestjs/platform-fastify` | Supported |

The adapter is detected automatically at startup via `HttpAdapter.getType()`. No configuration is needed.

## Quick start

### 1 — Import the module

```ts
// app.module.ts
import { NestJsCmsModule } from '@arkv/nestjs-cms';

@Module({
  imports: [
    NestJsCmsModule.forRoot({
      title: 'Admin',
      apiPrefix: '/api',
    }),
  ],
})
export class AppModule {}
```

### 2 — Mount the UI

Call `NestJsCmsModule.setup` after `SwaggerModule.createDocument` and before `app.listen`:

```ts
// main.ts
import { NestJsCmsModule } from '@arkv/nestjs-cms';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const swaggerConfig = new DocumentBuilder()
  .setTitle('My API')
  .addBearerAuth()
  .addExtension('x-cms-login-endpoint', '/api/auth/login')
  .addExtension('x-cms-token-path', 'access_token')
  .build();

const document = SwaggerModule.createDocument(app, swaggerConfig);
SwaggerModule.setup('api/docs', app, document);

await NestJsCmsModule.setup(app, document, {
  path: '/cms',
  apiPrefix: '/api',
  title: 'Admin',
  lookups: {
    authorId: { path: '/api/users', labelField: 'name' },
  },
});

await app.listen(3000);
// CMS UI:  http://localhost:3000/cms
// Schema:  http://localhost:3000/cms/schema  ← logged automatically
```

The CMS URL and schema endpoint are logged automatically once the HTTP server is listening:

```
LOG [NestJsCmsModule] CMS:    http://localhost:3000/cms
LOG [NestJsCmsModule] Schema: http://localhost:3000/cms/schema
```

### Factory-based configuration

`forRootAsync` is available for async or config-driven setups:

```ts
NestJsCmsModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    title: config.get('CMS_TITLE'),
    apiPrefix: '/api',
  }),
})
```

## CmsOptions reference

All options are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `path` | `string` | `'/cms'` | Mount path for the CMS UI and schema endpoint. |
| `apiPrefix` | `string` | `'/api'` | Strip this prefix when grouping API paths into models. |
| `exclude` | `string[]` | `[]` | Resource names (lowercase) to hide from the CMS sidebar. |
| `title` | `string` | API title from Swagger | Title shown in the CMS header. |
| `logoUrl` | `string` | built-in SVG | URL for the logo image displayed in the header. |
| `lookups` | `Record<string, CmsLookup>` | `{}` | Relational dropdowns keyed by field name — applied across all models that contain that field. |

## Pagination

The schema service inspects the `@ApiQuery` decorators on each collection `GET` endpoint and selects a pagination style automatically. No additional annotation is needed beyond what you already have for Swagger.

| Style | Detected when query params include | Params sent by UI |
|---|---|---|
| `page` | `page`, `pageno`, `pagenumber` | `page` + `limit` |
| `offset` | `offset`, `skip`, `from`, `start` | `offset` + `limit` |
| `cursor` | `cursor`, `after`, `before`, `token`, `next_token`, `nexttoken` | `cursor` + `limit` |
| `none` | none of the above | no pagination params |

The `limit` param is recognised as any of: `limit`, `take`, `size`, `pagesize`, `per_page`, `perpage`.

Response shapes are unwrapped automatically. A wrapper object with a `data` array (e.g. `{ data: User[], total: number }`) is unwrapped to derive the item schema.

**Page-based example:**

```ts
@Get()
@ApiQuery({ name: 'page',  required: false, type: Number, example: 1 })
@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
@ApiOkResponse({ type: UserPageDto })
findAll(@Query('page') page = 1, @Query('limit') limit = 10) { ... }
```

**Cursor-based example:**

```ts
@Get()
@ApiQuery({ name: 'cursor', required: false, type: Number })
@ApiQuery({ name: 'limit',  required: false, type: Number, example: 10 })
@ApiOkResponse({ type: PostCursorPageDto })
findAll(@Query('cursor') cursor?: string, @Query('limit') limit = 10) { ... }
```

**Offset-based example:**

```ts
@Get()
@ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
@ApiQuery({ name: 'limit',  required: false, type: Number, example: 10 })
@ApiOkResponse({ type: CategoryPageDto })
findAll(@Query('offset') offset = 0, @Query('limit') limit = 10) { ... }
```

## Relational dropdowns (lookups)

When a field stores a foreign key (e.g. `authorId`) and you want it to render as a searchable dropdown populated from another resource, configure it in `lookups`:

```ts
await NestJsCmsModule.setup(app, document, {
  lookups: {
    authorId: { path: '/api/users', labelField: 'name' },
    categoryId: { path: '/api/categories', labelField: 'title', valueField: 'id' },
  },
});
```

The key (`authorId`) is the field name as it appears in your DTOs. The lookup applies to every model that contains a field with that name.

Dropdown options are displayed as `"<id> (<label>)"` — e.g. `"4 (Jane Smith)"` — so the actual stored value is always visible. The raw field (e.g. `authorId: 4`) is still shown in the table alongside a resolved column (e.g. `Author: Jane Smith`).

### CmsLookup options

```ts
interface CmsLookup {
  /** API path to fetch options from, e.g. '/api/users' */
  path: string;

  /** Field on each item to display as the label */
  labelField: string;

  /** Field on each item to use as the stored value. Default: 'id' */
  valueField?: string;

  /**
   * Query param name for server-side search (e.g. 'search', 'q', 'name').
   * When set, the dropdown fetches as-you-type with a 300 ms debounce
   * instead of loading all records upfront. Requires the backend to support
   * this query param.
   */
  searchParam?: string;

  /**
   * Maximum number of records to request.
   * - Eager mode (no searchParam): sent as ?limit=N on every fetch. Default: 100.
   * - Server-search mode: sent alongside the search param. Default: 20.
   */
  limit?: number;
}
```

### Eager mode (default)

Without `searchParam`, the dropdown loads up to `limit` records once and filters client-side as the user types:

```ts
lookups: {
  authorId: { path: '/api/users', labelField: 'name', limit: 200 },
}
// fetches: GET /api/users?limit=200
```

### Server-side search mode

With `searchParam`, nothing is fetched until the user types. Results are fetched from the server with a 300 ms debounce:

```ts
lookups: {
  authorId: {
    path: '/api/users',
    labelField: 'name',
    searchParam: 'search',
    limit: 20,
  },
}
// fetches: GET /api/users?search=jane&limit=20  (as user types "jane")
```

Use this mode for resources with large record counts where loading all options upfront is impractical.

### Per-DTO annotation

You can also annotate a specific field directly using `@ApiExtension`, without going through `lookups`:

```ts
@ApiProperty({ description: 'Author user ID' })
@ApiExtension('x-cms-lookup',       '/api/users')
@ApiExtension('x-cms-lookup-label', 'name')
@ApiExtension('x-cms-lookup-value', 'id')
authorId!: number;
```

## Field types

The CMS maps OpenAPI property types to the following field renderers:

| OpenAPI type | Format | CMS field type | Rendered as |
|---|---|---|---|
| `string` | — | `string` | Text input |
| `string` | `email` | `string` | Email input |
| `string` | `password` | `string` | Password input |
| `string` | `date-time` / `date` | `date` | Date picker |
| `integer` / `number` | — | `number` | Number input |
| `boolean` | — | `boolean` | Toggle switch |
| `string` with `enum` | — | `enum` | Select dropdown |
| `object` / `object` with `additionalProperties` | — | `object` | JSON textarea with live validation |
| `array` | — | `array` | JSON textarea |
| any with `x-cms-lookup` | — | (lookup) | Searchable select |

Fields marked `readOnly` in the OpenAPI spec (or via `x-cms-readonly`) are displayed as disabled text inputs and excluded from create/edit payloads.

## OpenAPI extensions reference

### Property-level extensions

Set on individual DTO properties via `@ApiExtension` or `@ApiProperty`:

| Extension | Effect |
|---|---|
| `x-cms-hidden` | Exclude this field from the table and all forms. |
| `x-cms-readonly` | Display the field but prevent editing. |
| `x-cms-lookup` | Path to fetch relational options from. Renders a searchable dropdown. |
| `x-cms-lookup-label` | Field name to display as the option label. |
| `x-cms-lookup-value` | Field name to use as the stored value (default: `id`). |
| `x-cms-lookup-search` | Query param for server-side search. |
| `x-cms-lookup-limit` | Maximum records to request from the lookup endpoint. |

### Document-level extensions

Set on the `DocumentBuilder` and apply globally:

| Extension | Effect |
|---|---|
| `x-cms-login-endpoint` | Path to POST `{ email, password }` to for the CMS login form. |
| `x-cms-token-path` | Dot-path into the login response to extract the auth token. Default: `access_token`. |

```ts
new DocumentBuilder()
  .addExtension('x-cms-login-endpoint', '/api/auth/login')
  .addExtension('x-cms-token-path', 'access_token')
  .build()
```

## Auth

The CMS reads `components.securitySchemes` from the OpenAPI document to determine whether authentication is required.

| Security scheme | Detected as | Behaviour |
|---|---|---|
| `http` / `bearer` | `bearer` | Token stored in `localStorage`, sent as `Authorization: Bearer <token>` |
| `apiKey` in cookie | `cookie` | Credentials sent as a cookie (`credentials: 'include'`) |
| `oauth2` | `oauth2` | Same as bearer |
| `apiKey` (header/query) | `apiKey` | Token sent per the scheme definition |

When `x-cms-login-endpoint` is present, the CMS renders a login form. On successful login it extracts the token from the response using `x-cms-token-path` and stores it for subsequent requests. If no security schemes are defined, the CMS operates without authentication.

## Logo customisation

Pass `logoUrl` to display a custom logo in the header:

```ts
await NestJsCmsModule.setup(app, document, {
  logoUrl: 'https://example.com/logo.png',
});
```

The URL is injected as `window.__CMS_LOGO__` into the served HTML at startup. If omitted, a built-in SVG icon is used.

## Logging

The module uses NestJS's `Logger` under the context `NestJsCmsModule`, which inherits any custom logger set via `app.useLogger()`. Two log lines are emitted automatically once the HTTP server is listening:

```
LOG [NestJsCmsModule] Registering CMS routes on express at /cms
LOG [NestJsCmsModule] CMS:    http://localhost:3000/cms
LOG [NestJsCmsModule] Schema: http://localhost:3000/cms/schema
```

## Blueprint JSON

`GET /cms/schema` returns the full computed blueprint as JSON. This is the contract the frontend consumes and is useful for debugging model detection, field types, pagination style, and lookup configuration.

```bash
curl http://localhost:3000/cms/schema | jq .
```

Example response:

```json
{
  "title": "Admin",
  "auth": {
    "required": true,
    "scheme": "bearer",
    "loginEndpoint": "/api/auth/login",
    "tokenPath": "access_token"
  },
  "models": {
    "User": {
      "name": "User",
      "endpoints": {
        "list":   { "method": "GET",    "path": "/api/users",       "pagination": { "style": "page",   "pageParam": "page",     "limitParam": "limit", "pageSize": 20 } },
        "create": { "method": "POST",   "path": "/api/users" },
        "update": { "method": "PATCH",  "path": "/api/users/{id}" },
        "delete": { "method": "DELETE", "path": "/api/users/{id}" }
      },
      "schema": {
        "id":        { "type": "number", "readOnly": true },
        "email":     { "type": "string", "format": "email" },
        "name":      { "type": "string" },
        "role":      { "type": "enum",   "options": ["admin", "user"] },
        "createdAt": { "type": "date",   "format": "date-time", "readOnly": true }
      },
      "createSchema": {
        "email":    { "type": "string", "format": "email", "required": true },
        "name":     { "type": "string", "required": true },
        "password": { "type": "string", "format": "password", "required": true },
        "role":     { "type": "enum",   "options": ["admin", "user"] }
      }
    },
    "Post": {
      "name": "Post",
      "endpoints": {
        "list":   { "method": "GET",    "path": "/api/posts",       "pagination": { "style": "cursor", "cursorParam": "cursor", "limitParam": "limit", "pageSize": 20 } },
        "create": { "method": "POST",   "path": "/api/posts" },
        "update": { "method": "PATCH",  "path": "/api/posts/{id}" },
        "delete": { "method": "DELETE", "path": "/api/posts/{id}" }
      },
      "schema": {
        "id":       { "type": "number", "readOnly": true },
        "title":    { "type": "string" },
        "content":  { "type": "string" },
        "published":{ "type": "boolean" },
        "authorId": { "type": "number", "lookup": { "path": "/api/users", "labelField": "name", "valueField": "id" } },
        "metadata": { "type": "object" },
        "createdAt":{ "type": "date",   "format": "date-time", "readOnly": true }
      }
    }
  }
}
```

## Example app

A complete working example lives in [`examples/nestjs-cms/`](../../examples/nestjs-cms):

- **Auth**: JWT bearer with login form
- **Users**: page pagination, email/name/role/password fields, enum role dropdown
- **Posts**: cursor pagination, relational `authorId` lookup (dropdown), JSON `metadata` field
- **Categories**: offset pagination
- **Database**: Drizzle ORM + Bun SQLite — no Docker, Redis, or Postgres required

```bash
cd examples/nestjs-cms
bun dev
```

| URL | Description |
|---|---|
| `http://localhost:3000/api` | REST API |
| `http://localhost:3000/api/docs` | Swagger UI |
| `http://localhost:3000/cms` | CMS UI |
| `http://localhost:3000/cms/schema` | Blueprint JSON |

Login credentials (seeded on first run):

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin123` | admin |

## License

MIT
