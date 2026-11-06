/** 优先用 crypto.randomUUID；微信内置浏览器不支持时退化为 v4 随机串 */
export function createClientToken(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? (crypto as Crypto) : undefined
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}
