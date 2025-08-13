# AI Usage Guide: mongo-db-odata4

## Purpose
Expose MongoDB collections as OData v4 endpoints with minimal code.

## Key APIs
- registerOData(app, basePath, entitySet, collection, options?) — Express
- registerODataFastify(app, basePath, entitySet, collection, options?) — Fastify

Options (selected):
- limits: { maxTop?: number; defaultPageSize?: number }
- expandMap: Record<string, { from, localField, foreignField, as?, single? }>
- metadata: { namespace?, container?, entityTypeName?, key?, properties?, jsonSchema? }
- security: { allowedOperators?: string[]; maxRegexLength?: number }
- dateCoercion: { fields: string[]; formats?: string[]; numericEpoch?: 'ms'|'s'|'auto'; debug?: boolean; onError?: (info) => void }

## Routes
- GET {base}/{entitySet}
- GET {base}/{entitySet}/$count
- GET {base}/$metadata
- POST {base}/$batch (JSON simplified)
- Delta: GET {base}/{entitySet}?$delta=true → returns @odata.deltaLink

## OData Features
- $filter, $select, $orderby, $top, $skip, $count
- $expand (single/multi-level via expandMap)
- $search (simple contains)
- $apply (groupby aggregate minimal)
- $compute functions:
  - Strings: concat,tolower,toupper,substring,length,trim,indexof,replace,replaceAll,startswith,endswith
  - Numbers: round,floor,ceiling
  - Nested expressions supported

## Example (Express)
```ts
import express from 'express';
import { MongoClient } from 'mongodb';
import { registerOData } from 'odata-mongo-express';

const app = express();
const client = await MongoClient.connect('mongodb://localhost:27017');
const db = client.db('demo');
const orders = db.collection('orders');

registerOData(app, '/odata', 'Orders', orders, {
  limits: { maxTop: 100, defaultPageSize: 20 },
  expandMap: { customer: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer', single: true } },
  dateCoercion: { fields: ['orderDate'] }
});
```

## Troubleshooting (AI Hints)
- If $filter parsing fails: expect 400 BadRequest; see X-OData-Unimplemented header for hints.
- Enforce operator allowlist or regex limits via security options.
- For $expand mismatches, verify expandMap keys match `$expand` paths.
- Date conversions: enable dateCoercion.debug and supply onError to log row/field/value.

## Non-Goals / Differences
- Multipart/mixed $batch not implemented (JSON batch provided).
- Full OData function set is not guaranteed; many common functions are supported.
- Delta uses token store; change streams optional in future.
