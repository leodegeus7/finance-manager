// ============================================================
// HASH UTILS — deterministic external_id generation
// Uses Web Crypto API (browser-compatible, no Node crypto)
// ============================================================

/**
 * Creates a deterministic SHA-256 hash from any number of string parts.
 * Async because SubtleCrypto.digest() is async.
 * Returns a hex string.
 */
export async function hashAsync(...parts: (string | number | undefined | null)[]): Promise<string> {
  const content = parts.map((p) => (p == null ? '' : String(p))).join('|')
  const encoded = new TextEncoder().encode(content)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Synchronous hash using a fast djb2 string hash.
 * Not cryptographically strong but deterministic — used for external_id
 * generation where collision probability is acceptably low given the inputs
 * (date + description + amount + cardId) are already highly specific.
 */
export function hash(...parts: (string | number | undefined | null)[]): string {
  const content = parts.map((p) => (p == null ? '' : String(p))).join('|')
  let h = 5381
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h) ^ content.charCodeAt(i)
    h = h >>> 0  // keep unsigned 32-bit
  }
  // Mix with length to reduce collisions on similar inputs
  return `${h.toString(16).padStart(8, '0')}${(content.length >>> 0).toString(16).padStart(8, '0')}${(content.split('').reduce((a, c) => ((a << 3) ^ c.charCodeAt(0)) >>> 0, 0)).toString(16).padStart(8, '0')}`
}
