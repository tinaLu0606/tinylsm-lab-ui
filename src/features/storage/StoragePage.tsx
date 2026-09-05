import { useEffect, useMemo, useState } from 'react'

import type { StorageFile } from '../../api/contracts'
import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { formatBytes, shortTime } from '../../components/format'
import { useLab } from '../../state/LabContext'

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
  const selected = useMemo(
    () => storage.files.find((file) => file.name === selectedName) ?? storage.files[0],
    [selectedName, storage.files],
  )

  useEffect(() => setPage(0), [selectedName])

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

              {view === 'hex' ? (
                <div><div className="callout"><strong>Mock range: bytes 0–95</strong><span>A live backend will require offset and length and enforce a response limit.</span></div><pre className="hex-view">{selected.hexPreview || 'No bytes in this file.'}</pre></div>
              ) : selected.manifest ? (
                <div className="decoded-stack">
                  <dl className="metadata-grid">
                    <div><dt>Format</dt><dd>v{selected.manifest.formatVersion}</dd></div>
                    <div><dt>Active WAL</dt><dd>{selected.manifest.activeWal}</dd></div>
                    <div><dt>Next file</dt><dd>{selected.manifest.nextFileNumber}</dd></div>
                    <div><dt>Last sequence</dt><dd>{selected.manifest.lastSequence}</dd></div>
                    <div><dt>CRC32C</dt><dd><Badge tone="success">{selected.manifest.crc}</Badge></dd></div>
                  </dl>
                  <h4>Referenced tables</h4>
                  {selected.manifest.tables.length === 0 ? <EmptyState detail="Flush the MemTable to publish the first SSTable." title="No live tables" /> : selected.manifest.tables.map((table) => (
                    <button className="reference-row" key={table.name} onClick={() => jumpToTable(table.name)} type="button"><span><strong>{table.name}</strong><small>{table.smallestKey} … {table.largestKey}</small></span><code>seq {table.minSequence}–{table.maxSequence}</code><span>Open →</span></button>
                  ))}
                </div>
              ) : selected.walRecords ? (
                <div className="decoded-stack"><div className="callout"><strong>Active append-only log</strong><span>{selected.walRecords.length} record(s), page size 20</span></div>{selected.walRecords.length === 0 ? <EmptyState detail="Put or Delete appends a record before MemTable apply." title="WAL is empty" /> : <><div className="record-table"><div className="table-header"><span>Offset</span><span>Sequence</span><span>Type</span><span>Key</span><span>Value</span><span>CRC</span></div>{selected.walRecords.slice(page * 20, page * 20 + 20).map((record) => <div key={`${record.offset}-${record.sequence}`}><code>{record.offset}</code><strong>{record.sequence}</strong><Badge tone={record.type === 'tombstone' ? 'warning' : 'info'}>{record.type}</Badge><code>{record.key}</code><span>{record.type === 'tombstone' ? '—' : record.value || '(empty)'}</span><Badge tone="success">{record.crc}</Badge></div>)}</div><div className="pagination"><button className="button-secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)} type="button">Previous page</button><span>Page {page + 1} of {Math.ceil(selected.walRecords.length / 20)}</span><button className="button-secondary" disabled={(page + 1) * 20 >= selected.walRecords.length} onClick={() => setPage((current) => current + 1)} type="button">Next page</button></div></>}</div>
              ) : selected.blocks ? (
                <div className="decoded-stack"><div className="callout"><strong>Immutable block-indexed table</strong><span>{selected.blocks.length} data block(s), decoded on demand</span></div>{selected.blocks.map((block) => <details className="block-card" key={block.index}><summary><span><strong>Data block {block.index}</strong><small>offset {block.offset} · {formatBytes(block.size)}</small></span><code>{block.smallestKey} … {block.largestKey}</code><Badge tone="success">CRC {block.crc}</Badge></summary><div className="block-entries">{block.entries.map((entry) => <div key={`${entry.keyBase64}-${entry.sequence ?? 'unknown'}`}><code>{entry.key}</code><span>{entry.type === 'tombstone' ? <Badge tone="warning">tombstone</Badge> : entry.value || '(empty value)'}</span><small>{entry.sequence === undefined ? 'sequence unavailable' : `seq ${entry.sequence}`}</small></div>)}</div></details>)}</div>
              ) : <EmptyState detail={state.source === 'live' ? 'Paged Manifest, WAL, SSTable and range-hex decoding arrives in Goal 3.' : 'This file has no decoder in mock mode.'} title="Decoder unavailable" />}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
