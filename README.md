# mongo-db-odata4 (Monorepo)

Minimal, maintainable OData v4 -> MongoDB library that works for any collection with near-zero wiring.

## Packages
- `odata-mongo-contracts`: Interfaces and types (no deps)
- `odata-mongo-core`: Parser and Mongo query builder (pure TS)
- `odata-mongo-express`: Thin Express adapter

## Quick Start
```ts
import express from 'express';
import { MongoClient } from 'mongodb';
import { registerOData } from 'odata-mongo-express';

async function main() {
  const app = express();
  const client = await MongoClient.connect(process.env.MONGO_URL!);
  const db = client.db('test');
  const orders = db.collection('orders');

  // Exposes:
  // GET /odata/Orders
  // GET /odata/Orders/$count
  registerOData(app, '/odata', 'Orders', orders);

  app.listen(3000, () => console.log('OData at http://localhost:3000/odata/Orders'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

### $filter examples
- `?$filter=price gt 10 and startswith(name,'A')`
- `?$filter=contains(description,'pro')`

### $expand (single-level)
```ts
registerOData(app, '/odata', 'Orders', orders, {
  expandMap: {
    customer: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer', single: true }
  }
});
// GET /odata/Orders?$expand=customer
```

### $metadata
```ts
registerOData(app, '/odata', 'Orders', orders, {
  metadata: {
    namespace: 'Demo', container: 'Container', entityTypeName: 'Order', key: 'id',
    // Option A: explicit properties
    properties: [ { name: 'id', type: 'Edm.String', nullable: false }, { name: 'name', type: 'Edm.String' } ],
    // Option B: infer from JSON Schema
    // jsonSchema: { properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'] }
  }
});
// GET /odata/$metadata
```

### $search
```http
GET /odata/Orders?$search=alpha
```

### $apply (groupby aggregate)
```http
GET /odata/Orders?$apply=groupby((category),aggregate(total with sum as totalSum))
```

### $compute
```http
GET /odata/Orders?$compute=price mul 2 as doublePrice&$select=name,doublePrice
```

### $expand (multi-level)
```http
GET /odata/Orders?$expand=customer,customerAddress
```

### $batch (JSON simplified)
```http
POST /odata/$batch
{
  "requests": [
    { "method": "GET", "url": "/odata/Orders?$top=1" },
    { "method": "POST", "url": "/odata/Orders", "body": { "_id": 99, "name": "X" }, "atomicGroup": "g1" }
  ]
}
```

### Delta (simplified)
```http
GET /odata/Orders?$delta=true
// returns @odata.deltaLink; then GET that link to fetch changes since token
```

## API
```ts
registerOData(
  app: any,
  basePath: string,
  entitySet: string,
  collection: any,
  options?: {
    parser?: IODataParser;
    executor?: IODataExecutor<any>;
    serializer?: IODataSerializer;
    expandMap?: Record<string, { from: string; localField: string; foreignField: string; as?: string; single?: boolean }>;
    metadata?: {
      namespace?: string; container?: string; entityTypeName?: string; key?: string;
      properties?: Array<{ name: string; type: string; nullable?: boolean }>;
      jsonSchema?: any;
    }
  }
): void
```
- `basePath`: e.g. `/odata`
- `entitySet`: e.g. `Orders`
- `collection`: a MongoDB collection (or anything implementing `CollectionLike`)
- `options`: swap parser/executor/serializer if desired

## Supported (MVP)
- `$top`, `$skip`, `$select`, `$orderby`, `$count`
- `$filter`: temporarily supports JSON pass-through only (until full v4 parsing)

## Roadmap
- Full OData v4 `$filter` via `odata-v4-parser`
- `$metadata` endpoint
- Single-level `$expand` via `$lookup`

## Development
```bash
npm install
npm run build
```

Monorepo uses npm workspaces and TypeScript project references.

## Getting Started & AI Guide
- See `docs/GETTING_STARTED.md` for install, quick usage, and feature matrix
- See `docs/AI_USAGE_GUIDE.md` for AI-friendly hints, APIs, and troubleshooting
