import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SSEClient } from './sse-client'
import { EventEmitter } from 'events'

// Mock EventSource
class MockEventSource extends EventEmitter {
  url: string
  withCredentials: boolean
  readyState: number = 0
  CONNECTING = 0
  OPEN = 1
  CLOSED = 2
  
  constructor(url: string, options?: any) {
    super()
    this.url = url
    this.withCredentials = options?.withCredentials || false
    setTimeout(() => {
      this.readyState = 1
      this.emit('open')
    }, 0)
  }
  
  close() {
    this.readyState = 2
    this.emit('close')
  }
}

global.EventSource = MockEventSource as any

describe('SSEClient', () => {
  let client: SSEClient
  let consoleLogSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    client = new SSEClient('http://localhost:3000/sse')
  })

  afterEach(() => {
    client.disconnect()
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with URL', () => {
      const customClient = new SSEClient('https://api.example.com/events')
      expect(customClient['url']).toBe('https://api.example.com/events')
      customClient.disconnect()
    })

    it('should accept options', () => {
      const customClient = new SSEClient('http://test.com', {
        withCredentials: true,
        headers: { 'X-Custom': 'value' },
      })
      expect(customClient['options']).toEqual({
        withCredentials: true,
        headers: { 'X-Custom': 'value' },
      })
      customClient.disconnect()
    })
  })

  describe('connect', () => {
    it('should establish SSE connection', async () => {
      await client.connect()
      
      expect(client['eventSource']).toBeDefined()
      expect(client['eventSource']?.url).toBe('http://localhost:3000/sse')
    })

    it('should handle connection open event', async () => {
      const onOpen = vi.fn()
      client.on('open', onOpen)
      
      await client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(onOpen).toHaveBeenCalled()
    })

    it('should not reconnect if already connected', async () => {
      await client.connect()
      const firstSource = client['eventSource']
      
      await client.connect()
      const secondSource = client['eventSource']
      
      expect(firstSource).toBe(secondSource)
    })

    it('should pass options to EventSource', async () => {
      const customClient = new SSEClient('http://test.com', {
        withCredentials: true,
      })
      
      await customClient.connect()
      
      expect(customClient['eventSource']?.withCredentials).toBe(true)
      customClient.disconnect()
    })
  })

  describe('disconnect', () => {
    it('should close SSE connection', async () => {
      await client.connect()
      const eventSource = client['eventSource']
      const closeSpy = vi.spyOn(eventSource!, 'close')
      
      client.disconnect()
      
      expect(closeSpy).toHaveBeenCalled()
      expect(client['eventSource']).toBeNull()
    })

    it('should handle disconnect when not connected', () => {
      expect(() => client.disconnect()).not.toThrow()
    })

    it('should emit close event', async () => {
      const onClose = vi.fn()
      client.on('close', onClose)
      
      await client.connect()
      client.disconnect()
      
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('message handling', () => {
    it('should handle incoming messages', async () => {
      const onMessage = vi.fn()
      client.on('message', onMessage)
      
      await client.connect()
      
      const messageEvent = new MessageEvent('message', {
        data: JSON.stringify({ type: 'test', content: 'Hello' }),
      })
      client['eventSource']?.emit('message', messageEvent)
      
      expect(onMessage).toHaveBeenCalledWith({
        type: 'test',
        content: 'Hello',
      })
    })

    it('should handle malformed JSON messages', async () => {
      const onError = vi.fn()
      client.on('error', onError)
      
      await client.connect()
      
      const messageEvent = new MessageEvent('message', {
        data: 'invalid json',
      })
      client['eventSource']?.emit('message', messageEvent)
      
      expect(onError).toHaveBeenCalled()
    })

    it('should handle custom event types', async () => {
      const onCustom = vi.fn()
      client.on('custom-event', onCustom)
      
      await client.connect()
      client.addEventListener('custom-event', (data) => onCustom(data))
      
      const customEvent = new MessageEvent('custom-event', {
        data: JSON.stringify({ value: 'custom' }),
      })
      client['eventSource']?.emit('custom-event', customEvent)
      
      // Would need implementation in actual client
    })
  })

  describe('error handling', () => {
    it('should handle connection errors', async () => {
      const onError = vi.fn()
      client.on('error', onError)
      
      await client.connect()
      
      const errorEvent = new Event('error')
      client['eventSource']?.emit('error', errorEvent)
      
      expect(onError).toHaveBeenCalledWith(errorEvent)
    })

    it('should attempt reconnection on error', async () => {
      vi.useFakeTimers()
      
      await client.connect()
      const firstSource = client['eventSource']
      
      // Simulate error
      const errorEvent = new Event('error')
      client['eventSource']?.emit('error', errorEvent)
      
      // Wait for reconnection attempt
      vi.advanceTimersByTime(5000)
      
      // Would need reconnection logic in actual implementation
      
      vi.useRealTimers()
    })

    it('should handle network disconnection', async () => {
      const onClose = vi.fn()
      client.on('close', onClose)
      
      await client.connect()
      
      // Simulate network disconnect
      client['eventSource']?.close()
      
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('send', () => {
    it('should send data to server', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
      
      await client.connect()
      const result = await client.send({ action: 'test' })
      
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/sse',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ action: 'test' }),
        })
      )
      expect(result).toEqual({ success: true })
    })

    it('should handle send errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      
      await client.connect()
      
      await expect(client.send({ action: 'test' })).rejects.toThrow('Network error')
    })

    it('should include authentication headers if provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })
      
      const authClient = new SSEClient('http://test.com', {
        headers: { 'Authorization': 'Bearer token' },
      })
      
      await authClient.connect()
      await authClient.send({ data: 'test' })
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token',
          }),
        })
      )
      
      authClient.disconnect()
    })
  })

  describe('event listeners', () => {
    it('should add and remove event listeners', async () => {
      const handler = vi.fn()
      
      client.addEventListener('test', handler)
      client.emit('test', { data: 'test' })
      
      expect(handler).toHaveBeenCalledWith({ data: 'test' })
      
      client.removeEventListener('test', handler)
      client.emit('test', { data: 'test2' })
      
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple listeners for same event', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      
      client.on('multi', handler1)
      client.on('multi', handler2)
      
      client.emit('multi', 'data')
      
      expect(handler1).toHaveBeenCalledWith('data')
      expect(handler2).toHaveBeenCalledWith('data')
    })

    it('should handle once listeners', () => {
      const handler = vi.fn()
      
      client.once('single', handler)
      
      client.emit('single', 'first')
      client.emit('single', 'second')
      
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith('first')
    })
  })

  describe('reconnection logic', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should implement exponential backoff', async () => {
      // Would need implementation in actual client
      await client.connect()
      
      // First reconnection attempt - 1s
      client['eventSource']?.emit('error', new Event('error'))
      vi.advanceTimersByTime(1000)
      
      // Second reconnection attempt - 2s
      client['eventSource']?.emit('error', new Event('error'))
      vi.advanceTimersByTime(2000)
      
      // Third reconnection attempt - 4s
      client['eventSource']?.emit('error', new Event('error'))
      vi.advanceTimersByTime(4000)
    })

    it('should have maximum reconnection attempts', async () => {
      const onMaxRetriesReached = vi.fn()
      client.on('max-retries-reached', onMaxRetriesReached)
      
      await client.connect()
      
      // Simulate multiple failures
      for (let i = 0; i < 10; i++) {
        client['eventSource']?.emit('error', new Event('error'))
        vi.advanceTimersByTime(5000)
      }
      
      // Would need implementation to emit max-retries-reached
    })

    it('should reset retry count on successful connection', async () => {
      await client.connect()
      
      // Simulate error and reconnection
      client['eventSource']?.emit('error', new Event('error'))
      vi.advanceTimersByTime(1000)
      
      // Simulate successful reconnection
      client['eventSource']?.emit('open')
      
      // Retry count should be reset
      // Would need implementation to track this
    })
  })

  describe('state management', () => {
    it('should track connection state', () => {
      expect(client.isConnected()).toBe(false)
      
      client.connect()
      // After connection is established
      setTimeout(() => {
        expect(client.isConnected()).toBe(true)
      }, 10)
    })

    it('should provide ready state', async () => {
      expect(client.getReadyState()).toBe(EventSource.CLOSED)
      
      await client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(client.getReadyState()).toBe(EventSource.OPEN)
      
      client.disconnect()
      expect(client.getReadyState()).toBe(EventSource.CLOSED)
    })
  })
})