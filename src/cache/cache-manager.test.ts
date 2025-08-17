import NodeCache from 'node-cache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheManager } from './cache-manager'

vi.mock('node-cache')

describe('CacheManager', () => {
  let cacheManager: CacheManager
  let mockCache: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      flushAll: vi.fn(),
      has: vi.fn(),
      keys: vi.fn(),
      getTtl: vi.fn(),
      ttl: vi.fn(),
      close: vi.fn(),
      getStats: vi.fn(),
    }

    vi.mocked(NodeCache).mockImplementation(() => mockCache)
    cacheManager = CacheManager.getInstance()
  })

  afterEach(() => {
    // Reset singleton
    ;(CacheManager as any).instance = null
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CacheManager.getInstance()
      const instance2 = CacheManager.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should create cache with default TTL', () => {
      CacheManager.getInstance()
      expect(NodeCache).toHaveBeenCalledWith({ stdTTL: 3600, checkperiod: 120 })
    })
  })

  describe('get', () => {
    it('should retrieve value from cache', () => {
      const testValue = { data: 'test' }
      mockCache.get.mockReturnValue(testValue)

      const result = cacheManager.get('test-key')

      expect(result).toEqual(testValue)
      expect(mockCache.get).toHaveBeenCalledWith('test-key')
    })

    it('should return undefined for missing key', () => {
      mockCache.get.mockReturnValue(undefined)

      const result = cacheManager.get('missing-key')

      expect(result).toBeUndefined()
      expect(mockCache.get).toHaveBeenCalledWith('missing-key')
    })

    it('should handle typed retrieval', () => {
      interface TestType {
        id: string
        name: string
      }

      const testValue: TestType = { id: '1', name: 'Test' }
      mockCache.get.mockReturnValue(testValue)

      const result = cacheManager.get<TestType>('test-key')

      expect(result).toEqual(testValue)
      expect(result?.id).toBe('1')
      expect(result?.name).toBe('Test')
    })
  })

  describe('set', () => {
    it('should store value in cache', () => {
      mockCache.set.mockReturnValue(true)

      const result = cacheManager.set('test-key', 'test-value')

      expect(result).toBe(true)
      expect(mockCache.set).toHaveBeenCalledWith('test-key', 'test-value')
    })

    it('should store value with custom TTL', () => {
      mockCache.set.mockReturnValue(true)

      const result = cacheManager.set('test-key', 'test-value', 7200)

      expect(result).toBe(true)
      expect(mockCache.set).toHaveBeenCalledWith('test-key', 'test-value', 7200)
    })

    it('should handle complex objects', () => {
      const complexObject = {
        id: '123',
        data: { nested: { value: 'test' } },
        array: [1, 2, 3],
      }
      mockCache.set.mockReturnValue(true)

      const result = cacheManager.set('complex-key', complexObject)

      expect(result).toBe(true)
      expect(mockCache.set).toHaveBeenCalledWith('complex-key', complexObject)
    })

    it('should return false on cache error', () => {
      mockCache.set.mockReturnValue(false)

      const result = cacheManager.set('test-key', 'test-value')

      expect(result).toBe(false)
    })
  })

  describe('delete', () => {
    it('should delete key from cache', () => {
      mockCache.del.mockReturnValue(1)

      const result = cacheManager.delete('test-key')

      expect(result).toBe(1)
      expect(mockCache.del).toHaveBeenCalledWith('test-key')
    })

    it('should return 0 for non-existent key', () => {
      mockCache.del.mockReturnValue(0)

      const result = cacheManager.delete('missing-key')

      expect(result).toBe(0)
      expect(mockCache.del).toHaveBeenCalledWith('missing-key')
    })

    it('should handle multiple key deletion', () => {
      mockCache.del.mockReturnValue(3)

      const result = cacheManager.delete(['key1', 'key2', 'key3'])

      expect(result).toBe(3)
      expect(mockCache.del).toHaveBeenCalledWith(['key1', 'key2', 'key3'])
    })
  })

  describe('clear', () => {
    it('should clear all cache entries', () => {
      cacheManager.clear()

      expect(mockCache.flushAll).toHaveBeenCalled()
    })
  })

  describe('has', () => {
    it('should check if key exists', () => {
      mockCache.has.mockReturnValue(true)

      const result = cacheManager.has('test-key')

      expect(result).toBe(true)
      expect(mockCache.has).toHaveBeenCalledWith('test-key')
    })

    it('should return false for non-existent key', () => {
      mockCache.has.mockReturnValue(false)

      const result = cacheManager.has('missing-key')

      expect(result).toBe(false)
      expect(mockCache.has).toHaveBeenCalledWith('missing-key')
    })
  })

  describe('keys', () => {
    it('should return all cache keys', () => {
      const keys = ['key1', 'key2', 'key3']
      mockCache.keys.mockReturnValue(keys)

      const result = cacheManager.keys()

      expect(result).toEqual(keys)
      expect(mockCache.keys).toHaveBeenCalled()
    })

    it('should return empty array when cache is empty', () => {
      mockCache.keys.mockReturnValue([])

      const result = cacheManager.keys()

      expect(result).toEqual([])
    })
  })

  describe('getTtl', () => {
    it('should get TTL for key', () => {
      const ttlTimestamp = Date.now() + 3600000
      mockCache.getTtl.mockReturnValue(ttlTimestamp)

      const result = cacheManager.getTtl('test-key')

      expect(result).toBe(ttlTimestamp)
      expect(mockCache.getTtl).toHaveBeenCalledWith('test-key')
    })

    it('should return undefined for non-existent key', () => {
      mockCache.getTtl.mockReturnValue(undefined)

      const result = cacheManager.getTtl('missing-key')

      expect(result).toBeUndefined()
    })
  })

  describe('setTtl', () => {
    it('should update TTL for key', () => {
      mockCache.ttl.mockReturnValue(true)

      const result = cacheManager.setTtl('test-key', 7200)

      expect(result).toBe(true)
      expect(mockCache.ttl).toHaveBeenCalledWith('test-key', 7200)
    })

    it('should return false for non-existent key', () => {
      mockCache.ttl.mockReturnValue(false)

      const result = cacheManager.setTtl('missing-key', 7200)

      expect(result).toBe(false)
    })
  })

  describe('close', () => {
    it('should close cache connection', () => {
      cacheManager.close()

      expect(mockCache.close).toHaveBeenCalled()
    })
  })

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = {
        hits: 100,
        misses: 20,
        keys: 15,
        ksize: 150,
        vsize: 1500,
      }
      mockCache.getStats.mockReturnValue(stats)

      const result = cacheManager.getStats()

      expect(result).toEqual(stats)
      expect(mockCache.getStats).toHaveBeenCalled()
    })
  })

  describe('integration scenarios', () => {
    it('should handle caching workflow', () => {
      // Check if exists
      mockCache.has.mockReturnValue(false)
      expect(cacheManager.has('user-data')).toBe(false)

      // Set data
      mockCache.set.mockReturnValue(true)
      const userData = { id: '123', name: 'Test User' }
      expect(cacheManager.set('user-data', userData, 1800)).toBe(true)

      // Now exists
      mockCache.has.mockReturnValue(true)
      expect(cacheManager.has('user-data')).toBe(true)

      // Get data
      mockCache.get.mockReturnValue(userData)
      expect(cacheManager.get('user-data')).toEqual(userData)

      // Update TTL
      mockCache.ttl.mockReturnValue(true)
      expect(cacheManager.setTtl('user-data', 3600)).toBe(true)

      // Delete data
      mockCache.del.mockReturnValue(1)
      expect(cacheManager.delete('user-data')).toBe(1)
    })

    it('should handle cache miss and fetch pattern', () => {
      const key = 'api-response'

      // Cache miss
      mockCache.get.mockReturnValue(undefined)
      const cached = cacheManager.get(key)
      expect(cached).toBeUndefined()

      // Fetch and cache
      const apiData = { result: 'success', data: [1, 2, 3] }
      mockCache.set.mockReturnValue(true)
      cacheManager.set(key, apiData)

      // Cache hit
      mockCache.get.mockReturnValue(apiData)
      const cachedData = cacheManager.get(key)
      expect(cachedData).toEqual(apiData)
    })
  })
})
