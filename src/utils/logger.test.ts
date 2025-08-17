import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogLevel, logger } from './logger'

vi.mock('picocolors', () => ({
  default: {
    cyan: vi.fn(text => `[cyan]${text}[/cyan]`),
    yellow: vi.fn(text => `[yellow]${text}[/yellow]`),
    red: vi.fn(text => `[red]${text}[/red]`),
    green: vi.fn(text => `[green]${text}[/green]`),
    gray: vi.fn(text => `[gray]${text}[/gray]`),
    dim: vi.fn(text => `[dim]${text}[/dim]`),
    bold: vi.fn(text => `[bold]${text}[/bold]`),
    underline: vi.fn(text => `[underline]${text}[/underline]`),
  },
}))

describe('Logger', () => {
  let consoleLogSpy: any
  let consoleErrorSpy: any
  let consoleWarnSpy: any
  let originalEnv: any

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    originalEnv = process.env.NODE_ENV
    logger.setLevel(LogLevel.INFO)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.env.NODE_ENV = originalEnv
  })

  describe('setLevel', () => {
    it('should set log level', () => {
      logger.setLevel(LogLevel.DEBUG)
      logger.debug('Debug message')
      expect(consoleLogSpy).toHaveBeenCalledWith('[gray][DEBUG][/gray]', 'Debug message')

      logger.setLevel(LogLevel.ERROR)
      consoleLogSpy.mockClear()
      logger.debug('Should not log')
      logger.info('Should not log')
      logger.warn('Should not log')
      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Test info message')

      expect(consoleLogSpy).toHaveBeenCalledWith('Test info message')
    })

    it('should handle multiple arguments', () => {
      logger.info('Message', 'with', 'multiple', 'parts')

      expect(consoleLogSpy).toHaveBeenCalledWith('Message', 'with', 'multiple', 'parts')
    })

    it('should handle objects', () => {
      const obj = { key: 'value', nested: { prop: 123 } }
      logger.info('Object:', obj)

      expect(consoleLogSpy).toHaveBeenCalledWith('Object:', obj)
    })

    it('should not log when level is higher than INFO', () => {
      logger.setLevel(LogLevel.WARN)
      logger.info('Should not log')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Test warning')

      expect(consoleWarnSpy).toHaveBeenCalledWith('[yellow][WARN][/yellow]', 'Test warning')
    })

    it('should handle arrays', () => {
      const arr = [1, 2, 3]
      logger.warn('Array warning:', arr)

      expect(consoleWarnSpy).toHaveBeenCalledWith('[yellow][WARN][/yellow]', 'Array warning:', arr)
    })

    it('should not log when level is higher than WARN', () => {
      logger.setLevel(LogLevel.ERROR)
      logger.warn('Should not log')

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('Test error')

      expect(consoleErrorSpy).toHaveBeenCalledWith('[red][ERROR][/red]', 'Test error')
    })

    it('should handle Error objects', () => {
      const error = new Error('Something went wrong')
      logger.error('Error occurred:', error)

      expect(consoleErrorSpy).toHaveBeenCalledWith('[red][ERROR][/red]', 'Error occurred:', error)
    })

    it('should handle error with stack trace', () => {
      const error = new Error('Stack trace error')
      error.stack = 'Error: Stack trace error\n    at test.js:10:5'
      logger.error(error)

      expect(consoleErrorSpy).toHaveBeenCalledWith('[red][ERROR][/red]', error)
    })

    it('should log even at ERROR level', () => {
      logger.setLevel(LogLevel.ERROR)
      logger.error('Should log')

      expect(consoleErrorSpy).toHaveBeenCalledWith('[red][ERROR][/red]', 'Should log')
    })
  })

  describe('debug', () => {
    it('should not log debug messages by default', () => {
      logger.debug('Debug message')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should log debug messages when level is DEBUG', () => {
      logger.setLevel(LogLevel.DEBUG)
      logger.debug('Debug message')

      expect(consoleLogSpy).toHaveBeenCalledWith('[gray][DEBUG][/gray]', 'Debug message')
    })

    it('should handle complex debug data', () => {
      logger.setLevel(LogLevel.DEBUG)
      const debugData = {
        request: { url: '/api/test', method: 'GET' },
        response: { status: 200, data: { result: 'success' } },
      }
      logger.debug('API call:', debugData)

      expect(consoleLogSpy).toHaveBeenCalledWith('[gray][DEBUG][/gray]', 'API call:', debugData)
    })
  })

  describe('debugSensitive', () => {
    it('should not log sensitive data by default', () => {
      logger.debugSensitive('Sensitive:', { password: 'secret123' })

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should log sensitive data in debug mode when not in production', () => {
      delete process.env.NODE_ENV
      logger.setLevel(LogLevel.DEBUG)
      const sensitiveData = { token: 'abc123', apiKey: 'xyz789' }
      logger.debugSensitive('Sensitive data:', sensitiveData)

      expect(consoleLogSpy).toHaveBeenCalledWith('[gray][DEBUG-SENSITIVE][/gray]', 'Sensitive data:', sensitiveData)
    })

    it('should not log sensitive data in production even in debug mode', () => {
      process.env.NODE_ENV = 'production'
      logger.setLevel(LogLevel.DEBUG)
      logger.debugSensitive('Should not log')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it('should not log sensitive data when level is higher than DEBUG', () => {
      logger.setLevel(LogLevel.INFO)
      logger.debugSensitive('Should not log')

      expect(consoleLogSpy).not.toHaveBeenCalled()
    })
  })

  describe('log level hierarchy', () => {
    it('should respect log level hierarchy', () => {
      // At DEBUG level, everything should log
      logger.setLevel(LogLevel.DEBUG)
      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')

      expect(consoleLogSpy).toHaveBeenCalledTimes(2) // debug and info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1) // warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1) // error

      // Clear spies
      consoleLogSpy.mockClear()
      consoleWarnSpy.mockClear()
      consoleErrorSpy.mockClear()

      // At INFO level, debug should not log
      logger.setLevel(LogLevel.INFO)
      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')

      expect(consoleLogSpy).toHaveBeenCalledTimes(1) // only info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1) // warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1) // error

      // Clear spies
      consoleLogSpy.mockClear()
      consoleWarnSpy.mockClear()
      consoleErrorSpy.mockClear()

      // At WARN level, debug and info should not log
      logger.setLevel(LogLevel.WARN)
      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')

      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1) // warn
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1) // error

      // Clear spies
      consoleLogSpy.mockClear()
      consoleWarnSpy.mockClear()
      consoleErrorSpy.mockClear()

      // At ERROR level, only error should log
      logger.setLevel(LogLevel.ERROR)
      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')

      expect(consoleLogSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1) // error
    })
  })

  describe('edge cases', () => {
    it('should handle empty arguments', () => {
      logger.info()
      logger.warn()
      logger.error()

      expect(consoleLogSpy).toHaveBeenCalledWith()
      expect(consoleWarnSpy).toHaveBeenCalledWith('[yellow][WARN][/yellow]')
      expect(consoleErrorSpy).toHaveBeenCalledWith('[red][ERROR][/red]')
    })

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000)
      logger.info(longString)

      expect(consoleLogSpy).toHaveBeenCalledWith(longString)
    })

    it('should handle circular references', () => {
      const obj: any = { name: 'test' }
      obj.circular = obj

      logger.info('Circular:', obj)

      expect(consoleLogSpy).toHaveBeenCalledWith('Circular:', obj)
    })

    it('should handle undefined and null', () => {
      logger.info(undefined, null, 'text')

      expect(consoleLogSpy).toHaveBeenCalledWith(undefined, null, 'text')
    })

    it('should handle boolean and number arguments', () => {
      logger.info('Boolean:', true, 'Number:', 42)

      expect(consoleLogSpy).toHaveBeenCalledWith('Boolean:', true, 'Number:', 42)
    })

    it('should handle symbols', () => {
      const sym = Symbol('test')
      logger.info('Symbol:', sym)

      expect(consoleLogSpy).toHaveBeenCalledWith('Symbol:', sym)
    })
  })
})
