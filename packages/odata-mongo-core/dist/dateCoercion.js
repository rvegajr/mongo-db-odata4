const DEFAULT_FORMATS = [
    'ISO', // Date.parse
    'YYYY-MM-DD',
    'YYYY/MM/DD',
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'YYYY-MM-DDTHH:mm:ssZ',
    'YYYY-MM-DDTHH:mm:ss.SSSZ',
    'DD-MMM-YYYY',
    'MMM DD, YYYY',
    'DD.MM.YYYY',
];
function tryParseWithKnownFormats(s, formats) {
    // ISO and RFC3339: rely on Date.parse
    if (formats.includes('ISO')) {
        const t = Date.parse(s);
        if (!Number.isNaN(t))
            return new Date(t);
    }
    // Very lightweight parsers for common forms
    for (const f of formats) {
        if (f === 'YYYY-MM-DD' || f === 'YYYY/MM/DD') {
            const m = /^(\d{4})[-\/](\d{2})[-\/](\d{2})$/.exec(s);
            if (m) {
                const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
                if (!Number.isNaN(d.getTime()))
                    return d;
            }
        }
        if (f === 'MM/DD/YYYY') {
            const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
            if (m) {
                const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
                if (!Number.isNaN(d.getTime()))
                    return d;
            }
        }
        if (f === 'DD/MM/YYYY') {
            const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
            if (m) {
                const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
                if (!Number.isNaN(d.getTime()))
                    return d;
            }
        }
        if (f === 'DD-MMM-YYYY') {
            const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
            if (m) {
                const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
                const mi = months[m[2]];
                if (mi != null) {
                    const d = new Date(Number(m[3]), mi, Number(m[1]));
                    if (!Number.isNaN(d.getTime()))
                        return d;
                }
            }
        }
        if (f === 'MMM DD, YYYY') {
            const m = /^([A-Za-z]{3})\s(\d{2}),\s(\d{4})$/.exec(s);
            if (m) {
                const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
                const mi = months[m[1]];
                if (mi != null) {
                    const d = new Date(Number(m[3]), mi, Number(m[2]));
                    if (!Number.isNaN(d.getTime()))
                        return d;
                }
            }
        }
        if (f === 'DD.MM.YYYY') {
            const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
            if (m) {
                const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
                if (!Number.isNaN(d.getTime()))
                    return d;
            }
        }
    }
    return null;
}
export function coerceDatesInDocuments(docs, options) {
    const fields = new Set(options.fields || []);
    const formats = options.formats && options.formats.length ? options.formats : DEFAULT_FORMATS;
    const epochMode = options.numericEpoch || 'auto';
    const debug = !!options.debug;
    const { database, collection } = options;
    const out = [];
    for (let i = 0; i < docs.length; i++) {
        const doc = { ...docs[i] };
        for (const f of fields) {
            const v = doc[f];
            if (v == null)
                continue;
            try {
                let parsed = null;
                if (v instanceof Date) {
                    parsed = v;
                }
                else if (typeof v === 'number') {
                    if (epochMode === 'ms' || (epochMode === 'auto' && v > 1e10))
                        parsed = new Date(v);
                    else if (epochMode === 's' || (epochMode === 'auto' && v <= 1e10))
                        parsed = new Date(v * 1000);
                }
                else if (typeof v === 'string') {
                    parsed = tryParseWithKnownFormats(v, formats);
                }
                if (parsed && !Number.isNaN(parsed.getTime()))
                    doc[f] = parsed;
            }
            catch (err) {
                if (options.onError) {
                    options.onError({
                        database,
                        collection,
                        connectionString: options.connectionString,
                        rowIndex: i,
                        field: f,
                        value: doc[f],
                        error: err?.message || String(err)
                    });
                }
            }
        }
        out.push(doc);
    }
    if (debug) {
        // eslint-disable-next-line no-console
        console.debug('[dateCoercion] coerced fields', Array.from(fields));
    }
    return out;
}
//# sourceMappingURL=dateCoercion.js.map