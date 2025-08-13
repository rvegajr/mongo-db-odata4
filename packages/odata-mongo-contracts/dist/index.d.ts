export type ODataSortDirection = 'asc' | 'desc';
export interface ODataOrderByField {
    field: string;
    direction: ODataSortDirection;
}
export interface ODataQuery {
    top?: number;
    skip?: number;
    filter?: unknown;
    orderBy?: ODataOrderByField[];
    select?: string[];
    expand?: Array<{
        path: string;
    }>;
    count?: boolean;
    search?: string;
    apply?: {
        groupByFields?: string[];
        aggregates?: Array<{
            source: string;
            op: 'sum' | 'avg' | 'min' | 'max' | 'count';
            as: string;
        }>;
    };
    unimplementedFunctions?: string[];
}
export interface ODataResult<T> {
    value: T[];
    count?: number;
    nextLink?: string;
}
export interface IODataParser {
    parse(url: string): ODataQuery;
}
export type SortSpec = Record<string, 1 | -1>;
export interface FindOptionsLike<T = unknown> {
    projection?: Record<string, 0 | 1>;
    sort?: SortSpec | Array<[string, 1 | -1]> | Record<string, 'asc' | 'desc' | 1 | -1>;
    limit?: number;
    skip?: number;
}
export interface CursorLike<T> {
    toArray(): Promise<T[]>;
}
export interface CollectionLike<T> {
    find(filter: Record<string, any>, options?: FindOptionsLike<T>): CursorLike<T>;
    countDocuments(filter: Record<string, any>): Promise<number>;
    aggregate?(pipeline: any[]): CursorLike<T>;
}
export type ExpandMapEntry = {
    from: string;
    localField: string;
    foreignField: string;
    as?: string;
    single?: boolean;
};
export interface ExecuteOptions {
    expandMap?: Record<string, ExpandMapEntry>;
    limits?: {
        maxTop?: number;
        defaultPageSize?: number;
    };
    baseUrl?: string;
    security?: {
        allowedOperators?: string[];
        maxRegexLength?: number;
    };
    fieldMap?: Record<string, string>;
    hooks?: {
        onParsed?: (query: ODataQuery) => void;
        onExecuted?: (info: {
            query: ODataQuery;
            durationMs: number;
            resultCount: number;
        }) => void;
        onError?: (err: unknown) => void;
    };
    filterTransform?: (mongoFilter: Record<string, any>) => Record<string, any>;
    search?: {
        fields: string[];
    };
}
export interface DeltaCheckpoint {
    tokenId: string;
    sinceMs: number;
    resumeToken?: any;
}
export interface IDeltaStore {
    createToken(sinceMs: number, resumeToken?: any): Promise<DeltaCheckpoint> | DeltaCheckpoint;
    getCheckpoint(tokenId: string): Promise<DeltaCheckpoint | undefined> | DeltaCheckpoint | undefined;
    recordChange(id: any, atMs: number): Promise<void> | void;
}
export type ComputeFunctionMap = {
    concat?: (a: any, b: any) => any;
};
export interface DateCoercionOptions {
    fields: string[];
    formats?: string[];
    numericEpoch?: 'ms' | 's' | 'auto';
    debug?: boolean;
    connectionString?: string;
    onError?: (info: {
        database?: string;
        collection?: string;
        connectionString?: string;
        rowIndex: number;
        field: string;
        value: any;
        error: string;
    }) => void;
}
export declare class BadRequestError extends Error {
    constructor(message: string);
}
export interface IODataExecutor<T> {
    execute(query: ODataQuery, collection: CollectionLike<T>, options?: ExecuteOptions): Promise<ODataResult<T>>;
}
export interface IODataSerializer {
    write(result: ODataResult<unknown>, res: unknown, options?: Record<string, unknown>): void;
}
export type ODataEdmType = 'Edm.String' | 'Edm.Boolean' | 'Edm.Int32' | 'Edm.Int64' | 'Edm.Double' | 'Edm.Decimal' | 'Edm.DateTimeOffset' | 'Edm.Guid' | 'Edm.Binary';
export interface ODataPropertyMetadata {
    name: string;
    type: ODataEdmType;
    nullable?: boolean;
}
export interface ODataEntityTypeMetadata {
    name: string;
    key: string;
    properties: ODataPropertyMetadata[];
}
export interface ODataSchemaMetadata {
    namespace: string;
    container: string;
    entitySet: string;
    entityType: ODataEntityTypeMetadata;
}
export interface IMetadataProvider {
    buildMetadataXml(schema: ODataSchemaMetadata): string;
}
export type JsonSchemaLike = {
    properties?: Record<string, {
        type?: string | string[];
        format?: string;
    }>;
    required?: string[];
};
//# sourceMappingURL=index.d.ts.map