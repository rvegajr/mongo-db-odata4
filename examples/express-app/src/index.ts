import express from 'express';
import { MongoClient } from 'mongodb';
import { registerOData } from 'odata-mongo-express';

async function main() {
  const app = express();
  const client = await MongoClient.connect(process.env.MONGO_URL || 'mongodb://localhost:27017');
  const db = client.db('demo');
  const orders = db.collection('orders_demo');
  await orders.insertOne({ name: 'Sample', price: 1 }).catch(() => {});
  registerOData(app as any, '/odata', 'Orders', orders as any);
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`http://localhost:${port}/odata/Orders`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


