import Fastify from 'fastify';
import { MongoClient } from 'mongodb';
import { registerODataFastify } from 'odata-mongo-fastify';

async function main() {
  const app = Fastify();
  const client = await MongoClient.connect(process.env.MONGO_URL || 'mongodb://localhost:27017');
  const db = client.db('demo');
  const orders = db.collection('orders_demo');
  await orders.insertOne({ name: 'Sample', price: 1 }).catch(() => {});
  registerODataFastify(app as any, '/odata', 'Orders', orders as any);
  const port = Number(process.env.PORT || 3001);
  await app.listen({ port });
  console.log(`http://localhost:${port}/odata/Orders`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


