import NodeCache from 'node-cache';

export interface CacheOptions {
  enabled?: boolean;
  ttl?: number; // Time to live in seconds
}

export class CacheManager {
  private static instance: CacheManager | null = null;
  private cache: NodeCache;
  private enabled: boolean;

  constructor(options?: CacheOptions) {
    this.enabled = options?.enabled ?? true;
    this.cache = new NodeCache({
      stdTTL: options?.ttl ?? 3600, // Default 1 hour to match tests
      checkperiod: 120, // Check for expired keys every 2 minutes
    });
  }

  static getInstance(options?: CacheOptions): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(options);
    }
    return CacheManager.instance;
  }

  async get<T = any>(key: string, params?: any): Promise<T | undefined> {
    if (!this.enabled) return undefined;
    
    const cacheKey = this.createKey(key, params);
    return this.cache.get<T>(cacheKey);
  }

  async set(key: string, params: any, value?: any, ttl?: number): Promise<boolean> {
    if (!this.enabled) return false;
    
    // Handle different call signatures
    let actualValue = value;
    let actualParams = params;
    let actualTtl = ttl;
    
    // If called with (key, value) signature
    if (value === undefined && ttl === undefined) {
      actualValue = params;
      actualParams = undefined;
    }
    
    const cacheKey = this.createKey(key, actualParams);
    if (actualTtl !== undefined) {
      return this.cache.set(cacheKey, actualValue, actualTtl);
    } else {
      return this.cache.set(cacheKey, actualValue);
    }
  }

  private createKey(key: string, params?: any): string {
    if (!params) return key;
    
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, k) => ({ ...acc, [k]: params[k] }), {});
    
    return `${key}:${JSON.stringify(sortedParams)}`;
  }

  delete(key: string): number {
    if (!this.enabled) return 0;
    return this.cache.del(key);
  }

  clear(): void {
    this.cache.flushAll();
  }

  has(key: string): boolean {
    if (!this.enabled) return false;
    return this.cache.has(key);
  }

  keys(): string[] {
    if (!this.enabled) return [];
    return this.cache.keys();
  }

  getTtl(key: string): number | undefined {
    if (!this.enabled) return undefined;
    return this.cache.getTtl(key);
  }

  setTtl(key: string, ttl: number): boolean {
    if (!this.enabled) return false;
    return this.cache.ttl(key, ttl);
  }

  close(): void {
    this.cache.close();
  }

  getStats() {
    return this.cache.getStats();
  }

  flush() {
    this.cache.flushAll();
  }
}