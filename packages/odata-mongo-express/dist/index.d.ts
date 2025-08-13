import type { IODataExecutor, IODataParser, IODataSerializer } from 'odata-mongo-contracts';
export type RegisterODataOptions = {
    parser?: IODataParser;
    executor?: IODataExecutor<any>;
    serializer?: IODataSerializer;
    metadata?: {
        namespace?: string;
        container?: string;
        entityTypeName?: string;
        key?: string;
        properties?: Array<{
            name: string;
            type: string;
            nullable?: boolean;
        }>;
        jsonSchema?: any;
    };
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
    security?: {
        allowedOperators?: string[];
        maxRegexLength?: number;
    };
};
export declare function registerOData(app: any, basePath: string, entitySet: string, collection: any, options?: RegisterODataOptions): void;
//# sourceMappingURL=index.d.ts.map