import { IODataParser, ODataOrderByField, ODataQuery } from 'odata-mongo-contracts';

export class ODataParserV4Minimal implements IODataParser {
  parse(url: string): ODataQuery {
    const qIndex = url.indexOf('?');
    const queryString = qIndex >= 0 ? url.slice(qIndex + 1) : '';
    const params = new URLSearchParams(queryString);
    const top = num(params.get('$top'));
    const skip = num(params.get('$skip'));
    const count = flag(params.get('$count'));
    const select = strList(params.get('$select'));
    const orderBy = parseOrderBy(params.get('$orderby'));
    const expand = parseExpand(params.get('$expand'));
    const searchTerm = params.get('$search') || undefined;
    const compute = parseCompute(params.get('$compute'));
    const apply = parseApply(params.get('$apply'));
    // Preserve raw $filter string for downstream conversion (odata-v4-mongodb)
    const rawFilter = params.get('$filter') || undefined;
    const unimplementedFunctions: string[] = [];
    // quick scan for common functions we don't fully implement yet
    const f = rawFilter || '';
    const markers = ['geo.', 'startswith(', 'endswith(', 'substring(', 'tolower(', 'toupper(', 'round(', 'floor(', 'ceiling('];
    for (const m of markers) if (f.includes(m)) unimplementedFunctions.push(m);
    return { top, skip, select, orderBy, count, expand, filter: rawFilter, search: searchTerm, apply, unimplementedFunctions, ...(compute ? { compute } : {}) } as any;
  }
}

function num(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function flag(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const s = v.toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return undefined;
}

function strList(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const arr = v.split(',').map(s => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

function parseOrderBy(v: string | null): ODataOrderByField[] | undefined {
  if (!v) return undefined;
  const items = v.split(',').map(s => s.trim()).filter(Boolean);
  const result: ODataOrderByField[] = [];
  for (const item of items) {
    const parts = item.split(/\s+/);
    const field = parts[0];
    const direction = (parts[1]?.toLowerCase() === 'desc') ? 'desc' : 'asc';
    if (field) result.push({ field, direction });
  }
  return result.length ? result : undefined;
}

function parseExpand(v: string | null): Array<{ path: string }> | undefined {
  if (!v) return undefined;
  const arr = v.split(',').map(s => s.trim()).filter(Boolean).map(path => ({ path }));
  return arr.length ? arr : undefined;
}

function parseApply(v: string | null): ODataQuery['apply'] | undefined {
  if (!v) return undefined;
  // minimal support: groupby((field),aggregate(prop with op as alias))
  const m = /groupby\(\(([^)]+)\),aggregate\(([^)]+)\)\)/i.exec(v);
  if (!m) return undefined;
  const groupByFields = m[1].split(',').map(s => s.trim()).filter(Boolean);
  const aggPart = m[2];
  const aggM = /(\w+)\s+with\s+(sum|avg|min|max|count)\s+as\s+(\w+)/i.exec(aggPart);
  if (!aggM) return undefined;
  const [, source, op, as] = aggM;
  return { groupByFields, aggregates: [{ source, op: op.toLowerCase() as any, as }] };
}

function parseCompute(v: string | null): { expr: string; as: string } | undefined {
  if (!v) return undefined;
  // minimal: <field> mul <num> as <alias>
  const m = /(\w+)\s+mul\s+(\d+(?:\.\d+)?)\s+as\s+(\w+)/i.exec(v);
  if (m) return { expr: `${m[1]}*${m[2]}`, as: m[3] };
  const c = /concat\((\w+),\'([^']*)\'\)\s+as\s+(\w+)/i.exec(v);
  if (c) return { expr: `concat:${c[1]}:${c[2]}`, as: c[3] };
  const tl = /tolower\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (tl) return { expr: `tolower:${tl[1]}`, as: tl[2] };
  const tu = /toupper\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (tu) return { expr: `toupper:${tu[1]}`, as: tu[2] };
  const ss = /substring\((\w+),(\d+),(\d+)\)\s+as\s+(\w+)/i.exec(v);
  if (ss) return { expr: `substring:${ss[1]}:${ss[2]}:${ss[3]}`, as: ss[4] };
  const rd = /round\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (rd) return { expr: `round:${rd[1]}`, as: rd[2] };
  const fl = /floor\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (fl) return { expr: `floor:${fl[1]}`, as: fl[2] };
  const ce = /ceiling\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (ce) return { expr: `ceiling:${ce[1]}`, as: ce[2] };
  const nest = /tolower\(substring\((\w+),(\d+),(\d+)\)\)\s+as\s+(\w+)/i.exec(v);
  if (nest) return { expr: `tolower:substring:${nest[1]}:${nest[2]}:${nest[3]}`, as: nest[4] };
  const len = /length\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (len) return { expr: `length:${len[1]}`, as: len[2] };
  const tr = /trim\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (tr) return { expr: `trim:${tr[1]}`, as: tr[2] };
  const io = /indexof\((\w+),\'([^']*)\'\)\s+as\s+(\w+)/i.exec(v);
  if (io) return { expr: `indexof:${io[1]}:${io[2]}`, as: io[3] };
  const rp = /replace\((\w+),\'([^']*)\',\'([^']*)\'\)\s+as\s+(\w+)/i.exec(v);
  if (rp) return { expr: `replace:${rp[1]}:${rp[2]}:${rp[3]}`, as: rp[4] };
  const rpa = /replaceall\((\w+),\'([^']*)\',\'([^']*)\'\)\s+as\s+(\w+)/i.exec(v);
  if (rpa) return { expr: `replaceall:${rpa[1]}:${rpa[2]}:${rpa[3]}`, as: rpa[4] };
  const sw = /startswith\((\w+),\'([^']*)\'\)\s+as\s+(\w+)/i.exec(v);
  if (sw) return { expr: `startswith:${sw[1]}:${sw[2]}`, as: sw[3] };
  const ew = /endswith\((\w+),\'([^']*)\'\)\s+as\s+(\w+)/i.exec(v);
  if (ew) return { expr: `endswith:${ew[1]}:${ew[2]}`, as: ew[3] };
  const yr = /year\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (yr) return { expr: `year:${yr[1]}` as any, as: yr[2] } as any;
  const mo = /month\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (mo) return { expr: `month:${mo[1]}` as any, as: mo[2] } as any;
  const dy = /day\((\w+)\)\s+as\s+(\w+)/i.exec(v);
  if (dy) return { expr: `day:${dy[1]}` as any, as: dy[2] } as any;
  return undefined;
}


