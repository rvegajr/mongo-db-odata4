// Minimal, static XML generator for OData v4 CSDL, single entity set
export class MinimalMetadataProvider {
    buildMetadataXml(schema) {
        const ns = schema.namespace;
        const container = schema.container;
        const set = schema.entitySet;
        const et = schema.entityType;
        const propsXml = et.properties
            .map(p => `      <Property Name="${p.name}" Type="${p.type}"${p.nullable === false ? ' Nullable="false"' : ''} />`)
            .join('\n');
        return `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="${ns}" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="${et.name}">
        <Key>
          <PropertyRef Name="${et.key}" />
        </Key>
${propsXml}
      </EntityType>
      <EntityContainer Name="${container}">
        <EntitySet Name="${set}" EntityType="${ns}.${et.name}" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;
    }
}
export function inferPropertiesFromJsonSchema(schema) {
    if (!schema || !schema.properties)
        return undefined;
    const required = new Set(schema.required ?? []);
    const props = [];
    for (const [name, s] of Object.entries(schema.properties)) {
        const edmType = jsonTypeToEdm(s.type, s.format);
        if (!edmType)
            continue;
        props.push({ name, type: edmType, nullable: !required.has(name) });
    }
    return props.length ? props : undefined;
}
function jsonTypeToEdm(type, format) {
    const t = Array.isArray(type) ? type[0] : type;
    switch (t) {
        case 'string':
            if (format === 'date-time')
                return 'Edm.DateTimeOffset';
            if (format === 'uuid')
                return 'Edm.Guid';
            return 'Edm.String';
        case 'integer':
            return 'Edm.Int32';
        case 'number':
            return 'Edm.Double';
        case 'boolean':
            return 'Edm.Boolean';
        default:
            return undefined;
    }
}
//# sourceMappingURL=metadata.js.map