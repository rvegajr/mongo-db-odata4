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
  const col = db.collection('orders_apply');
  await col.deleteMany({});
  await col.insertMany([
    { _id: 1, category: 'A', total: 5 },
    { _id: 2, category: 'A', total: 15 },
    { _id: 3, category: 'B', total: 10 },
  ]);
  app = express();
  registerOData(app as any, '/odata', 'Orders', col as any);
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
});

describe('$apply (groupBy aggregate)', () => {
  it('groups and aggregates when $apply is specified', async () => {
    if (!(client && server)) return;
    const res = await request(server).get("/odata/Orders?$apply=groupby((category),aggregate(total with sum as totalSum))");
    expect(res.status).toBe(200);
    const a = res.body.value.find((x: any) => x.category === 'A');
    const b = res.body.value.find((x: any) => x.category === 'B');
    expect(a.totalSum).toBe(20);
    expect(b.totalSum).toBe(10);
  });
});


