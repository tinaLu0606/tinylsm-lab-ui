import { useLab } from '../state/LabContext'
import { Badge } from './Badge'
import { formatBytes, percentage, shortTime } from './format'

export function StateRail({ collapsed, onToggle }: { collapsed: boolean; onToggle(): void }) {
  const { state } = useLab()
  const fill = percentage(state.memtableBytes, state.options.memtableBytes)

  return (
    <aside className={`state-rail ${collapsed ? 'state-rail-collapsed' : ''}`} aria-label="Current database state">
      <button className="rail-toggle" onClick={onToggle} type="button">
        {collapsed ? 'Show live state' : 'Hide'}
      </button>
      {!collapsed && (
        <>
          <div className="rail-heading">
            <div>
              <p className="panel-kicker">Live state</p>
              <h2>Engine snapshot</h2>
            </div>
            <Badge tone="warning">Estimated</Badge>
          </div>
          <div className="memtable-gauge">
            <div className="gauge-label"><span>MemTable owned entries</span><strong>{fill}%</strong></div>
            <div className="gauge-track"><span style={{ width: `${fill}%` }} /></div>
            <small>{formatBytes(state.memtableBytes)} / {formatBytes(state.options.memtableBytes)}</small>
          </div>
          <dl className="state-list">
            <div><dt>Entries in memory</dt><dd>{state.memtableEntries}</dd></div>
            <div><dt>Next sequence</dt><dd>{state.nextSequence}</dd></div>
            <div><dt>Last flushed</dt><dd>{state.lastSequence || '—'}</dd></div>
            <div><dt>Active WAL</dt><dd>{state.activeWal.toString().padStart(6, '0')}.wal</dd></div>
            <div><dt>Live SSTables</dt><dd>{state.tables.length}</dd></div>
            <div><dt>Directory size</dt><dd>{formatBytes(state.directoryBytes)}</dd></div>
            <div><dt>Pending cleanup</dt><dd>{state.pendingCleanup}</dd></div>
            <div><dt>Opened</dt><dd>{shortTime(state.openedAt)}</dd></div>
          </dl>
          <div className="truth-note">
            <strong>Measurement boundary</strong>
            <p>MemTable bytes model owned entry data, not allocator overhead or total process RSS.</p>
          </div>
        </>
      )}
    </aside>
  )
}

