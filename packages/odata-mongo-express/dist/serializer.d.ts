import type { IODataSerializer, ODataResult } from 'odata-mongo-contracts';
export declare class DefaultExpressODataSerializer implements IODataSerializer {
    write(result: ODataResult<unknown>, res: any): void;
}
export declare function writeODataError(res: any, status: number, code: string, message: string): void;
//# sourceMappingURL=serializer.d.ts.map