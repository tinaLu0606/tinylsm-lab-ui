import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultOptions, defaultWorkload } from './defaults'
import { MockLabApi } from './MockLabApi'

describe('MockLabApi', () => {
  afterEach(() => vi.useRealTimers())

  it('models WAL-first writes, flushes, tombstones and ordered scans', async () => {
    const api = new MockLabApi()
    await api.open('/tmp/mock', { ...defaultOptions, memtableBytes: 70 })
    await api.execute({ kind: 'put', key: { encoding: 'text', data: 'b' }, value: { encoding: 'text', data: 'two' } })
    await api.execute({ kind: 'put', key: { encoding: 'text', data: 'a' }, value: { encoding: 'text', data: 'one' } })
    const metrics = await api.getMetrics()
    const events = await api.getEvents()
    expect(metrics.flushCount).toBeGreaterThan(0)
    expect(events.some((event) => event.phase === 'wal.append')).toBe(true)
    expect(events.some((event) => event.phase === 'manifest.publish')).toBe(true)

    await api.execute({ kind: 'delete', key: { encoding: 'text', data: 'a' } })
    const missing = await api.execute({ kind: 'get', key: { encoding: 'text', data: 'a' } })
    const scan = await api.execute({ kind: 'scan' })
    expect(missing.status.code).toBe('NOT_FOUND')
    expect(scan.entries?.map((entry) => entry.key)).toEqual(['b'])
  })

  it('makes workload requests deterministic for the same seed', async () => {
    vi.useFakeTimers()
    const first = new MockLabApi()
    const second = new MockLabApi()
    await first.open('/tmp/one', defaultOptions)
    await second.open('/tmp/two', defaultOptions)
    const config = { ...defaultWorkload, operationCount: 8, operationsPerSecond: 1000, seed: 9 }
    await first.startWorkload(config)
    await second.startWorkload(config)
    await vi.advanceTimersByTimeAsync(1000)
    const signature = async (api: MockLabApi) => (await api.getOperations()).map((item) => [item.request.kind, item.status.code, item.status.message])
    expect(await signature(first)).toEqual(await signature(second))
    expect((await first.getWorkload()).status).toBe('completed')
  })

  it('labels recovery as a simulation and keeps reports portable', async () => {
    const api = new MockLabApi()
    const run = await api.runRecovery('crc-corruption')
    expect(run.actualOutcome).toMatch(/Simulated only/)
    const report = await api.exportReport()
    const imported = new MockLabApi()
    await imported.importReport(report)
    expect((await imported.getState()).connection).toBe('closed')
  })
})
