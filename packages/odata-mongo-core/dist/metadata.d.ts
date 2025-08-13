import { IMetadataProvider, ODataSchemaMetadata, JsonSchemaLike, ODataPropertyMetadata } from 'odata-mongo-contracts';
export declare class MinimalMetadataProvider implements IMetadataProvider {
    buildMetadataXml(schema: ODataSchemaMetadata): string;
}
export declare function inferPropertiesFromJsonSchema(schema: JsonSchemaLike | undefined): ODataPropertyMetadata[] | undefined;
//# sourceMappingURL=metadata.d.ts.map