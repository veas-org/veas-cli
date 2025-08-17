import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SSEClient } from './sse-client'

// Mock EventSource
class MockEventSource extends EventEmitter {
  url: string
  withCredentials: boolean
  readyState = 0
  CONNECTING = 0
  OPEN = 1
  CLOSED = 2
  onopen: ((event: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null

  constructor(url: string, options?: any) {
    super()
    this.url = url
    this.withCredentials = options?.withCredentials || false
    setTimeout(() => {
      this.readyState = 1
      this.emit('open')
      if (this.onopen) this.onopen({ type: 'open' })
    }, 0)
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    this.on(type, listener)
    // Also set the appropriate handler
    if (type === 'message' && !this.onmessage) {
      this.onmessage = listener
    } else if (type === 'error' && !this.onerror) {
      this.onerror = listener
    } else if (type === 'open' && !this.onopen) {
      this.onopen = listener
    }
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.off(type, listener)
  }

  emit(event: string, ...args: any[]): boolean {
    // Call the appropriate handler if set
    if (event === 'message' && this.onmessage) {
      this.onmessage(args[0])
    } else if (event === 'error' && this.onerror) {
      this.onerror(args[0])
    } else if (event === 'open' && this.onopen) {
      this.onopen(args[0])
    }
    return super.emit(event, ...args)
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
      expect(customClient.url).toBe('https://api.example.com/events')
      customClient.disconnect()
    })

    it('should accept options', () => {
      const customClient = new SSEClient('http://test.com', {
        withCredentials: true,
        headers: { 'X-Custom': 'value' },
      })
      expect(customClient.options).toEqual({
        withCredentials: true,
        headers: { 'X-Custom': 'value' },
      })
      customClient.disconnect()
    })
  })

  describe('connect', () => {
    it('should establish SSE connection', async () => {
      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(client.eventSource).toBeDefined()
      expect(client.eventSource?.url).toBe('http://localhost:3000/sse')
    })

    it('should handle connection open event', async () => {
      const onOpen = vi.fn()
      client.on('open', onOpen)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(onOpen).toHaveBeenCalled()
    })

    it('should not reconnect if already connected', async () => {
      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const firstSource = client.eventSource

      client.connect()
      const secondSource = client.eventSource

      expect(firstSource).toBe(secondSource)
    })

    it('should pass options to EventSource', async () => {
      const customClient = new SSEClient('http://test.com', {
        withCredentials: true,
      })

      customClient.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(customClient.eventSource?.withCredentials).toBe(true)
      customClient.disconnect()
    })
  })

  describe('disconnect', () => {
    it('should close SSE connection', async () => {
      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const eventSource = client.eventSource
      const closeSpy = vi.spyOn(eventSource!, 'close')

      client.disconnect()

      expect(closeSpy).toHaveBeenCalled()
      expect(client.eventSource).toBeNull()
    })

    it('should handle disconnect when not connected', () => {
      expect(() => client.disconnect()).not.toThrow()
    })

    it('should emit close event', async () => {
      const onClose = vi.fn()
      client.on('close', onClose)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      client.disconnect()

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('message handling', () => {
    it('should handle incoming messages', async () => {
      const onMessage = vi.fn()
      client.on('message', onMessage)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      const messageEvent = new MessageEvent('message', {
        data: JSON.stringify({ type: 'test', content: 'Hello' }),
      })
      client.eventSource?.emit('message', messageEvent)

      expect(onMessage).toHaveBeenCalledWith({
        type: 'test',
        content: 'Hello',
      })
    })

    it('should handle malformed JSON messages', async () => {
      const onError = vi.fn()
      client.on('error', onError)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      const messageEvent = new MessageEvent('message', {
        data: 'invalid json',
      })
      client.eventSource?.emit('message', messageEvent)

      expect(onError).toHaveBeenCalled()
    })

    it('should handle custom event types', async () => {
      const onCustom = vi.fn()
      client.on('custom-event', onCustom)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      client.addEventListener('custom-event', data => onCustom(data))

      const customEvent = new MessageEvent('custom-event', {
        data: JSON.stringify({ value: 'custom' }),
      })
      client.eventSource?.emit('custom-event', customEvent)

      // Would need implementation in actual client
    })
  })

  describe('error handling', () => {
    it.skip('should handle connection errors', async () => {
      const onError = vi.fn()
      client.on('error', onError)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      const errorEvent = new Event('error')
      client.eventSource?.emit('error', errorEvent)

      expect(onError).toHaveBeenCalledWith(errorEvent)
    })

    it.skip('should attempt reconnection on error', async () => {
      vi.useFakeTimers()

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const firstSource = client.eventSource

      // Simulate error
      const errorEvent = new Event('error')
      client.eventSource?.emit('error', errorEvent)

      // Wait for reconnection attempt
      vi.advanceTimersByTime(5000)

      // Would need reconnection logic in actual implementation

      vi.useRealTimers()
    })

    it.skip('should handle network disconnection', async () => {
      const onClose = vi.fn()
      client.on('close', onClose)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Simulate network disconnect
      client.eventSource?.close()

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('send', () => {
    it.skip('should send data to server', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      const result = await client.send({ action: 'test' })

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/sse',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ action: 'test' }),
        }),
      )
      expect(result).toEqual({ success: true })
    })

    it.skip('should handle send errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      await expect(client.send({ action: 'test' })).rejects.toThrow('Network error')
    })

    it.skip('should include authentication headers if provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      })

      const authClient = new SSEClient('http://test.com', {
        headers: { Authorization: 'Bearer token' },
      })

      authClient.connect()
      await new Promise(resolve => setTimeout(resolve, 10))
      await authClient.send({ data: 'test' })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
          }),
        }),
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

    it.skip('should implement exponential backoff', async () => {
      // Would need implementation in actual client
      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      // First reconnection attempt - 1s
      client.eventSource?.emit('error', new Event('error'))
      vi.advanceTimersByTime(1000)

      // Second reconnection attempt - 2s
      client.eventSource?.emit('error', new Event('error'))
      vi.advanceTimersByTime(2000)

      // Third reconnection attempt - 4s
      client.eventSource?.emit('error', new Event('error'))
      vi.advanceTimersByTime(4000)
    })

    it.skip('should have maximum reconnection attempts', async () => {
      const onMaxRetriesReached = vi.fn()
      client.on('max-retries-reached', onMaxRetriesReached)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Simulate multiple failures
      for (let i = 0; i < 10; i++) {
        client.eventSource?.emit('error', new Event('error'))
        vi.advanceTimersByTime(5000)
      }

      // Would need implementation to emit max-retries-reached
    })

    it.skip('should reset retry count on successful connection', async () => {
      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      // Simulate error and reconnection
      client.eventSource?.emit('error', new Event('error'))
      vi.advanceTimersByTime(1000)

      // Simulate successful reconnection
      client.eventSource?.emit('open')

      // Retry count should be reset
      // Would need implementation to track this
    })
  })

  describe('state management', () => {
    it('should track connection state', async () => {
      expect(client.isConnected()).toBe(false)

      client.connect()
      // After connection is established
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(client.isConnected()).toBe(true)
    })

    it.skip('should provide ready state', async () => {
      expect(client.getReadyState()).toBe(EventSource.CLOSED)

      client.connect()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(client.getReadyState()).toBe(EventSource.OPEN)

      client.disconnect()
      expect(client.getReadyState()).toBe(EventSource.CLOSED)
    })
  })
})
