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
  const col = db.collection('orders_paging');
  await col.deleteMany({});
  await col.insertMany(Array.from({ length: 15 }, (_, i) => ({ _id: i + 1, name: `N${i + 1}` })));
  app = express();
  registerOData(app as any, '/odata', 'Orders', col as any, { limits: { maxTop: 50, defaultPageSize: 5 } });
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
});

describe('Paging nextLink', () => {
  it('returns @odata.nextLink when page is full', async () => {
    if (!(client && server)) return;
    const res = await request(server).get('/odata/Orders?$top=5');
    expect(res.status).toBe(200);
    expect(res.body.value.length).toBe(5);
    expect(decodeURIComponent(res.body['@odata.nextLink'])).toContain('$skip=5');
  });
});


