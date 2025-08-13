import { IODataExecutor, IODataParser, ODataQuery, ODataResult, CollectionLike, ExecuteOptions, BadRequestError } from 'odata-mongo-contracts';
import { createFilter } from 'odata-v4-mongodb';
export { ODataParserV4Minimal } from './parser';
export { MinimalMetadataProvider, inferPropertiesFromJsonSchema } from './metadata';
export { coerceDatesInDocuments } from './dateCoercion';

export class ODataParserV4 implements IODataParser {
  parse(url: string): ODataQuery {
    throw new Error('ODataParserV4.parse not implemented yet');
  }
}

export class MongoQueryBuilder<T> implements IODataExecutor<T> {
  async execute(
    query: ODataQuery,
    collection: CollectionLike<T>,
    options?: ExecuteOptions
  ): Promise<ODataResult<T>> {
    const started = Date.now();
    options?.hooks?.onParsed?.(query);
    const filter: Record<string, any> = buildFilter(query.filter, options);
    const projection = buildProjection(query.select);
    const sort = buildSort(query.orderBy);
    const limit = sanitizeTop(query.top, options?.limits?.maxTop, options?.limits?.defaultPageSize);
    const skip = sanitizeSkip(query.skip);

    const hasExpand = Array.isArray(query.expand) && query.expand.length > 0;
    const hasSearch = typeof (query as any).search === 'string' && (query as any).search.length > 0 && options?.search?.fields?.length;
    const hasApply = !!(query as any).apply && Array.isArray((query as any).apply.groupByFields) && (query as any).apply.groupByFields.length > 0 && Array.isArray((query as any).apply.aggregates) && (query as any).apply.aggregates.length > 0;
    const hasCompute = !!(query as any).compute;
    let docs: any[];
    if ((hasExpand || hasSearch || hasApply || hasCompute) && typeof collection.aggregate === 'function') {
      const expandMap = (options as any)?.expandMap as Record<string, { from: string; localField: string; foreignField: string; as?: string; single?: boolean }> | undefined;
      const configured = (query.expand || [])
        .map(e => ({ key: e.path, cfg: expandMap?.[e.path] }))
        .filter(x => !!x.cfg) as Array<{ key: string; cfg: { from: string; localField: string; foreignField: string; as?: string; single?: boolean } }>;
      const pipeline: any[] = [];
      if (filter && Object.keys(filter).length) pipeline.push({ $match: filter });
      if (hasSearch) {
        const term = String((query as any).search);
        const ors = (options?.search?.fields || []).map(f => ({ [f]: { $regex: term, $options: 'i' } }));
        if (ors.length) pipeline.push({ $match: { $or: ors } });
      }
      if (hasApply) {
        const apply = (query as any).apply;
        const groupId: any = {};
        for (const f of apply.groupByFields) groupId[f] = `$${f}`;
        const groupStage: any = { _id: groupId };
        for (const agg of apply.aggregates) {
          const opMap: any = { sum: '$sum', avg: '$avg', min: '$min', max: '$max', count: '$sum' };
          const expr = agg.op === 'count' ? 1 : `$${agg.source}`;
          groupStage[agg.as] = { [opMap[agg.op]]: expr };
        }
        pipeline.push({ $group: groupStage });
        const project: any = {};
        for (const f of apply.groupByFields) project[f] = `$_id.${f}`;
        for (const agg of apply.aggregates) project[agg.as] = 1;
        pipeline.push({ $project: project });
      }
      if (hasCompute) {
        const c = (query as any).compute as { expr: string; as: string };
        const mul = /(\w+)\*(\d+(?:\.\d+)?)/.exec(c.expr);
        if (mul) {
          const field = mul[1];
          const factor = Number(mul[2]);
          pipeline.push({ $addFields: { [c.as]: { $multiply: [ `$${field}`, factor ] } } });
        }
        const cc = /^concat:(\w+):(.+)$/.exec(c.expr);
        if (cc) {
          const field = cc[1];
          const suffix = cc[2];
          pipeline.push({ $addFields: { [c.as]: { $concat: [ `$${field}`, suffix ] } } });
        }
        const tl = /^tolower:(\w+)$/.exec(c.expr);
        if (tl) {
          const field = tl[1];
          pipeline.push({ $addFields: { [c.as]: { $toLower: `$${field}` } } });
        }
        const tu = /^toupper:(\w+)$/.exec(c.expr);
        if (tu) {
          const field = tu[1];
          pipeline.push({ $addFields: { [c.as]: { $toUpper: `$${field}` } } });
        }
        const ss = /^substring:(\w+):(\d+):(\d+)$/.exec(c.expr);
        if (ss) {
          const field = ss[1];
          const start = Number(ss[2]);
          const len = Number(ss[3]);
          pipeline.push({ $addFields: { [c.as]: { $substrCP: [ `$${field}`, start, len ] } } });
        }
        const n1 = /^tolower:substring:(\w+):(\d+):(\d+)$/.exec(c.expr);
        if (n1) {
          const field = n1[1];
          const start = Number(n1[2]);
          const len = Number(n1[3]);
          pipeline.push({ $addFields: { __tmp_sub: { $substrCP: [ `$${field}`, start, len ] } } });
          pipeline.push({ $addFields: { [c.as]: { $toLower: '$__tmp_sub' } } });
          pipeline.push({ $unset: '__tmp_sub' });
        }
        const ln = /^length:(\w+)$/.exec(c.expr);
        if (ln) {
          const field = ln[1];
          pipeline.push({ $addFields: { [c.as]: { $strLenCP: `$${field}` } } });
        }
        const tr = /^trim:(\w+)$/.exec(c.expr);
        if (tr) {
          const field = tr[1];
          pipeline.push({ $addFields: { [c.as]: { $trim: { input: `$${field}` } } } });
        }
        const io = /^indexof:(\w+):(.+)$/.exec(c.expr);
        if (io) {
          const field = io[1];
          const sub = io[2];
          pipeline.push({ $addFields: { [c.as]: { $indexOfCP: [ `$${field}`, sub ] } } });
        }
        const rp = /^replace:(\w+):([^:]*):(.+)$/.exec(c.expr);
        if (rp) {
          const field = rp[1];
          const from = rp[2];
          const to = rp[3];
          pipeline.push({ $addFields: { [c.as]: { $replaceOne: { input: `$${field}`, find: from, replacement: to } } } });
        }
        const rpa = /^replaceall:(\w+):([^:]*):(.+)$/.exec(c.expr);
        if (rpa) {
          const field = rpa[1];
          const from = rpa[2];
          const to = rpa[3];
          pipeline.push({ $addFields: { [c.as]: { $replaceAll: { input: `$${field}`, find: from, replacement: to } } } });
        }
        const sw = /^startswith:(\w+):(.+)$/.exec(c.expr);
        if (sw) {
          const field = sw[1];
          const pre = sw[2];
          pipeline.push({ $addFields: { [c.as]: { $cond: [ { $eq: [ { $substrCP: [ `$${field}`, 0, pre.length ] }, pre ] }, true, false ] } } });
        }
        const ew = /^endswith:(\w+):(.+)$/.exec(c.expr);
        if (ew) {
          const field = ew[1];
          const suf = ew[2];
          pipeline.push({ $addFields: { [c.as]: { $cond: [ { $eq: [ { $substrCP: [ `$${field}`, { $subtract: [ { $strLenCP: `$${field}` }, suf.length ] }, suf.length ] }, suf ] }, true, false ] } } });
        }
        const yr = /^year:(\w+)$/.exec(c.expr);
        if (yr) {
          const field = yr[1];
          pipeline.push({ $addFields: { [c.as]: { $year: { $toDate: `$${field}` } } } });
        }
        const mo = /^month:(\w+)$/.exec(c.expr);
        if (mo) {
          const field = mo[1];
          pipeline.push({ $addFields: { [c.as]: { $month: { $toDate: `$${field}` } } } });
        }
        const dy = /^day:(\w+)$/.exec(c.expr);
        if (dy) {
          const field = dy[1];
          pipeline.push({ $addFields: { [c.as]: { $dayOfMonth: { $toDate: `$${field}` } } } });
        }
        const rd = /^round:(\w+)$/.exec(c.expr);
        if (rd) {
          const field = rd[1];
          pipeline.push({ $addFields: { [c.as]: { $round: [ `$${field}`, 0 ] } } });
        }
        const fl = /^floor:(\w+)$/.exec(c.expr);
        if (fl) {
          const field = fl[1];
          pipeline.push({ $addFields: { [c.as]: { $floor: `$${field}` } } });
        }
        const ce = /^ceiling:(\w+)$/.exec(c.expr);
        if (ce) {
          const field = ce[1];
          pipeline.push({ $addFields: { [c.as]: { $ceil: `$${field}` } } });
        }
      }
      if (sort) pipeline.push({ $sort: sort });
      if (typeof skip === 'number') pipeline.push({ $skip: skip });
      if (typeof limit === 'number') pipeline.push({ $limit: limit });
      if (configured.length > 0) {
        for (const { cfg } of configured) {
          const as = cfg.as || cfg.from;
          pipeline.push({
            $lookup: {
              from: cfg.from,
              localField: cfg.localField,
              foreignField: cfg.foreignField,
              as
            }
          });
          if (cfg.single) {
            pipeline.push({ $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } });
          }
        }
      }
      if (projection) pipeline.push({ $project: projection });
      docs = await (collection.aggregate!(pipeline) as any).toArray();
    } else {
      docs = await collection.find(filter, { projection, sort, limit, skip }).toArray();
    }
    let count: number | undefined = undefined;
    if (query.count === true) {
      count = await collection.countDocuments(filter);
    }
    const nextLink = buildNextLink(options, query, docs.length);
    const durationMs = Date.now() - started;
    options?.hooks?.onExecuted?.({ query, durationMs, resultCount: docs.length });
    return { value: docs as T[], count, nextLink };
  }
}

