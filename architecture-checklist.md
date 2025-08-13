## OData v4 → Mongo Library (Option B) — Implementation Checklist

- [x] Purpose: Provide a minimal, maintainable library to expose any MongoDB collection via OData v4 with near‑zero wiring
- [x] Target: Three-package structure (contracts, core, express adapter) with clean DI and strong tests

### 1) Monorepo and Tooling
- [x] Package manager: npm workspaces (no external tooling required)
- [ ] Workspace layout
  - [x] `packages/odata-mongo-contracts`
  - [x] `packages/odata-mongo-core`
  - [x] `packages/odata-mongo-express`
- [ ] Root configs
  - [x] Shared `tsconfig.base.json`
  - [x] Root `tsconfig.json` with project references
  - [x] Build with TypeScript (tsc project references)
  - [x] Test runner: vitest (added later)
  - [x] LTS Node target, TypeScript strict mode enabled

### 2) Contracts Package (zero deps, immutable API)
- [x] Define core types
  - [x] `ODataQuery` (top, skip, filter AST, orderBy, select, expand, count)
  - [x] `ODataResult<T>` (value, count?, nextLink?)
- [x] Define interfaces
  - [x] `IODataParser { parse(url: string): ODataQuery }`
  - [x] `IODataExecutor<T> { execute(query: ODataQuery, collection: unknown, options?): Promise<ODataResult<T>> }`
  - [x] `IODataSerializer { write(result: ODataResult<any>, res: unknown, options?): void }`
- [ ] Document versioning policy; treat contracts as immutable once published

### 3) Core Package (pure TS, no Express dependency)
- [ ] Parser
  - [ ] Implement `ODataParserV4` (wrap `odata-v4-parser` or existing logic)
  - [x] Normalize to `ODataQuery` and validate
  - [x] Map errors to OData v4 error structure
- [x] Mongo Query Builder
  - [x] Map `ODataQuery` → `{ filter, projection, sort, limit, skip }`
  - [x] Operators: eq, ne, lt, le, gt, ge, and/or/not, in, contains/startswith/endswith
  - [x] Types: string, number, boolean, null, date/time, guid, `ObjectId`
  - [x] Pagination safety: `maxTop`, defaultTop, skip limits
  - [x] `$count`, `$select`, `$orderby` support
  - [x] `$expand` (Phase 2+): single-level via `$lookup` with constraints
- [x] Serializer
  - [ ] OData JSON format and error format
- [x] Configuration hooks
  - [ ] Function map for custom OData→Mongo functions
  - [x] Field mapping (e.g., `id` ↔ `_id`), case sensitivity rules

### 4) Express Adapter Package (thin transport layer)
- [x] Single entrypoint: `registerOData(app, basePath, collection, options?)`
- [ ] Endpoints
  - [x] `GET {basePath}/{entitySet}` ($filter, $top, $skip, $orderby, $select, $count)
  - [x] `GET {basePath}/{entitySet}/$count`
  - [x] `GET {basePath}/$metadata` (Phase 2+)
- [x] Pipeline
  - [ ] Parse URL → `ODataQuery`
  - [ ] Execute → `ODataResult`
  - [ ] Serialize → OData JSON, proper headers
- [x] Options
  - [ ] `maxTop`, defaults, field mappings (`id` ↔ `_id`)
  - [ ] Pluggable parser/executor/serializer (Strategy)
- [x] Errors
  - [ ] Consistent OData error format with HTTP status mapping

### 5) Metadata Strategy
- [x] Decide source: JSON Schema → CSDL projection (preferred) or manual CSDL
- [x] Implement minimal `$metadata` generator (Phase 2+)
- [x] Document constraints when schema is absent

### 6) Testing (real services preferred)
- [ ] Unit tests (core)
  - [ ] Parser fixtures for OData v4 queries
  - [ ] Builder mappings → expected Mongo filters/projections/sorts
- [x] Integration tests
  - [x] Local MongoDB (Docker) and minimal Express app with `registerOData`
  - [x] Verify $filter/$top/$skip/$orderby/$select/$count paths + edge cases
- [ ] CLI harness to run end-to-end scenarios
- [ ] Performance sanity checks: large collections, index-friendly queries

### 7) Non-Functional
- [x] Security: sanitize, cap `top`, deny unsafe operators, avoid regex DoS
- [ ] Observability: optional hooks (QueryParsed, QueryExecuted, QueryFailed)
- [ ] Performance: projection usage, indexes; document `$expand` limits
- [ ] Backward compatibility: preserve contracts; semver for any breaking changes
- [x] Documentation: package READMEs and runnable examples

### 8) Phased Delivery
- [x] Phase 1 (MVP): $filter (core ops), $top, $skip, $orderby, $count, $select; `registerOData`
- [x] Phase 2: `$metadata`, `$expand` (single-level), function map, robust errors
- [ ] Phase 3: Hardening (perf, security, docs), optional adapters (Fastify)
  - [x] Add paging nextLink
  - [x] Absolute URLs for nextLink
  - [x] Basic metadata inference from JSON Schema
  - [x] Single-level $expand via $lookup
  - [x] Integration tests for core features

### 9) Decisions (defaults chosen for MVP)
- [x] Package manager: npm workspaces
- [x] Build tool: TypeScript project references (tsc)
- [x] Test runner: vitest
- [ ] Parser dependency: evaluate `odata-v4-parser` during Core implementation
- [x] DI style: lightweight factory injection (no container for now)
- [x] Metadata source: JSON Schema (if provided), fallback to minimal manual CSDL


