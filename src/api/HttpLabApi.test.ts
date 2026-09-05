import { afterEach, describe, expect, it, vi } from 'vitest'

import { HttpLabApi } from './HttpLabApi'
import { defaultOptions } from './defaults'

describe('HttpLabApi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes operation bytes to the live Base64 contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ operationId: 'op-1', status: { code: 'OK', message: '' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const api = new HttpLabApi('http://127.0.0.1:8080/')

    await api.execute({
      kind: 'put',
      key: { encoding: 'hex', data: '00 ff' },
      value: { encoding: 'text', data: 'one' },
    })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8080/api/operations/put', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        key: { encoding: 'base64', data: 'AP8=', byteLength: 2 },
        value: { encoding: 'base64', data: 'b25l', byteLength: 3 },
      }),
    }))
  })

  it('surfaces structured server errors without branching on messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ status: { code: 'CORRUPTION', message: 'load MANIFEST failed' } }),
    }))
    const api = new HttpLabApi()

    await expect(api.open('/tmp/bad', defaultOptions)).rejects.toThrow('CORRUPTION: load MANIFEST failed')
  })
})
