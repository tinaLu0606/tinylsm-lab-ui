import { useEffect, useState } from 'react'

import type { LabOptions } from '../api/contracts'
import { useLab } from '../state/LabContext'
import { Badge } from './Badge'

export function SessionBar() {
  const { state, loading, open, close, reopen, reset } = useLab()
  const [path, setPath] = useState(state.path)
  const [options, setOptions] = useState<LabOptions>(state.options)
  const isOpen = state.connection === 'open'

  useEffect(() => {
    setPath(state.path)
    setOptions(state.options)
  }, [state.path, state.options])

  const setNumber = (key: keyof LabOptions, value: string) => {
    setOptions((current) => ({ ...current, [key]: Number(value) }))
  }

  return (
    <header className="session-bar">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">TL</span>
        <div>
          <p className="eyebrow">Storage engine observability</p>
          <h1>TinyLSM Lab</h1>
        </div>
      </div>

      <div className="session-controls">
        <label className="path-field">
          <span>Experiment directory</span>
          <input
            aria-label="Experiment directory"
            disabled={isOpen}
            onChange={(event) => setPath(event.target.value)}
            value={path}
          />
        </label>
        <div className="session-actions">
          {isOpen ? (
            <>
              <button className="button-secondary" disabled={loading} onClick={() => void reopen()} type="button">
                Reopen
              </button>
              <button disabled={loading} onClick={() => void close()} type="button">Close</button>
            </>
          ) : (
            <button disabled={loading} onClick={() => void open(path, options)} type="button">
              Open mock session
            </button>
          )}
          <details className="options-menu">
            <summary>Options</summary>
            <div className="options-popover">
              <p className="panel-kicker">Open options</p>
              <label>
                MemTable bytes
                <input min="1" onChange={(event) => setNumber('memtableBytes', event.target.value)} type="number" value={options.memtableBytes} />
              </label>
              <label>
                SSTable block bytes
                <input min="1" onChange={(event) => setNumber('sstableBlockBytes', event.target.value)} type="number" value={options.sstableBlockBytes} />
              </label>
              <label>
                Max key bytes
                <input min="1" onChange={(event) => setNumber('maxKeyBytes', event.target.value)} type="number" value={options.maxKeyBytes} />
              </label>
              <label>
                Max value bytes
                <input min="1" onChange={(event) => setNumber('maxValueBytes', event.target.value)} type="number" value={options.maxValueBytes} />
              </label>
              <label className="check-row">
                <input checked={options.syncOnWrite} onChange={(event) => setOptions((current) => ({ ...current, syncOnWrite: event.target.checked }))} type="checkbox" />
                Sync WAL on every write
              </label>
              <button className="button-danger button-small" onClick={() => void reset()} type="button">
                Reset mock data
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="connection-stack">
        <Badge tone="warning">MOCK DATA</Badge>
        <span className={`connection-dot connection-${state.connection}`}>
          {state.connection === 'open' ? 'Session open' : 'Session closed'}
        </span>
      </div>
    </header>
  )
}

