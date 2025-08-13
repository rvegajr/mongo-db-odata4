import type { IODataSerializer, ODataResult } from 'odata-mongo-contracts';

export class DefaultExpressODataSerializer implements IODataSerializer {
  write(result: ODataResult<unknown>, res: any): void {
    res.set('OData-Version', '4.0');
    res.type('application/json');
    const body: any = { value: result.value };
    if (typeof result.count === 'number') body['@odata.count'] = result.count;
    if (result.nextLink) body['@odata.nextLink'] = result.nextLink;
    res.status(200).json(body);
  }
}

export function writeODataError(res: any, status: number, code: string, message: string): void {
  res.set('OData-Version', '4.0');
  res.type('application/json');
  res.status(status).json({
    error: {
      code,
      message
    }
  });
}


