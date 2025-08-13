import { MongoQueryBuilder, ODataParserV4Minimal, MinimalMetadataProvider, inferPropertiesFromJsonSchema, coerceDatesInDocuments } from 'odata-mongo-core';
import type { IODataExecutor, IODataParser, IODataSerializer } from 'odata-mongo-contracts';
import { DefaultExpressODataSerializer, writeODataError } from './serializer';

export type RegisterODataOptions = {
  parser?: IODataParser;
  executor?: IODataExecutor<any>;
  serializer?: IODataSerializer;
  metadata?: {
    namespace?: string;
    container?: string;
    entityTypeName?: string;
    key?: string;
    properties?: Array<{ name: string; type: string; nullable?: boolean }>;
    jsonSchema?: any;
  };
  expandMap?: Record<string, { from: string; localField: string; foreignField: string; as?: string; single?: boolean }>;
  limits?: { maxTop?: number; defaultPageSize?: number };
  security?: { allowedOperators?: string[]; maxRegexLength?: number };
};

export function registerOData(
  app: any,
  basePath: string,
  entitySet: string,
  collection: any,
  options: RegisterODataOptions = {}
): void {
  const parser: IODataParser = options.parser ?? new ODataParserV4Minimal();
  const executor: IODataExecutor<any> = options.executor ?? new MongoQueryBuilder();
  const serializer: IODataSerializer = options.serializer ?? new DefaultExpressODataSerializer();
  const metadataProvider = new MinimalMetadataProvider();

  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const routeBase = `${normalizedBase}/${entitySet}`;
  const deltaStore = new Map<string, number>();
  const nowMs = () => Date.now();

  app.get(routeBase, async (req: any, res: any) => {
    try {
      const query = parser.parse(req.originalUrl ?? req.url);
      const absoluteBase = `${req.protocol}://${req.get('host')}${req.originalUrl?.split('?')[0] ?? routeBase}`;
      // Delta init: return a deltaLink token without data
      if (req.query && (req.query.$delta === 'true' || req.query.$delta === true)) {
        const tokenId = Math.random().toString(36).slice(2);
        deltaStore.set(tokenId, nowMs());
        const token = `${req.protocol}://${req.get('host')}${normalizedBase}/${entitySet}?$deltatoken=${encodeURIComponent(tokenId)}`;
        res.set('OData-Version', '4.0');
        res.type('application/json');
        return res.status(200).json({ '@odata.deltaLink': token });
      }
      // Delta fetch: return items changed since token
      if (req.query && req.query.$deltatoken) {
        const tokenId = String(req.query.$deltatoken);
        const since = deltaStore.get(tokenId);
        if (since == null) {
          return writeODataError(res, 400, 'BadRequest', 'Invalid delta token');
        }
        const changed = await collection.find({ _updatedAtMs: { $gt: since } }).toArray();
        res.set('OData-Version', '4.0');
        res.type('application/json');
        return res.status(200).json({ value: changed });
      }
      const result = await executor.execute(query, collection, {
        expandMap: options.expandMap,
        limits: options.limits,
        baseUrl: absoluteBase,
        security: options.security,
        fieldMap: options.metadata?.key === 'id' ? { id: '_id' } : undefined,
        hooks: {
          onParsed: (_q) => {},
          onExecuted: (_i) => {},
          onError: (err) => {
            // Map BadRequest to 400
            if ((err as any)?.name === 'BadRequestError') {
              writeODataError(res, 400, 'BadRequest', (err as any).message || 'Bad Request');
              return;
            }
          }
        }
      });
      // If parser marked unimplemented functions, expose a header note (non-blocking)
      if (Array.isArray((query as any).unimplementedFunctions) && (query as any).unimplementedFunctions.length) {
        res.set('X-OData-Unimplemented', (query as any).unimplementedFunctions.join(','));
      }
      // Optional automatic date coercion
      const dateCoercion = (options as any).dateCoercion;
      const payload = dateCoercion
        ? coerceDatesInDocuments(result.value, {
            fields: dateCoercion.fields || [],
            formats: dateCoercion.formats,
            numericEpoch: dateCoercion.numericEpoch,
            debug: dateCoercion.debug,
            connectionString: (req as any).connectionString,
            database: (collection as any)?.db?.databaseName,
            collection: (collection as any)?.collectionName,
            onError: dateCoercion.onError,
          })
        : result.value;
      serializer.write({ value: payload, count: result.count, nextLink: result.nextLink }, res);
    } catch (err: any) {
      writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
    }
  });

  app.get(`${routeBase}/$count`, async (req: any, res: any) => {
    try {
      const query = parser.parse(req.originalUrl ?? req.url);
      // Force count regardless of incoming flag
      const result = await executor.execute({ ...query, count: true }, collection);
      res.status(200).type('text/plain').send(String(result.count ?? 0));
    } catch (err: any) {
      writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
    }
  });

  app.get(`${normalizedBase}/$metadata`, async (_req: any, res: any) => {
    try {
      const schema = {
        namespace: options.metadata?.namespace ?? 'Default',
        container: options.metadata?.container ?? 'Container',
        entitySet,
        entityType: {
          name: options.metadata?.entityTypeName ?? (entitySet.slice(0, -1) || 'Entity'),
          key: options.metadata?.key ?? 'id',
          properties: (
            options.metadata?.properties
            ?? inferPropertiesFromJsonSchema(options.metadata?.jsonSchema)
            ?? [ { name: options.metadata?.key ?? 'id', type: 'Edm.String', nullable: false } ]
          ) as any,
        },
      } as any;
      const xml = metadataProvider.buildMetadataXml(schema);
      res.set('OData-Version', '4.0');
      res.type('application/xml');
      res.status(200).send(xml);
    } catch (err: any) {
      writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
    }
  });

  // Simplified JSON $batch handler for GET-only requests to this entitySet
  app.post(`${normalizedBase}/$batch`, async (req: any, res: any) => {
    try {
      const body = req.body || {};
      const requests = Array.isArray(body.requests) ? body.requests : [];
      const responses: any[] = [];
      // Group by atomicGroup id to form changesets
      const groups: Record<string, any[]> = {};
      const singles: any[] = [];
      for (const r of requests) {
        const g = r.atomicGroup;
        if (g) {
          if (!groups[g]) groups[g] = [];
          groups[g].push(r);
        } else {
          singles.push(r);
        }
      }
      // Handle singles sequentially
      for (const r of singles) {
        try {
          const method = String(r.method || 'GET').toUpperCase();
          const url: string = r.url || '';
          if (!url.startsWith(`${normalizedBase}/${entitySet}`)) {
            responses.push({ status: 404, body: { error: { code: 'NotFound', message: 'Unknown URL' } } });
            continue;
          }
          if (method === 'GET') {
            const q = parser.parse(url);
            const result = await executor.execute(q, collection, {
              expandMap: options.expandMap,
              limits: options.limits,
              baseUrl: url.split('?')[0],
              security: options.security,
              fieldMap: options.metadata?.key === 'id' ? { id: '_id' } : undefined,
            });
            responses.push({ status: 200, body: { value: result.value, '@odata.count': result.count, '@odata.nextLink': result.nextLink } });
          } else if (method === 'POST') {
            const doc = r.body || {};
            (doc as any)._updatedAtMs = nowMs();
            await collection.insertOne(doc);
            responses.push({ status: 201, body: doc });
          } else if (method === 'PATCH') {
            const idMatch = /\/(\w+)$/.exec(url);
            const id = idMatch ? idMatch[1] : r.body?._id;
            await collection.updateOne({ _id: typeof id === 'string' ? castId(id) : id }, { $set: { ...(r.body || {}), _updatedAtMs: nowMs() } });
            responses.push({ status: 204, body: null });
          } else if (method === 'DELETE') {
            const idMatch = /\/(\w+)$/.exec(url);
            const id = idMatch ? idMatch[1] : undefined;
            if (id == null) throw new Error('Missing id for DELETE');
            await collection.deleteOne({ _id: typeof id === 'string' ? castId(id) : id });
            responses.push({ status: 204, body: null });
          } else {
            responses.push({ status: 400, body: { error: { code: 'BadRequest', message: `Unsupported method ${method}` } } });
          }
        } catch (e: any) {
          responses.push({ status: 500, body: { error: { code: 'ServerError', message: e?.message || 'Error' } } });
        }
      }
      // Handle changesets atomically (validation-first approach)
      for (const [groupId, ops] of Object.entries(groups)) {
        try {
          // Validate all
          for (const r of ops) {
            const method = String(r.method || '').toUpperCase();
            if (!['POST', 'PATCH', 'DELETE'].includes(method)) throw new Error('Invalid method in changeset');
            if (method === 'POST') {
              const doc = r.body || {};
              const exists = await collection.find({ _id: doc._id }).toArray();
              if (exists.length) throw new Error('Duplicate id');
            } else {
              const idMatch = /\/(\w+)$/.exec(r.url || '');
              const id = idMatch ? idMatch[1] : r.body?._id;
              const exists = await collection.find({ _id: typeof id === 'string' ? castId(id) : id }).toArray();
              if (!exists.length) throw new Error('Missing id');
            }
          }
          // Apply all
          for (const r of ops) {
            const method = String(r.method || '').toUpperCase();
            if (method === 'POST') {
              const doc = r.body || {};
              (doc as any)._updatedAtMs = nowMs();
              await collection.insertOne(doc);
            } else if (method === 'PATCH') {
              const idMatch = /\/(\w+)$/.exec(r.url || '');
              const id = idMatch ? idMatch[1] : r.body?._id;
              await collection.updateOne({ _id: typeof id === 'string' ? castId(id) : id }, { $set: { ...(r.body || {}), _updatedAtMs: nowMs() } });
            } else if (method === 'DELETE') {
              const idMatch = /\/(\w+)$/.exec(r.url || '');
              const id = idMatch ? idMatch[1] : r.body?._id;
              await collection.deleteOne({ _id: typeof id === 'string' ? castId(id) : id });
            }
          }
          responses.push({ status: 200, body: { atomicGroup: groupId, success: true } });
        } catch (e: any) {
          responses.push({ status: 400, body: { atomicGroup: groupId, error: { code: 'BadRequest', message: e?.message || 'Invalid changeset' } } });
        }
      }
      res.set('OData-Version', '4.0');
      res.type('application/json');
      return res.status(200).json({ responses });
    } catch (err: any) {
      writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
    }
  });

  // Minimal POST to support delta test writes
  app.post(routeBase, async (req: any, res: any) => {
    try {
      const doc = req.body || {};
      (doc as any)._updatedAtMs = nowMs();
      await collection.insertOne(doc);
      res.status(201).json(doc);
    } catch (err: any) {
      writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
    }
  });
  // Minimal PATCH for tests (update by _id)
  app.patch(`${routeBase}/:id`, async (req: any, res: any) => {
    try {
      const id = req.params.id;
      await collection.updateOne({ _id: Number(id) || id }, { $set: { ...(req.body || {}), _updatedAtMs: nowMs() } });
      res.status(204).send();
    } catch (err: any) {
      writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
    }
  });

  function castId(id: any): any { return id; }
}


