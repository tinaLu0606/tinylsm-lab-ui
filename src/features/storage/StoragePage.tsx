import { useEffect, useMemo, useState } from 'react'

import type { StorageFile } from '../../api/contracts'
import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { formatBytes, shortTime } from '../../components/format'
import { useLab } from '../../state/LabContext'

type LiveDetail = {
  manifest?: StorageFile['manifest']
  walRecords?: NonNullable<StorageFile['walRecords']>
  blocks?: NonNullable<StorageFile['blocks']>
  hexPreview?: string
  hasMore?: boolean
  cursor?: number
  error?: string
}

function bytesToHex(base64: string): string {
  const binary = atob(base64)
  return Array.from(binary, (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
}

function toneForState(state: StorageFile['state']) {
  if (state === 'active' || state === 'live')
    return 'success' as const
  if (state === 'orphan' || state === 'obsolete')
    return 'warning' as const
  return 'neutral' as const
}

export function StoragePage() {
  const { storage, state } = useLab()
  const [selectedName, setSelectedName] = useState('MANIFEST')
  const [view, setView] = useState<'decoded' | 'hex'>('decoded')
  const [page, setPage] = useState(0)
  const [cursors, setCursors] = useState<number[]>([0])
  const [hexOffset, setHexOffset] = useState(0)
  const [liveDetail, setLiveDetail] = useState<LiveDetail>()
  const selected = useMemo(
    () => storage.files.find((file) => file.name === selectedName) ?? storage.files[0],
    [selectedName, storage.files],
  )

  useEffect(() => {
    setPage(0)
    setCursors([0])
    setHexOffset(0)
  }, [selectedName])

  useEffect(() => {
    if (!selected || state.source !== 'live') {
      setLiveDetail(undefined)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        if (view === 'hex') {
          const length = Math.min(selected.size - hexOffset, 256 * 1024)
          if (length === 0) return setLiveDetail({ hexPreview: '' })
          const response = await fetch(`/api/storage/file/${encodeURIComponent(selected.name)}/bytes?offset=${hexOffset}&length=${length}`)
          const data = await response.json() as { base64?: string; status?: { message?: string } }
          if (!response.ok) throw new Error(data.status?.message ?? 'Range read failed')
          if (!cancelled) setLiveDetail({ hexPreview: bytesToHex(data.base64 ?? '') })
          return
        }
        const endpoint = selected.kind === 'manifest'
          ? '/api/storage/manifest'
          : selected.kind === 'wal'
            ? `/api/storage/wal/${encodeURIComponent(selected.name)}/records?cursor=${cursors[page] ?? 0}&limit=20`
            : selected.kind === 'sstable'
              ? `/api/storage/sst/${encodeURIComponent(selected.name)}/blocks?cursor=${cursors[page] ?? 0}&limit=20`
              : ''
        if (!endpoint) return setLiveDetail({})
        const response = await fetch(endpoint)
        const data = await response.json() as Record<string, unknown> & { status?: { message?: string } }
        if (!response.ok) throw new Error(data.status?.message ?? 'Storage decode failed')
        if (!cancelled) {
          const nextCursor = typeof data.cursor === 'number' ? data.cursor : undefined
          if (nextCursor !== undefined) {
            setCursors((current) => {
              const next = [...current]
              next[page + 1] = nextCursor
              return next
            })
          }
          setLiveDetail({
            manifest: selected.kind === 'manifest' ? data as unknown as StorageFile['manifest'] : undefined,
            walRecords: selected.kind === 'wal' ? data.records as NonNullable<StorageFile['walRecords']> : undefined,
            blocks: selected.kind === 'sstable' ? data.blocks as NonNullable<StorageFile['blocks']> : undefined,
            hasMore: Boolean(data.hasMore), cursor: nextCursor,
          })
        }
      } catch (error) {
        if (!cancelled) setLiveDetail({ error: error instanceof Error ? error.message : 'Storage request failed' })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [hexOffset, page, selected, state.source, view])

  const jumpToTable = (name: string) => {
    setSelectedName(name)
    setView('decoded')
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div><p className="panel-kicker">Persistent format explorer</p><h2>Storage inspector</h2><p>Follow Manifest references into active WAL records and immutable SSTable blocks.</p></div>
        <div className="hero-stats"><strong>{storage.files.length}</strong><span>{state.source} files</span><strong>{formatBytes(storage.totalBytes)}</strong><span>directory total</span></div>
      </section>

      <div className="storage-layout">
        <section className="panel file-tree" aria-label="Database files">
          <div className="section-heading"><div><p className="panel-kicker">Directory</p><h3>{state.path.split('/').at(-1)}</h3></div><Badge tone={state.source === 'live' ? 'success' : 'warning'}>{state.source}</Badge></div>
          {storage.files.map((file) => (
            <button className={selected?.name === file.name ? 'file-row file-row-selected' : 'file-row'} key={`${file.name}-${file.state}`} onClick={() => setSelectedName(file.name)} type="button">
              <span className={`file-icon file-${file.kind}`}>{file.kind === 'manifest' ? 'M' : file.kind === 'wal' ? 'W' : file.kind === 'sstable' ? 'S' : 'T'}</span>
              <span><strong>{file.name}</strong><small>{formatBytes(file.size)} · {file.kind}</small></span>
              <Badge tone={toneForState(file.state)}>{file.state}</Badge>
            </button>
          ))}
        </section>

        <section className="panel file-detail">
          {!selected ? <EmptyState detail={`Open a ${state.source} session to inspect storage files.`} title="No file selected" /> : (
            <>
              <div className="section-heading">
                <div><p className="panel-kicker">{selected.kind}</p><h3>{selected.name}</h3><span className="muted-copy">Updated {shortTime(selected.modifiedAt)} · {formatBytes(selected.size)}</span></div>
                <div className="segmented-control small"><button className={view === 'decoded' ? 'selected' : ''} onClick={() => setView('decoded')} type="button">Decoded</button><button className={view === 'hex' ? 'selected' : ''} onClick={() => setView('hex')} type="button">Range hex</button></div>
              </div>

              {liveDetail?.error ? <div className="inline-error" role="alert">{liveDetail.error}</div> : view === 'hex' ? (
                <div><div className="callout"><strong>{state.source === 'live' ? `Live range: bytes ${hexOffset}–${Math.min(selected.size, hexOffset + 256 * 1024)}` : 'Mock range: bytes 0–95'}</strong><span>Server limits each response to a bounded byte range.</span></div><pre className="hex-view">{(liveDetail?.hexPreview ?? selected.hexPreview) || 'No bytes in this file.'}</pre>{state.source === 'live' && <div className="pagination"><button className="button-secondary" disabled={hexOffset === 0} onClick={() => setHexOffset((offset) => Math.max(0, offset - 256 * 1024))} type="button">Previous range</button><span>Offset {hexOffset}</span><button className="button-secondary" disabled={hexOffset + 256 * 1024 >= selected.size} onClick={() => setHexOffset((offset) => offset + 256 * 1024)} type="button">Next range</button></div>}</div>
              ) : (liveDetail?.manifest ?? selected.manifest) ? (
                <div className="decoded-stack">
                  <dl className="metadata-grid">
                    <div><dt>Format</dt><dd>v{(liveDetail?.manifest ?? selected.manifest)!.formatVersion}</dd></div>
                    <div><dt>Active WAL</dt><dd>{(liveDetail?.manifest ?? selected.manifest)!.activeWal}</dd></div>
                    <div><dt>Next file</dt><dd>{(liveDetail?.manifest ?? selected.manifest)!.nextFileNumber}</dd></div>
                    <div><dt>Last sequence</dt><dd>{(liveDetail?.manifest ?? selected.manifest)!.lastSequence}</dd></div>
                    <div><dt>CRC32C</dt><dd><Badge tone="success">{(liveDetail?.manifest ?? selected.manifest)!.crc}</Badge></dd></div>
                  </dl>
                  <h4>Referenced tables</h4>
                  {(liveDetail?.manifest ?? selected.manifest)!.tables.length === 0 ? <EmptyState detail="Flush the MemTable to publish the first SSTable." title="No live tables" /> : (liveDetail?.manifest ?? selected.manifest)!.tables.map((table) => (
                    <button className="reference-row" key={table.name} onClick={() => jumpToTable(table.name)} type="button"><span><strong>{table.name}</strong><small>{table.smallestKey} … {table.largestKey}</small></span><code>seq {table.minSequence}–{table.maxSequence}</code><span>Open →</span></button>
                  ))}
                </div>
              ) : (liveDetail?.walRecords ?? selected.walRecords) ? (
                <div className="decoded-stack"><div className="callout"><strong>Active append-only log</strong><span>{(liveDetail?.walRecords ?? selected.walRecords)!.length} record(s), page size 20</span></div>{(liveDetail?.walRecords ?? selected.walRecords)!.length === 0 ? <EmptyState detail="Put or Delete appends a record before MemTable apply." title="WAL is empty" /> : <><div className="record-table"><div className="table-header"><span>Offset</span><span>Sequence</span><span>Type</span><span>Key</span><span>Value</span><span>CRC</span></div>{(liveDetail?.walRecords ?? selected.walRecords)!.map((record) => <div key={`${record.offset}-${record.sequence}`}><code>{record.offset}</code><strong>{record.sequence}</strong><Badge tone={record.type === 'tombstone' ? 'warning' : 'info'}>{record.type}</Badge><code>{record.key}</code><span>{record.error?.message ?? (record.type === 'tombstone' ? '—' : record.value || '(empty)')}</span><Badge tone={record.crc === 'invalid' ? 'danger' : 'success'}>{record.crc}</Badge></div>)}</div><div className="pagination"><button className="button-secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)} type="button">Previous page</button><span>Page {page + 1}</span><button className="button-secondary" disabled={state.source !== 'live' || !liveDetail?.hasMore} onClick={() => setPage((current) => current + 1)} type="button">Next page</button></div></>}</div>
              ) : (liveDetail?.blocks ?? selected.blocks) ? (
                <div className="decoded-stack"><div className="callout"><strong>Immutable block-indexed table</strong><span>{(liveDetail?.blocks ?? selected.blocks)!.length} data block(s), page size 20</span></div>{(liveDetail?.blocks ?? selected.blocks)!.map((block) => <details className="block-card" key={block.index}><summary><span><strong>Data block {block.index}</strong><small>offset {block.offset} · {formatBytes(block.size)}</small></span><code>{block.smallestKey} … {block.largestKey}</code><Badge tone={block.crc === 'invalid' ? 'danger' : 'success'}>CRC {block.crc}</Badge></summary>{block.error ? <div className="inline-error" role="alert">{block.error.message}</div> : <div className="block-entries">{block.entries.map((entry) => <div key={`${entry.keyBase64}-${entry.sequence ?? 'unknown'}`}><code>{entry.key}</code><span>{entry.type === 'tombstone' ? <Badge tone="warning">tombstone</Badge> : entry.value || '(empty value)'}</span><small>{entry.sequence === undefined ? 'sequence unavailable' : `seq ${entry.sequence}`}</small></div>)}</div>}</details>)}<div className="pagination"><button className="button-secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)} type="button">Previous page</button><span>Page {page + 1}</span><button className="button-secondary" disabled={state.source === 'live' ? !liveDetail?.hasMore : true} onClick={() => setPage((current) => current + 1)} type="button">Next page</button></div></div>
              ) : <EmptyState detail={state.source === 'live' ? 'This auxiliary file has no structural decoder; use Range hex for a bounded read.' : 'This file has no decoder in mock mode.'} title="Decoder unavailable" />}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
