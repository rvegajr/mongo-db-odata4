import { IODataExecutor, IODataParser, ODataQuery, ODataResult, CollectionLike, ExecuteOptions } from 'odata-mongo-contracts';
export { ODataParserV4Minimal } from './parser';
export { MinimalMetadataProvider, inferPropertiesFromJsonSchema } from './metadata';
export { coerceDatesInDocuments } from './dateCoercion';
export declare class ODataParserV4 implements IODataParser {
    parse(url: string): ODataQuery;
}
export declare class MongoQueryBuilder<T> implements IODataExecutor<T> {
    execute(query: ODataQuery, collection: CollectionLike<T>, options?: ExecuteOptions): Promise<ODataResult<T>>;
}
//# sourceMappingURL=index.d.ts.map