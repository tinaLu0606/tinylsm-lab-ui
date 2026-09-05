import { describe, expect, it } from 'vitest'

import { decodeBytes, encodeBytes, encodedInput } from './encoding'

describe('byte encoding helpers', () => {
  it('round-trips UTF-8 using Hex and Base64', () => {
    const original = new TextEncoder().encode('TinyLSM 数据')
    expect(Array.from(decodeBytes({ encoding: 'hex', data: encodeBytes(original, 'hex') }))).toEqual(Array.from(original))
    expect(Array.from(decodeBytes({ encoding: 'base64', data: encodeBytes(original, 'base64') }))).toEqual(Array.from(original))
    expect(encodedInput('abc', 'text').byteLength).toBe(3)
  })

  it('rejects malformed encoded inputs', () => {
    expect(() => decodeBytes({ encoding: 'hex', data: 'abc' })).toThrow(/byte pairs/)
    expect(() => decodeBytes({ encoding: 'base64', data: '%%%' })).toThrow(/Base64/)
  })
})
