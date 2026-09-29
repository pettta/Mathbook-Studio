// pdf.js (5.x) uses the ES2026 Map upsert methods; older browsers lack them.
type AnyMap = Map<unknown, unknown> & { getOrInsert?: unknown; getOrInsertComputed?: unknown }
const mp = Map.prototype as unknown as AnyMap
if (typeof mp.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value(this: Map<unknown, unknown>, key: unknown, fn: (k: unknown) => unknown) {
      if (this.has(key)) return this.get(key)
      const v = fn(key); this.set(key, v); return v
    }, writable: true, configurable: true,
  })
}
if (typeof mp.getOrInsert !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsert', {
    value(this: Map<unknown, unknown>, key: unknown, v: unknown) {
      if (this.has(key)) return this.get(key)
      this.set(key, v); return v
    }, writable: true, configurable: true,
  })
}
const wp = WeakMap.prototype as unknown as AnyMap
if (typeof wp.getOrInsertComputed !== 'function') {
  Object.defineProperty(WeakMap.prototype, 'getOrInsertComputed', {
    value(this: WeakMap<object, unknown>, key: object, fn: (k: object) => unknown) {
      if (this.has(key)) return this.get(key)
      const v = fn(key); this.set(key, v); return v
    }, writable: true, configurable: true,
  })
}
if (typeof wp.getOrInsert !== 'function') {
  Object.defineProperty(WeakMap.prototype, 'getOrInsert', {
    value(this: WeakMap<object, unknown>, key: object, v: unknown) {
      if (this.has(key)) return this.get(key)
      this.set(key, v); return v
    }, writable: true, configurable: true,
  })
}
export {}
