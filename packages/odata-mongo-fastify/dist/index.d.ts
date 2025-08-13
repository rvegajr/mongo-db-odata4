import type { IODataExecutor, IODataParser, IODataSerializer } from 'odata-mongo-contracts';
export type RegisterFastifyODataOptions = {
    parser?: IODataParser;
    executor?: IODataExecutor<any>;
    serializer?: IODataSerializer;
    expandMap?: Record<string, {
        from: string;
        localField: string;
        foreignField: string;
        as?: string;
        single?: boolean;
    }>;
    limits?: {
        maxTop?: number;
        defaultPageSize?: number;
    };
};
export declare function registerODataFastify(app: any, basePath: string, entitySet: string, collection: any, options?: RegisterFastifyODataOptions): void;
//# sourceMappingURL=index.d.ts.map