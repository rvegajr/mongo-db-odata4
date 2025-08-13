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
  const col = db.collection('orders_batch');
  await col.deleteMany({});
  await col.insertMany([
    { _id: 1, name: 'Alpha' },
    { _id: 2, name: 'Beta' }
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

describe('$batch (JSON simplified)', () => {
  it('executes multiple GET requests and returns array of responses', async () => {
    if (!(client && server)) return;
    const res = await request(server)
      .post('/odata/$batch')
      .send({ requests: [
        { method: 'GET', url: '/odata/Orders?$top=1' },
        { method: 'GET', url: '/odata/Orders?$count=true' }
      ]})
      .set('content-type', 'application/json');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.responses)).toBe(true);
    expect(res.body.responses[0].status).toBe(200);
    expect(res.body.responses[1].status).toBe(200);
  });
});


