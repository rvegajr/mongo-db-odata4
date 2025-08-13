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
let computeCol: any;

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
  computeCol = db.collection('orders_compute');
  await computeCol.deleteMany({});
  await computeCol.insertMany([
    { _id: 1, name: 'Alpha', price: 10 },
    { _id: 2, name: 'Beta', price: 15 }
  ]);
  app = express();
  registerOData(app as any, '/odata', 'Orders', computeCol as any);
  server = app.listen(0);
});

afterAll(async () => {
  if (server) server.close();
  if (client) await client.close();
});

describe('$compute', () => {
  it('computes arithmetic fields', async () => {
    if (!(client && server)) return;
    const res = await request(server).get("/odata/Orders?$compute=price%20mul%202%20as%20doublePrice&$select=name,doublePrice&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    expect(res.body.value[0].doublePrice).toBe(20);
  });

  it('supports concat compute', async () => {
    if (!(client && server)) return;
    const res = await request(server).get("/odata/Orders?$compute=concat(name,'!')%20as%20shout&$select=shout&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    expect(res.body.value[0].shout).toBe('Alpha!');
  });

  it('supports tolower/toupper compute', async () => {
    if (!(client && server)) return;
    let res = await request(server).get("/odata/Orders?$compute=tolower(name)%20as%20ln&$select=ln&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    expect(res.body.value[0].ln).toBe('alpha');
    res = await request(server).get("/odata/Orders?$compute=toupper(name)%20as%20un&$select=un&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    expect(res.body.value[0].un).toBe('ALPHA');
  });

  it('supports substring compute', async () => {
    if (!(client && server)) return;
    const res = await request(server).get("/odata/Orders?$compute=substring(name,0,3)%20as%20pre&$select=pre&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    expect(res.body.value[0].pre).toBe('Alp');
  });

  it('supports round/floor/ceiling compute', async () => {
    if (!(client && server)) return;
    let res = await request(server).get("/odata/Orders?$compute=round(price)%20as%20rp&$select=name,rp");
    expect(res.status).toBe(200);
    const a1 = res.body.value.find((x: any) => x.name === 'Alpha');
    expect(a1.rp).toBe(10);
    res = await request(server).get("/odata/Orders?$compute=floor(price)%20as%20fp&$select=name,fp");
    expect(res.status).toBe(200);
    const a2 = res.body.value.find((x: any) => x.name === 'Alpha');
    expect(a2.fp).toBe(10);
    res = await request(server).get("/odata/Orders?$compute=ceiling(price)%20as%20cp&$select=name,cp");
    expect(res.status).toBe(200);
    const a3 = res.body.value.find((x: any) => x.name === 'Alpha');
    expect(a3.cp).toBe(10);
  });

  it('supports nested compute tolower(substring(...))', async () => {
    if (!(client && server)) return;
    const res = await request(server).get("/odata/Orders?$compute=tolower(substring(name,0,3))%20as%20lowpre&$select=lowpre&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    expect(res.body.value[0].lowpre).toBe('alp');
  });

  it('supports string length, trim and indexof', async () => {
    if (!(client && server)) return;
    let res = await request(server).get("/odata/Orders?$compute=length(name)%20as%20nlen&$select=name,nlen&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    const a = res.body.value.find((x: any) => x.name === 'Alpha');
    expect(a.nlen).toBe(5);
    // trim(name) is a no-op for our seed but should return string
    res = await request(server).get("/odata/Orders?$compute=trim(name)%20as%20tname&$select=tname&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    expect(typeof res.body.value[0].tname).toBe('string');
    res = await request(server).get("/odata/Orders?$compute=indexof(name,'pha')%20as%20idx&$select=name,idx");
    expect(res.status).toBe(200);
    const a2 = res.body.value.find((x: any) => x.name === 'Alpha');
    expect(a2.idx).toBe(2);
  });

  it('supports date part functions year/month/day', async () => {
    if (!(client && server)) return;
    // seed a dated order directly to ensure native Date type
    await computeCol.insertOne({ _id: 500, name: 'Dated', orderDate: new Date('2020-05-15T12:34:56Z') });
    let res = await request(server).get("/odata/Orders?$compute=year(orderDate)%20as%20yr&$select=name,yr");
    expect(res.status).toBe(200);
    const d1 = res.body.value.find((x: any) => x.name === 'Dated');
    expect(d1.yr).toBe(2020);
    res = await request(server).get("/odata/Orders?$compute=month(orderDate)%20as%20mo&$select=name,mo");
    expect(res.status).toBe(200);
    const d2 = res.body.value.find((x: any) => x.name === 'Dated');
    expect(d2.mo).toBe(5);
    res = await request(server).get("/odata/Orders?$compute=day(orderDate)%20as%20dy&$select=name,dy");
    expect(res.status).toBe(200);
    const d3 = res.body.value.find((x: any) => x.name === 'Dated');
    expect(d3.dy).toBe(15);
  });

  it('supports replace compute', async () => {
    if (!(client && server)) return;
    const res = await request(server).get("/odata/Orders?$compute=replace(name,'ph','f')%20as%20rname&$select=name,rname&$orderby=_id%20asc");
    expect(res.status).toBe(200);
    const a = res.body.value.find((x: any) => x.name === 'Alpha');
    expect(a.rname).toBe('Alfa');
  });
});


