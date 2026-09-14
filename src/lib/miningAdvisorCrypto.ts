const PREFIX = 'v2'
const PBKDF2_ITERATIONS = 210000
const SALT_BYTES = 16
const IV_BYTES = 12

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function isAdvisorLockPhrase(value: string): boolean {
  return value.trim().length >= 10
}

export async function encryptAdvisorSecret(plain: string, phrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase.trim()),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  )
  return [PREFIX, String(PBKDF2_ITERATIONS), bytesToB64(salt), bytesToB64(iv), bytesToB64(cipher)].join('.')
}

export async function decryptAdvisorSecret(blob: string, phrase: string): Promise<string> {
  const parts = blob.split('.')
  if (parts.length !== 5 || parts[0] !== PREFIX) {
    throw new Error('bad_blob')
  }
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 100000 || iterations > 1000000) {
    throw new Error('bad_blob')
  }
  const salt = b64ToBytes(parts[2])
  const iv = b64ToBytes(parts[3])
  const cipher = b64ToBytes(parts[4])
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase.trim()),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return new TextDecoder().decode(raw)
}
