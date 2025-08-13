import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MongoClient } from 'mongodb';
import { registerOData } from 'odata-mongo-express';

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = 'odata_test';

let client: MongoClient;
let app: express.Express;
let server: any;

const skipIfNoMongo = async (): Promise<boolean> => {
  try {
    const c = await MongoClient.connect(MONGO_URL, { serverSelectionTimeoutMS: 1000 });
    await c.close();
    return false;
  } catch {
    return true;
  }
};

beforeAll(async () => {
  if (await skipIfNoMongo()) return;
  client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);
  const col = db.collection('orders_meta');
  await col.deleteMany({});
  await col.insertOne({ _id: 1, name: 'Alpha' });
  app = express();
  registerOData(app as any, '/odata', 'Orders', col as any, {
    metadata: { namespace: 'Demo', container: 'Container', entityTypeName: 'Order', key: 'id' }
  });
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
});

describe('$metadata endpoint', () => {
  it('returns OData CSDL XML', async () => {
    if (!(client && server)) return;
    const res = await request(server).get('/odata/$metadata');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.text).toContain('<edmx:Edmx');
    expect(res.text).toContain('<Schema Namespace="Demo"');
    expect(res.text).toContain('<EntitySet Name="Orders"');
  });
});


