export class DefaultExpressODataSerializer {
    write(result, res) {
        res.set('OData-Version', '4.0');
        res.type('application/json');
        const body = { value: result.value };
        if (typeof result.count === 'number')
            body['@odata.count'] = result.count;
        if (result.nextLink)
            body['@odata.nextLink'] = result.nextLink;
        res.status(200).json(body);
    }
}
export function writeODataError(res, status, code, message) {
    res.set('OData-Version', '4.0');
    res.type('application/json');
    res.status(status).json({
        error: {
            code,
            message
        }
    });
}
//# sourceMappingURL=serializer.js.map