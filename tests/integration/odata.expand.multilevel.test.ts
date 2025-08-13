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
  const orders = db.collection('orders_exp2');
  const customers = db.collection('customers_exp2');
  const addresses = db.collection('addresses_exp2');

  await orders.deleteMany({});
  await customers.deleteMany({});
  await addresses.deleteMany({});

  await addresses.insertMany([
    { _id: 1000, city: 'Austin' },
    { _id: 2000, city: 'Boston' },
  ]);
  await customers.insertMany([
    { _id: 100, name: 'Alice', addressId: 1000 },
    { _id: 200, name: 'Bob', addressId: 2000 },
  ]);
  await orders.insertMany([
    { _id: 1, customerId: 100, total: 5 },
    { _id: 2, customerId: 200, total: 15 },
  ]);

  app = express();
  registerOData(app as any, '/odata', 'Orders', orders as any, {
    expandMap: {
      customer: { from: 'customers_exp2', localField: 'customerId', foreignField: '_id', as: 'customer', single: true },
      customerAddress: { from: 'addresses_exp2', localField: 'customer.addressId', foreignField: '_id', as: 'customerAddress', single: true },
    }
  });
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
});

describe('$expand multi-level', () => {
  it('resolves second-level expand using dot path localField', async () => {
    if (!(client && server)) return;
    const res = await request(server).get('/odata/Orders?$expand=customer,customerAddress&$orderby=_id asc');
    expect(res.status).toBe(200);
    const row = res.body.value.find((x: any) => x._id === 1);
    expect(row.customer.name).toBe('Alice');
    expect(row.customerAddress.city).toBe('Austin');
  });
});


