import type { EncodedBytes, Encoding } from './contracts'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: false })

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value.trim())
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new Error('Invalid Base64 input')
  }
}

export function decodeBytes(value?: EncodedBytes): Uint8Array {
  if (!value)
    return new Uint8Array()

  if (value.encoding === 'text')
    return encoder.encode(value.data)

  if (value.encoding === 'base64')
    return base64ToBytes(value.data)

  const compact = value.data.replaceAll(/\s/g, '')
  if (compact.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(compact))
    throw new Error('Hex input must contain complete byte pairs')
  return Uint8Array.from(compact.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
}

export function encodeBytes(bytes: Uint8Array, encoding: Encoding): string {
  if (encoding === 'text')
    return decoder.decode(bytes)
  if (encoding === 'base64')
    return bytesToBase64(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

export function encodedInput(data: string, encoding: Encoding): EncodedBytes {
  const byteLength = decodeBytes({ data, encoding }).byteLength
  return { data, encoding, byteLength }
}

export function byteKey(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
}

export function displayBytes(bytes: Uint8Array): string {
  const text = decoder.decode(bytes)
  const printable = Array.from(text).every((character) => {
    const code = character.charCodeAt(0)
    return code >= 32 && code !== 127
  })
  return printable ? text : `0x${encodeBytes(bytes, 'hex').replaceAll(' ', '')}`
}

export function byteLength(value: string): number {
  return encoder.encode(value).byteLength
}

