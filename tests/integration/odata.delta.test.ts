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
  const col = db.collection('orders_delta');
  await col.deleteMany({});
  await col.insertMany([
    { _id: 1, name: 'Alpha' }
  ]);
  app = express();
  app.use(express.json());
  registerOData(app as any, '/odata', 'Orders', col as any);
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
});

describe('Delta (simplified)', () => {
  it('returns delta token and next changes', async () => {
    if (!(client && server)) return;
    // initial delta
    let res = await request(server).get('/odata/Orders?$delta=true');
    expect(res.status).toBe(200);
    expect(res.body['@odata.deltaLink']).toBeDefined();
    const token = res.body['@odata.deltaLink'];
    // Supertest expects relative URLs; extract path for next request
    const url = new URL(token);
    const relative = url.pathname + url.search;
    // make a change
    await request(server).post('/odata/Orders').send({ _id: 2, name: 'Beta' }).set('content-type', 'application/json');
    // fetch delta
    res = await request(server).get(relative);
    expect(res.status).toBe(200);
    expect(res.body.value.some((x: any) => x._id === 2)).toBe(true);
  });
});


