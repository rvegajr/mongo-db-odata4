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
  const col = db.collection('orders');
  await col.deleteMany({});
  await col.insertMany([
    { _id: 1, name: 'Alpha', price: 5, category: 'A' },
    { _id: 2, name: 'Beta', price: 15, category: 'B' },
    { _id: 3, name: 'Gamma', price: 25, category: 'A' },
  ]);

  app = express();
  registerOData(app as any, '/odata', 'Orders', col as any);
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
});

describe('OData Express adapter (integration)', () => {
  it('skips when no Mongo is available', async () => {
    if (!(client && server)) {
      expect(true).toBe(true);
      return;
    }
  });

  it('supports $top and $skip', async () => {
    if (!(client && server)) return;
    const res = await request(server).get('/odata/Orders?$top=1&$skip=1');
    expect(res.status).toBe(200);
    expect(res.body.value.length).toBe(1);
  });

  it('supports $count', async () => {
    if (!(client && server)) return;
    const res = await request(server).get('/odata/Orders?$count=true');
    expect(res.status).toBe(200);
    expect(res.body['@odata.count']).toBe(3);
  });

  it('supports $orderby and $select', async () => {
    if (!(client && server)) return;
    const res = await request(server).get('/odata/Orders?$orderby=price desc&$select=name,price');
    expect(res.status).toBe(200);
    expect(res.body.value[0].price).toBe(25);
    expect(Object.keys(res.body.value[0]).sort()).toEqual(['name','price'].sort());
  });

  it('supports $filter via odata-v4-mongodb', async () => {
    if (!(client && server)) return;
    const res = await request(server).get("/odata/Orders?$filter=price%20gt%2010%20and%20startswith(name,'G')");
    expect(res.status).toBe(200);
    expect(res.body.value.length).toBe(1);
    expect(res.body.value[0].name).toBe('Gamma');
  });
});


