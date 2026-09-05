import { useMemo, useRef, useState } from 'react'

import type { Encoding, OperationKind, OperationRequest, OperationResult } from '../../api/contracts'
import { encodedInput } from '../../api/encoding'
import { Badge } from '../../components/Badge'
import { BytesField } from '../../components/BytesField'
import { EmptyState } from '../../components/EmptyState'
import { formatBytes, formatMicros, shortTime } from '../../components/format'
import { useLab } from '../../state/LabContext'

const operationKinds: OperationKind[] = ['put', 'get', 'delete', 'scan', 'compact']

function StateDiff({ result }: { result: OperationResult }) {
  const rows = [
    ['MemTable', formatBytes(result.before.memtableBytes), formatBytes(result.after.memtableBytes)],
    ['Next sequence', result.before.nextSequence, result.after.nextSequence],
    ['Active WAL', result.before.activeWal, result.after.activeWal],
    ['SSTables', result.before.tables.length, result.after.tables.length],
    ['Directory', formatBytes(result.before.directoryBytes), formatBytes(result.after.directoryBytes)],
  ]
  return (
    <div className="diff-grid">
      <span /> <strong>Before</strong> <strong>After</strong>
      {rows.map(([label, before, after]) => (
        <div className={before === after ? 'diff-row' : 'diff-row diff-changed'} key={label}>
          <span>{label}</span><code>{before}</code><code>{after}</code>
        </div>
      ))}
    </div>
  )
}

function requestFromLine(line: string): OperationRequest | undefined {
  const parts = line.trim().split(/\s+/)
  if (parts.length === 0 || !parts[0])
    return undefined
  const command = parts[0].toLowerCase()
  const text = (data = '') => ({ data, encoding: 'text' as const })
  if (command === 'put' && parts.length >= 3)
    return { kind: 'put', key: text(parts[1]), value: text(parts.slice(2).join(' ')) }
  if (command === 'get' && parts.length === 2)
    return { kind: 'get', key: text(parts[1]) }
  if (command === 'delete' && parts.length === 2)
    return { kind: 'delete', key: text(parts[1]) }
  if (command === 'scan' && parts.length <= 3)
    return { kind: 'scan', begin: text(parts[1]), end: text(parts[2]) }
  if (command === 'compact' && parts.length === 1)
    return { kind: 'compact' }
  throw new Error(`Unsupported batch line: ${line}`)
}

