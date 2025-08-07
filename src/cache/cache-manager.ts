import NodeCache from 'node-cache';

export interface CacheOptions {
  enabled?: boolean;
  ttl?: number; // Time to live in seconds
}

export class CacheManager {
  private cache: NodeCache;
  private enabled: boolean;

  constructor(options?: CacheOptions) {
    this.enabled = options?.enabled ?? true;
    this.cache = new NodeCache({
      stdTTL: options?.ttl ?? 300, // Default 5 minutes
      checkperiod: 120, // Check for expired keys every 2 minutes
    });
  }

  async get(key: string, params?: any): Promise<any> {
    if (!this.enabled) return null;
    
    const cacheKey = this.createKey(key, params);
    return this.cache.get(cacheKey);
  }

  async set(key: string, params: any, value: any): Promise<void> {
    if (!this.enabled) return;
    
    const cacheKey = this.createKey(key, params);
    this.cache.set(cacheKey, value);
  }

  private createKey(key: string, params?: any): string {
    if (!params) return key;
    
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, k) => ({ ...acc, [k]: params[k] }), {});
    
    return `${key}:${JSON.stringify(sortedParams)}`;
  }

  getStats() {
    return this.cache.getStats();
  }

  flush() {
    this.cache.flushAll();
  }
}