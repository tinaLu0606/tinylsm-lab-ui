import { useMemo, useState } from 'react'

import { useLab } from '../state/LabContext'
import { Badge } from './Badge'
import { formatMicros, shortTime } from './format'
import { VirtualList } from './VirtualList'

export function EventDock() {
  const { events } = useLab()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const visible = useMemo(
    () => events.filter((event) => `${event.phase} ${event.summary} ${event.file ?? ''}`.toLowerCase().includes(filter.toLowerCase())),
    [events, filter],
  )

  return (
    <section className={`event-dock ${open ? 'event-dock-open' : ''}`} aria-label="Operation event log">
      <button className="event-dock-toggle" onClick={() => setOpen((value) => !value)} type="button">
        <span><strong>Event log</strong><small>{events.length} retained mock events</small></span>
        <span>{open ? 'Close' : 'Open'}</span>
      </button>
      {open && (
        <div className="event-dock-body">
          <label className="filter-field">
            <span>Filter phase, file, or message</span>
            <input onChange={(event) => setFilter(event.target.value)} placeholder="wal.sync" value={filter} />
          </label>
          {visible.length === 0 ? <p className="muted-copy">No events match this filter.</p> : (
          <VirtualList className="event-list compact-scroll" height={320} itemHeight={58} items={visible} itemKey={(event) => event.id} renderItem={(event) => (
              <article className="event-row" key={event.id}>
                <time>{shortTime(event.timestamp)}</time>
                <Badge tone={event.level === 'error' ? 'danger' : event.level === 'warning' ? 'warning' : event.level === 'success' ? 'success' : 'neutral'}>
                  {event.phase}
                </Badge>
                <span>{event.summary}</span>
                <code>{event.operationId}</code>
                <small>{event.durationMicros ? formatMicros(event.durationMicros) : '—'}</small>
              </article>
            )} />
          )}
        </div>
      )}
    </section>
  )
}
