import { timingSafeEqual } from "node:crypto"

if (typeof crypto.subtle.timingSafeEqual !== "function") {
  Object.defineProperty(crypto.subtle, "timingSafeEqual", {
    configurable: true,
    value(left, right) {
      const a = Buffer.from(left.buffer, left.byteOffset, left.byteLength)
      const b = Buffer.from(right.buffer, right.byteOffset, right.byteLength)
      return a.byteLength === b.byteLength && timingSafeEqual(a, b)
    },
  })
}