export function PlaygroundPage() {
  const { state, operations, execute, loading } = useLab()
  const [kind, setKind] = useState<OperationKind>('put')
  const [key, setKey] = useState('alpha')
  const [value, setValue] = useState('first value')
  const [begin, setBegin] = useState('')
  const [end, setEnd] = useState('')
  const [encoding, setEncoding] = useState<Encoding>('text')
  const [latest, setLatest] = useState<OperationResult>()
  const [batch, setBatch] = useState('PUT alpha one\nPUT beta two\nGET alpha\nDELETE beta\nSCAN')
  const [batchIndex, setBatchIndex] = useState(0)
  const [batchError, setBatchError] = useState<string>()
  const stopBatch = useRef(false)
  const batchLines = useMemo(() => batch.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#')), [batch])

  const buildRequest = (): OperationRequest => {
    if (kind === 'put')
      return { kind, key: encodedInput(key, encoding), value: encodedInput(value, encoding) }
    if (kind === 'get' || kind === 'delete')
      return { kind, key: encodedInput(key, encoding) }
    if (kind === 'scan')
      return { kind, begin: encodedInput(begin, encoding), end: encodedInput(end, encoding) }
    return { kind }
  }

  const runRequest = async (request: OperationRequest) => {
    setBatchError(undefined)
    try {
      const result = await execute(request)
      if (result)
        setLatest(result)
      return result
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Could not build operation')
      return undefined
    }
  }

  const runBatchStep = async () => {
    if (batchIndex >= batchLines.length)
      return
    try {
      const request = requestFromLine(batchLines[batchIndex])
      if (request)
        await runRequest(request)
      setBatchIndex((index) => index + 1)
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Invalid batch line')
    }
  }

  const runAll = async () => {
    stopBatch.current = false
    setBatchError(undefined)
    for (let index = batchIndex; index < batchLines.length; index += 1) {
      if (stopBatch.current)
        break
      try {
        const request = requestFromLine(batchLines[index])
        if (request)
          await runRequest(request)
        setBatchIndex(index + 1)
      } catch (error) {
        setBatchError(error instanceof Error ? error.message : 'Invalid batch line')
        break
      }
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="panel-kicker">Interactive write and read path</p>
          <h2>Operation playground</h2>
          <p>Run one operation at a time and inspect the exact {state.source === 'live' ? 'TinyLSM' : 'mock'} state transition it produces.</p>
        </div>
        <Badge tone={state.connection === 'open' ? 'success' : 'warning'}>
          {state.connection === 'open' ? 'READY' : 'OPEN A SESSION'}
        </Badge>
      </section>

      <div className="two-column-grid playground-grid">
        <section className="panel operation-composer">
          <div className="segmented-control" role="tablist" aria-label="Operation type">
            {operationKinds.map((operation) => (
              <button
                aria-selected={kind === operation}
                className={kind === operation ? 'selected' : ''}
                disabled={operation === 'compact' && !state.features.compact}
                key={operation}
                onClick={() => setKind(operation)}
                role="tab"
                type="button"
              >
                {operation}
              </button>
            ))}
          </div>

          <div className="form-stack">
            {(kind === 'put' || kind === 'get' || kind === 'delete') && (
              <BytesField encoding={encoding} label="Key" onEncoding={setEncoding} onValue={setKey} placeholder="customer:42" value={key} />
            )}
            {kind === 'put' && (
              <BytesField encoding={encoding} label="Value" multiline onEncoding={setEncoding} onValue={setValue} placeholder="Arbitrary bytes" value={value} />
            )}
            {kind === 'scan' && (
              <>
                <BytesField encoding={encoding} label="Begin (inclusive)" onEncoding={setEncoding} onValue={setBegin} value={begin} />
                <BytesField encoding={encoding} label="End (exclusive, empty = unbounded)" onEncoding={setEncoding} onValue={setEnd} value={end} />
              </>
            )}
            {kind === 'compact' && (
              <div className="callout callout-warning">
                Full compaction rewrites published SSTables, removes obsolete versions and drops safe tombstones.
              </div>
            )}
            {batchError && <div className="inline-error" role="alert">{batchError}</div>}
            <button disabled={loading || state.connection !== 'open'} onClick={() => void runRequest(buildRequest())} type="button">
              Run {kind}
            </button>
          </div>
        </section>

        <section className="panel result-panel" aria-live="polite">
          <div className="section-heading">
            <div><p className="panel-kicker">Latest result</p><h3>Operation evidence</h3></div>
            {latest && <Badge tone={latest.status.code === 'OK' ? 'success' : latest.status.code === 'NOT_FOUND' ? 'warning' : 'danger'}>{latest.status.code}</Badge>}
          </div>
          {!latest ? (
            <EmptyState detail="Run an operation to compare engine state before and after." title="No operation yet" />
          ) : (
            <div className="result-content">
              <div className="result-meta">
                <span><small>Operation ID</small><code>{latest.operationId}</code></span>
                <span><small>Started</small><strong>{shortTime(latest.startedAt)}</strong></span>
                <span><small>{state.source === 'live' ? 'Measured request duration' : 'Mock engine latency'}</small><strong>{formatMicros(latest.durationMicros)}</strong></span>
              </div>
              <p className="status-message">{latest.status.message}</p>
              {latest.value && <pre className="data-result">{latest.value.key} → {latest.value.value || '(empty value)'}</pre>}
              {latest.entries && (
                <div className="entry-table compact-scroll">
                  {latest.entries.length === 0 ? <p className="muted-copy">The range contains no live values.</p> : latest.entries.map((entry) => (
                    <div key={`${entry.keyBase64}-${entry.sequence ?? 'unknown'}`}><code>{entry.key}</code><span>{entry.value || '(empty)'}</span><small>{entry.sequence === undefined ? 'sequence unavailable' : `seq ${entry.sequence}`}</small></div>
                  ))}
                </div>
              )}
              <StateDiff result={latest} />
            </div>
          )}
        </section>
      </div>

      <section className="panel batch-panel">
        <div className="section-heading">
          <div><p className="panel-kicker">Repeatable experiment</p><h3>Batch runner</h3></div>
          <Badge tone="info">Line {Math.min(batchIndex + 1, batchLines.length || 1)} / {batchLines.length}</Badge>
        </div>
        <div className="batch-layout">
          <label>
            <span>Commands</span>
            <textarea aria-label="Batch commands" onChange={(event) => { setBatch(event.target.value); setBatchIndex(0) }} rows={8} value={batch} />
          </label>
          <div className="batch-help">
            <strong>Supported syntax</strong>
            <code>PUT key value</code><code>GET key</code><code>DELETE key</code><code>SCAN [begin [end]]</code><code>COMPACT</code>
            <div className="button-row">
              <button className="button-secondary" disabled={batchIndex >= batchLines.length || state.connection !== 'open'} onClick={() => void runBatchStep()} type="button">Step</button>
              <button disabled={batchIndex >= batchLines.length || state.connection !== 'open'} onClick={() => void runAll()} type="button">Run remaining</button>
              <button className="button-ghost" onClick={() => { stopBatch.current = true; setBatchIndex(0) }} type="button">Stop & rewind</button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><div><p className="panel-kicker">Bounded history</p><h3>Recent operations</h3></div><span className="muted-copy">Newest first · {operations.length} / 10,000</span></div>
        {operations.length === 0 ? <EmptyState detail="Completed operations will appear here with status and replay controls." title="History is empty" /> : (
          <div className="operation-history compact-scroll">
            {operations.slice(0, 80).map((operation) => (
              <article key={operation.operationId}>
                <Badge tone={operation.status.code === 'OK' ? 'success' : operation.status.code === 'NOT_FOUND' ? 'warning' : 'danger'}>{operation.status.code}</Badge>
                <strong>{operation.request.kind.toUpperCase()}</strong>
                <code>{operation.operationId}</code>
                <span>{operation.status.message}</span>
                <small>{formatMicros(operation.durationMicros)}</small>
                <button className="button-link" disabled={state.connection !== 'open'} onClick={() => void runRequest(operation.request)} type="button">Replay</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