function buildFilter(filter: unknown, options?: ExecuteOptions): Record<string, any> {
  if (!filter) return {};
  if (typeof filter === 'string') {
    try {
      if (options?.security?.maxRegexLength && filter.length > options.security.maxRegexLength) {
        throw new BadRequestError('Filter too long');
      }
      const mongo = createFilter(filter) ?? {};
      if (options?.security?.allowedOperators && !isFilterAllowed(mongo, new Set(options.security.allowedOperators))) {
        throw new BadRequestError('Operator not allowed');
      }
      if (options?.fieldMap) applyFieldMap(mongo, options.fieldMap);
      return options?.filterTransform ? options.filterTransform(mongo) : mongo;
    } catch {
      options?.hooks?.onError?.(new BadRequestError('Invalid $filter'));
      throw new BadRequestError('Invalid $filter');
    }
  }
  if (typeof filter === 'object') return filter as Record<string, any>;
  return {};
}

function isFilterAllowed(node: any, allowed: Set<string>): boolean {
  if (node == null || typeof node !== 'object') return true;
  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) {
      if (!allowed.has(key)) return false;
    }
    const val = (node as any)[key];
    if (val && typeof val === 'object') {
      if (!isFilterAllowed(val, allowed)) return false;
    }
  }
  return true;
}

