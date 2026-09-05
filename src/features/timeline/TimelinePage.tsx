import { useMemo, useState } from 'react'

import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { formatBytes, formatMicros, shortTime } from '../../components/format'
import { useLab } from '../../state/LabContext'

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 420
  const height = 100
  const max = Math.max(...values, 1)
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width
    const y = height - (value / max) * (height - 8) - 4
    return `${x},${y}`
  }).join(' ')
  return (
    <svg aria-label={label} className="sparkline" role="img" viewBox={`0 0 ${width} ${height}`}>
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} />
      {points && <polyline fill="none" points={points} />}
    </svg>
  )
}

export function TimelinePage() {
  const { events, metrics, state } = useLab()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const filtered = useMemo(() => events.filter((event) => {
    const matchesQuery = `${event.phase} ${event.summary} ${event.file ?? ''} ${event.operationId}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (level === 'all' || event.level === level)
  }), [events, level, query])
  const totalOperations = Object.values(metrics.operationCounts).reduce((sum, count) => sum + count, 0)
  const latestPoint = metrics.points.at(-1)

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div><p className="panel-kicker">Lifecycle evidence</p><h2>Timeline & resources</h2><p>Correlate user operations with WAL, MemTable, Flush, Manifest and Compaction phases.</p></div>
        <Badge tone="warning">Simulated metrics</Badge>
      </section>

      <section className="metric-grid">
        <article className="metric-card"><span>Total operations</span><strong>{totalOperations}</strong><small>{metrics.errorCount} error outcomes</small></article>
        <article className="metric-card"><span>Mock throughput</span><strong>{latestPoint?.operationsPerSecond ?? 0}</strong><small>operations / second</small></article>
        <article className="metric-card"><span>P95 engine latency</span><strong>{formatMicros(latestPoint?.p95Micros ?? 0)}</strong><small>deterministic mock value</small></article>
        <article className="metric-card"><span>Directory footprint</span><strong>{formatBytes(state.directoryBytes)}</strong><small>Manifest + WAL + SSTables</small></article>
        <article className="metric-card"><span>Flush / Compact</span><strong>{metrics.flushCount} / {metrics.compactionCount}</strong><small>{formatMicros(metrics.averageFlushMicros)} avg flush</small></article>
        <article className="metric-card metric-unavailable"><span>Process RSS / CPU</span><strong>Unavailable</strong><small>Requires the C++ Lab Server</small></article>
      </section>

      <div className="two-column-grid chart-grid">
        <section className="panel chart-card"><div className="section-heading"><div><p className="panel-kicker">Bounded series</p><h3>Latency trend</h3></div><span className="muted-copy">Last {metrics.points.length} / 120 points</span></div><Sparkline label="Mock p95 latency trend" values={metrics.points.map((point) => point.p95Micros)} /><div className="chart-legend"><span><i className="legend-green" /> P95 µs</span><span>Mock, not measured</span></div></section>
        <section className="panel chart-card"><div className="section-heading"><div><p className="panel-kicker">Storage pressure</p><h3>MemTable trend</h3></div><span className="muted-copy">Flush threshold {formatBytes(state.options.memtableBytes)}</span></div><Sparkline label="Mock MemTable bytes trend" values={metrics.points.map((point) => point.memtableBytes)} /><div className="chart-legend"><span><i className="legend-gold" /> Owned-entry estimate</span><span>Allocator overhead excluded</span></div></section>
      </div>

      <section className="panel timeline-panel">
        <div className="section-heading">
          <div><p className="panel-kicker">Detailed manual-operation events</p><h3>Engine lifecycle</h3></div>
          <div className="filter-row"><input aria-label="Filter timeline" onChange={(event) => setQuery(event.target.value)} placeholder="Filter operation, phase, file…" value={query} /><select aria-label="Filter event level" onChange={(event) => setLevel(event.target.value)} value={level}><option value="all">All levels</option><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Error</option></select></div>
        </div>
        {filtered.length === 0 ? <EmptyState detail="Run operations in Playground or clear the current filters." title="No timeline events" /> : (
          <div className="timeline-list compact-scroll">
            {filtered.slice(0, 200).map((event) => (
              <article key={event.id}>
                <span className={`timeline-dot timeline-${event.level}`} />
                <time>{shortTime(event.timestamp)}</time>
                <div><div><Badge tone={event.level === 'error' ? 'danger' : event.level === 'warning' ? 'warning' : event.level === 'success' ? 'success' : 'neutral'}>{event.phase}</Badge><code>{event.operationId}</code></div><strong>{event.summary}</strong>{event.file && <small>file · {event.file}</small>}</div>
                <small>{event.durationMicros ? formatMicros(event.durationMicros) : '—'}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

