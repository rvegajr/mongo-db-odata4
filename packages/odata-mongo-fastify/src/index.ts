import { MongoQueryBuilder, ODataParserV4Minimal } from 'odata-mongo-core';
import type { IODataExecutor, IODataParser, IODataSerializer } from 'odata-mongo-contracts';

export type RegisterFastifyODataOptions = {
  parser?: IODataParser;
  executor?: IODataExecutor<any>;
  serializer?: IODataSerializer;
  expandMap?: Record<string, { from: string; localField: string; foreignField: string; as?: string; single?: boolean }>;
  limits?: { maxTop?: number; defaultPageSize?: number };
};

export function registerODataFastify(
  app: any,
  basePath: string,
  entitySet: string,
  collection: any,
  options: RegisterFastifyODataOptions = {}
): void {
  const parser: IODataParser = options.parser ?? new ODataParserV4Minimal();
  const executor: IODataExecutor<any> = options.executor ?? new MongoQueryBuilder();

  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const routeBase = `${normalizedBase}/${entitySet}`;

  app.get(routeBase, async (req: any, res: any) => {
    const query = parser.parse(req.url ?? req.raw.url ?? '');
    const absBase = `${req.protocol}://${req.headers.host}${req.url?.split('?')[0] ?? routeBase}`;
    const result = await executor.execute(query, collection, { expandMap: options.expandMap, limits: options.limits, baseUrl: absBase });
    res.code(200).send({ value: result.value, '@odata.count': result.count, '@odata.nextLink': result.nextLink });
  });
}


