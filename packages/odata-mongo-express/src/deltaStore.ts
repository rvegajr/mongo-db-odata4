import type { DeltaCheckpoint, IDeltaStore } from 'odata-mongo-contracts';

export class InMemoryDeltaStore implements IDeltaStore {
  private map = new Map<string, DeltaCheckpoint>();

  createToken(sinceMs: number, resumeToken?: any): DeltaCheckpoint {
    const tokenId = Math.random().toString(36).slice(2);
    const cp: DeltaCheckpoint = { tokenId, sinceMs, resumeToken };
    this.map.set(tokenId, cp);
    return cp;
  }

  getCheckpoint(tokenId: string): DeltaCheckpoint | undefined {
    return this.map.get(tokenId);
  }

  recordChange(_id: any, atMs: number): void {
    // Optionally track per-id; here we store only last seen time for all tokens
    // Tokens compare sinceMs to document _updatedAtMs
  }
}


