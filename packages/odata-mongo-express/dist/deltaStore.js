export class InMemoryDeltaStore {
    constructor() {
        this.map = new Map();
    }
    createToken(sinceMs, resumeToken) {
        const tokenId = Math.random().toString(36).slice(2);
        const cp = { tokenId, sinceMs, resumeToken };
        this.map.set(tokenId, cp);
        return cp;
    }
    getCheckpoint(tokenId) {
        return this.map.get(tokenId);
    }
    recordChange(_id, atMs) {
        // Optionally track per-id; here we store only last seen time for all tokens
        // Tokens compare sinceMs to document _updatedAtMs
    }
}
//# sourceMappingURL=deltaStore.js.map