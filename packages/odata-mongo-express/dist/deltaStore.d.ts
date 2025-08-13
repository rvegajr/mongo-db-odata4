import type { DeltaCheckpoint, IDeltaStore } from 'odata-mongo-contracts';
export declare class InMemoryDeltaStore implements IDeltaStore {
    private map;
    createToken(sinceMs: number, resumeToken?: any): DeltaCheckpoint;
    getCheckpoint(tokenId: string): DeltaCheckpoint | undefined;
    recordChange(_id: any, atMs: number): void;
}
//# sourceMappingURL=deltaStore.d.ts.map