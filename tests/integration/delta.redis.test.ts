import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MongoClient } from 'mongodb';
import { registerOData } from 'odata-mongo-express';
import Redis from 'ioredis-mock';

class RedisDeltaStore {
  constructor(private redis: any) {}
  async createToken(sinceMs: number, resumeToken?: any) {
    const tokenId = Math.random().toString(36).slice(2);
    await this.redis.set(`delta:${tokenId}`, JSON.stringify({ sinceMs, resumeToken }));
    return { tokenId, sinceMs, resumeToken };
  }
  async getCheckpoint(tokenId: string) {
    const v = await this.redis.get(`delta:${tokenId}`);
    return v ? { tokenId, ...(JSON.parse(v)) } : undefined;
  }
  async recordChange(_id: any, atMs: number) { /* no-op for test */ }
}

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = 'odata_test';

let client: MongoClient;
let app: express.Express;
let server: any;
let redis: any;

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
  redis = new Redis();
  client = await MongoClient.connect(MONGO_URL);
  const db = client.db(DB_NAME);
  const col = db.collection('orders_delta_redis');
  await col.deleteMany({});
  await col.insertOne({ _id: 1, name: 'Alpha' });
  app = express();
  app.use(express.json());
  registerOData(app as any, '/odata', 'Orders', col as any, { deltaStore: new RedisDeltaStore(redis) } as any);
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
  if (redis) await redis.quit();
});

describe('Delta with Redis store', () => {
  it('supports token persistence across requests', async () => {
    if (!(client && server)) return;
    const res1 = await request(server).get('/odata/Orders?$delta=true');
    expect(res1.status).toBe(200);
    const token = res1.body['@odata.deltaLink'];
    const url = new URL(token);
    const relative = url.pathname + url.search;
    await request(server).post('/odata/Orders').send({ _id: 2, name: 'Beta' }).set('content-type', 'application/json');
    const res2 = await request(server).get(relative);
    expect(res2.status).toBe(200);
    expect(res2.body.value.some((x: any) => x._id === 2)).toBe(true);
  });
});


