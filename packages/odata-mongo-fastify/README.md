# odata-mongo-fastify

Fastify adapter for OData v4 -> MongoDB endpoints.

Quick start:
```ts
import Fastify from 'fastify';
import { registerODataFastify } from 'odata-mongo-fastify';

const app = Fastify();
registerODataFastify(app, '/odata', 'Orders', orders);
```