function applyFieldMap(node: any, fieldMap: Record<string, string>): void {
  if (!node || typeof node !== 'object') return;
  for (const key of Object.keys(node)) {
    const val = node[key];
    if (!key.startsWith('$') && fieldMap[key]) {
      node[fieldMap[key]] = val;
      delete node[key];
    }
    if (val && typeof val === 'object') applyFieldMap(val, fieldMap);
  }
}

function buildProjection(select?: string[]): Record<string, 0 | 1> | undefined {
  if (!select || select.length === 0) return undefined;
  const proj: Record<string, 0 | 1> = {};
  for (const f of select) proj[f] = 1;
  if (!select.includes('_id')) {
    proj._id = 0;
  }
  return proj;
}

function buildSort(orderBy?: Array<{ field: string; direction: 'asc' | 'desc' }>): Record<string, 1 | -1> | undefined {
  if (!orderBy || orderBy.length === 0) return undefined;
  const sort: Record<string, 1 | -1> = {};
  for (const ob of orderBy) sort[ob.field] = ob.direction === 'desc' ? -1 : 1;
  return sort;
}

function sanitizeTop(top?: number, maxTop?: number, defaultPageSize?: number): number | undefined {
  const hardMax = typeof maxTop === 'number' ? maxTop : 1000;
  const requested = typeof top === 'number' ? top : (typeof defaultPageSize === 'number' ? defaultPageSize : undefined);
  if (requested == null) return undefined;
  const n = Math.max(0, Math.min(Number(requested) || 0, hardMax));
  return n || undefined;
}

function sanitizeSkip(skip?: number): number | undefined {
  if (skip == null) return undefined;
  const n = Math.max(0, Number(skip) || 0);
  return n || undefined;
}

function buildNextLink(options: ExecuteOptions | undefined, query: ODataQuery, returned: number): string | undefined {
	if (!query.top) return undefined;
	if (returned < (query.top || 0)) return undefined;
	const base = options?.baseUrl || '';
	const parts: string[] = [];
	if (typeof query.top === 'number') parts.push(`$top=${encodeURIComponent(String(query.top))}`);
	const newSkip = (query.skip || 0) + (query.top || 0);
	parts.push(`$skip=${encodeURIComponent(String(newSkip))}`);
	if (query.select?.length) parts.push(`$select=${encodeURIComponent(query.select.join(','))}`);
	if (query.orderBy?.length) parts.push(`$orderby=${encodeURIComponent(query.orderBy.map(o => `${o.field} ${o.direction}`).join(','))}`);
	if (typeof query.count === 'boolean') parts.push(`$count=${encodeURIComponent(String(query.count))}`);
	if (typeof query.filter === 'string') parts.push(`$filter=${encodeURIComponent(query.filter)}`);
	if (query.expand?.length) parts.push(`$expand=${encodeURIComponent(query.expand.map(e => e.path).join(','))}`);
	const qs = parts.join('&');
	return base ? `${base}?${qs}` : `?${qs}`;
}


