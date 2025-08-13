import { MongoQueryBuilder, ODataParserV4Minimal, MinimalMetadataProvider, inferPropertiesFromJsonSchema, coerceDatesInDocuments } from 'odata-mongo-core';
import { DefaultExpressODataSerializer, writeODataError } from './serializer';
export function registerOData(app, basePath, entitySet, collection, options = {}) {
    const parser = options.parser ?? new ODataParserV4Minimal();
    const executor = options.executor ?? new MongoQueryBuilder();
    const serializer = options.serializer ?? new DefaultExpressODataSerializer();
    const metadataProvider = new MinimalMetadataProvider();
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const routeBase = `${normalizedBase}/${entitySet}`;
    const deltaStore = new Map();
    const nowMs = () => Date.now();
    app.get(routeBase, async (req, res) => {
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
                    onParsed: (_q) => { },
                    onExecuted: (_i) => { },
                    onError: (err) => {
                        // Map BadRequest to 400
                        if (err?.name === 'BadRequestError') {
                            writeODataError(res, 400, 'BadRequest', err.message || 'Bad Request');
                            return;
                        }
                    }
                }
            });
            // If parser marked unimplemented functions, expose a header note (non-blocking)
            if (Array.isArray(query.unimplementedFunctions) && query.unimplementedFunctions.length) {
                res.set('X-OData-Unimplemented', query.unimplementedFunctions.join(','));
            }
            // Optional automatic date coercion
            const dateCoercion = options.dateCoercion;
            const payload = dateCoercion
                ? coerceDatesInDocuments(result.value, {
                    fields: dateCoercion.fields || [],
                    formats: dateCoercion.formats,
                    numericEpoch: dateCoercion.numericEpoch,
                    debug: dateCoercion.debug,
                    connectionString: req.connectionString,
                    database: collection?.db?.databaseName,
                    collection: collection?.collectionName,
                    onError: dateCoercion.onError,
                })
                : result.value;
            serializer.write({ value: payload, count: result.count, nextLink: result.nextLink }, res);
        }
        catch (err) {
            writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
        }
    });
    app.get(`${routeBase}/$count`, async (req, res) => {
        try {
            const query = parser.parse(req.originalUrl ?? req.url);
            // Force count regardless of incoming flag
            const result = await executor.execute({ ...query, count: true }, collection);
            res.status(200).type('text/plain').send(String(result.count ?? 0));
        }
        catch (err) {
            writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
        }
    });
    app.get(`${normalizedBase}/$metadata`, async (_req, res) => {
        try {
            const schema = {
                namespace: options.metadata?.namespace ?? 'Default',
                container: options.metadata?.container ?? 'Container',
                entitySet,
                entityType: {
                    name: options.metadata?.entityTypeName ?? (entitySet.slice(0, -1) || 'Entity'),
                    key: options.metadata?.key ?? 'id',
                    properties: (options.metadata?.properties
                        ?? inferPropertiesFromJsonSchema(options.metadata?.jsonSchema)
                        ?? [{ name: options.metadata?.key ?? 'id', type: 'Edm.String', nullable: false }]),
                },
            };
            const xml = metadataProvider.buildMetadataXml(schema);
            res.set('OData-Version', '4.0');
            res.type('application/xml');
            res.status(200).send(xml);
        }
        catch (err) {
            writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
        }
    });
    // Simplified JSON $batch handler for GET-only requests to this entitySet
    app.post(`${normalizedBase}/$batch`, async (req, res) => {
        try {
            const body = req.body || {};
            const requests = Array.isArray(body.requests) ? body.requests : [];
            const responses = [];
            // Group by atomicGroup id to form changesets
            const groups = {};
            const singles = [];
            for (const r of requests) {
                const g = r.atomicGroup;
                if (g) {
                    if (!groups[g])
                        groups[g] = [];
                    groups[g].push(r);
                }
                else {
                    singles.push(r);
                }
            }
            // Handle singles sequentially
            for (const r of singles) {
                try {
                    const method = String(r.method || 'GET').toUpperCase();
                    const url = r.url || '';
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
                    }
                    else if (method === 'POST') {
                        const doc = r.body || {};
                        doc._updatedAtMs = nowMs();
                        await collection.insertOne(doc);
                        responses.push({ status: 201, body: doc });
                    }
                    else if (method === 'PATCH') {
                        const idMatch = /\/(\w+)$/.exec(url);
                        const id = idMatch ? idMatch[1] : r.body?._id;
                        await collection.updateOne({ _id: typeof id === 'string' ? castId(id) : id }, { $set: { ...(r.body || {}), _updatedAtMs: nowMs() } });
                        responses.push({ status: 204, body: null });
                    }
                    else if (method === 'DELETE') {
                        const idMatch = /\/(\w+)$/.exec(url);
                        const id = idMatch ? idMatch[1] : undefined;
                        if (id == null)
                            throw new Error('Missing id for DELETE');
                        await collection.deleteOne({ _id: typeof id === 'string' ? castId(id) : id });
                        responses.push({ status: 204, body: null });
                    }
                    else {
                        responses.push({ status: 400, body: { error: { code: 'BadRequest', message: `Unsupported method ${method}` } } });
                    }
                }
                catch (e) {
                    responses.push({ status: 500, body: { error: { code: 'ServerError', message: e?.message || 'Error' } } });
                }
            }
            // Handle changesets atomically (validation-first approach)
            for (const [groupId, ops] of Object.entries(groups)) {
                try {
                    // Validate all
                    for (const r of ops) {
                        const method = String(r.method || '').toUpperCase();
                        if (!['POST', 'PATCH', 'DELETE'].includes(method))
                            throw new Error('Invalid method in changeset');
                        if (method === 'POST') {
                            const doc = r.body || {};
                            const exists = await collection.find({ _id: doc._id }).toArray();
                            if (exists.length)
                                throw new Error('Duplicate id');
                        }
                        else {
                            const idMatch = /\/(\w+)$/.exec(r.url || '');
                            const id = idMatch ? idMatch[1] : r.body?._id;
                            const exists = await collection.find({ _id: typeof id === 'string' ? castId(id) : id }).toArray();
                            if (!exists.length)
                                throw new Error('Missing id');
                        }
                    }
                    // Apply all
                    for (const r of ops) {
                        const method = String(r.method || '').toUpperCase();
                        if (method === 'POST') {
                            const doc = r.body || {};
                            doc._updatedAtMs = nowMs();
                            await collection.insertOne(doc);
                        }
                        else if (method === 'PATCH') {
                            const idMatch = /\/(\w+)$/.exec(r.url || '');
                            const id = idMatch ? idMatch[1] : r.body?._id;
                            await collection.updateOne({ _id: typeof id === 'string' ? castId(id) : id }, { $set: { ...(r.body || {}), _updatedAtMs: nowMs() } });
                        }
                        else if (method === 'DELETE') {
                            const idMatch = /\/(\w+)$/.exec(r.url || '');
                            const id = idMatch ? idMatch[1] : r.body?._id;
                            await collection.deleteOne({ _id: typeof id === 'string' ? castId(id) : id });
                        }
                    }
                    responses.push({ status: 200, body: { atomicGroup: groupId, success: true } });
                }
                catch (e) {
                    responses.push({ status: 400, body: { atomicGroup: groupId, error: { code: 'BadRequest', message: e?.message || 'Invalid changeset' } } });
                }
            }
            res.set('OData-Version', '4.0');
            res.type('application/json');
            return res.status(200).json({ responses });
        }
        catch (err) {
            writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
        }
    });
    // Minimal POST to support delta test writes
    app.post(routeBase, async (req, res) => {
        try {
            const doc = req.body || {};
            doc._updatedAtMs = nowMs();
            await collection.insertOne(doc);
            res.status(201).json(doc);
        }
        catch (err) {
            writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
        }
    });
    // Minimal PATCH for tests (update by _id)
    app.patch(`${routeBase}/:id`, async (req, res) => {
        try {
            const id = req.params.id;
            await collection.updateOne({ _id: Number(id) || id }, { $set: { ...(req.body || {}), _updatedAtMs: nowMs() } });
            res.status(204).send();
        }
        catch (err) {
            writeODataError(res, 500, 'ServerError', err?.message ?? 'Unhandled error');
        }
    });
    function castId(id) { return id; }
}
//# sourceMappingURL=index.js.map