import { MongoQueryBuilder, ODataParserV4Minimal } from 'odata-mongo-core';
export function registerODataFastify(app, basePath, entitySet, collection, options = {}) {
    const parser = options.parser ?? new ODataParserV4Minimal();
    const executor = options.executor ?? new MongoQueryBuilder();
    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const routeBase = `${normalizedBase}/${entitySet}`;
    app.get(routeBase, async (req, res) => {
        const query = parser.parse(req.url ?? req.raw.url ?? '');
        const absBase = `${req.protocol}://${req.headers.host}${req.url?.split('?')[0] ?? routeBase}`;
        const result = await executor.execute(query, collection, { expandMap: options.expandMap, limits: options.limits, baseUrl: absBase });
        res.code(200).send({ value: result.value, '@odata.count': result.count, '@odata.nextLink': result.nextLink });
    });
}
//# sourceMappingURL=index.js.map