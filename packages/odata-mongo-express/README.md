# odata-mongo-express

Express adapter for OData v4 -> MongoDB endpoints.

Quick start:
```ts
import express from 'express';
import { registerOData } from 'odata-mongo-express';

registerOData(app, '/odata', 'Orders', orders);
```
