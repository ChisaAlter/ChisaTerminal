/**
 * Electron safeStorage 的可控 mock，用于单元测试与集成测试。
 * 支持模拟加密/解密成功或失败，并可配置可用性状态。
 */

export interface SafeStorageMockOptions {
  /** 是否模拟加密功能可用，默认为 true */
  available?: boolean
  /** 加密时抛出的错误，不设置则模拟成功 */
  encryptError?: Error
  /** 解密时抛出的错误，不设置则模拟成功 */
  decryptError?: Error
}

export class SafeStorageMock {
  private available: boolean
  private encryptError?: Error
  private decryptError?: Error

  constructor(options: SafeStorageMockOptions = {}) {
    this.available = options.available ?? true
    this.encryptError = options.encryptError
    this.decryptError = options.decryptError
  }

  /** 更新 mock 行为 */
  configure(options: SafeStorageMockOptions): void {
    if (options.available !== undefined) {
      this.available = options.available
    }
    if (options.encryptError !== undefined) {
      this.encryptError = options.encryptError
    }
    if (options.decryptError !== undefined) {
      this.decryptError = options.decryptError
    }
  }

  isEncryptionAvailable(): boolean {
    return this.available
  }

  encryptString(plainText: string): Buffer {
    if (!this.available) {
      throw new Error('加密功能当前不可用')
    }
    if (this.encryptError) {
      throw this.encryptError
    }
    return Buffer.from(`enc:${plainText}`, 'utf8')
  }

  decryptString(encrypted: Buffer): string {
    if (!this.available) {
      throw new Error('解密功能当前不可用')
    }
    if (this.decryptError) {
      throw this.decryptError
    }
    const text = encrypted.toString('utf8')
    if (text.startsWith('enc:')) {
      return text.slice(4)
    }
    return text
  }

  /** 重置为默认成功状态 */
  reset(): void {
    this.available = true
    this.encryptError = undefined
    this.decryptError = undefined
  }
}

/** 默认导出的 safeStorage mock 实例 */
export const safeStorageMock = new SafeStorageMock()
