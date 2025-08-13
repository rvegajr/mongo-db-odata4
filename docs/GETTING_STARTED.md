# Getting Started

This monorepo provides a minimal, maintainable OData v4 -> MongoDB library that works with any collection with near-zero wiring.

## Install

- Monorepo users (from this repo):
  - Build: `npm install && npm run build`
- Consuming projects (after publishing):
  - Express: `npm install odata-mongo-express mongodb express`
  - Fastify: `npm install odata-mongo-fastify mongodb fastify`

## Quick Start (Express)
```ts
import express from 'express';
import { MongoClient } from 'mongodb';
import { registerOData } from 'odata-mongo-express';

async function main() {
  const app = express();
  const client = await MongoClient.connect(process.env.MONGO_URL || 'mongodb://localhost:27017');
  const db = client.db('demo');
  const orders = db.collection('orders');

  registerOData(app, '/odata', 'Orders', orders, {
    limits: { maxTop: 100, defaultPageSize: 20 },
    expandMap: {
      customer: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer', single: true }
    },
    dateCoercion: {
      fields: ['orderDate', 'shipDate'],
      formats: ['ISO', 'YYYY-MM-DD', 'MM/DD/YYYY'],
      numericEpoch: 'auto',
      debug: true,
      onError: (info) => console.error('Date parse error', info)
    }
  });

  app.listen(3000, () => console.log('OData at http://localhost:3000/odata/Orders'));
}

main().catch(err => { console.error(err); process.exit(1); });
```

## Routes
- GET `/odata/Orders` ($filter,$select,$orderby,$top,$skip,$count,$expand,$search,$apply,$compute)
- GET `/odata/Orders/$count`
- GET `/odata/$metadata`
- POST `/odata/$batch` (JSON simplified changesets)
- Delta: GET `/odata/Orders?$delta=true` → `@odata.deltaLink`

## Options Overview
- limits: paging guardrails (maxTop, defaultPageSize)
- expandMap: config for single/multi-level $expand
- metadata: namespace, container, entityTypeName, key, JSON Schema inference
- security: operator allowlist, regex length cap
- dateCoercion: flexible date parsing for response rows (debug hooks)

## Feature Matrix
- Queries: $filter,$select,$orderby,$top,$skip,$count
- Expand: single/multi-level via $lookup
- Search: $search basic case-insensitive substring
- Apply: $apply groupby aggregate (minimal)
- Compute: concat,tolower,toupper,substring,length,trim,indexof,replace,replaceAll,startswith,endswith,round,floor,ceiling; nested expressions supported
- Metadata: minimal CSDL with JSON Schema inference
- Batch: JSON batch with atomicGroup changesets
- Delta: token-based incremental changes (pluggable store)

## Fastify Adapter (Optional)
```ts
import Fastify from 'fastify';
import { registerODataFastify } from 'odata-mongo-fastify';

const app = Fastify();
registerODataFastify(app, '/odata', 'Orders', orders);
```
