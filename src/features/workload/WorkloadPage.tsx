import { useEffect, useState } from 'react'

import { defaultWorkload } from '../../api/defaults'
import type { WorkloadConfig } from '../../api/contracts'
import { Badge } from '../../components/Badge'
import { formatMicros, percentage, shortTime } from '../../components/format'
import { useLab } from '../../state/LabContext'

export function WorkloadPage() {
  const { state, workload, metrics, startWorkload, pauseWorkload, resumeWorkload, cancelWorkload } = useLab()
  const [config, setConfig] = useState<WorkloadConfig>(defaultWorkload)
  const ratioTotal = config.putRatio + config.getRatio + config.deleteRatio
  const progress = percentage(workload.completedOperations, workload.config.operationCount)
  const active = workload.status === 'running' || workload.status === 'paused'

  useEffect(() => {
    if (workload.status !== 'idle')
      setConfig(workload.config)
  }, [workload])

  const setNumber = (key: keyof WorkloadConfig, value: string) => {
    setConfig((current) => ({ ...current, [key]: Number(value) }))
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div><p className="panel-kicker">Deterministic model experiment</p><h2>Workload runner</h2><p>{state.source === 'live' ? 'The C++ server generates the seeded operation stream and validates the final ordered Scan against its reference map.' : 'Goal 1 simulates execution; reference-map validation becomes authoritative with the C++ backend.'}</p></div>
        <Badge tone={active ? 'info' : workload.status === 'completed' ? 'success' : 'warning'}>{workload.status}</Badge>
      </section>

      <div className="workload-layout">
        <section className="panel workload-config">
          <div className="section-heading"><div><p className="panel-kicker">Configuration</p><h3>Repeatable inputs</h3></div><button className="button-link" onClick={() => setConfig(defaultWorkload)} type="button">Restore defaults</button></div>
          <div className="form-grid">
            <label>Operations<input disabled={active} min="1" onChange={(event) => setNumber('operationCount', event.target.value)} type="number" value={config.operationCount} /></label>
            <label>Seed<input disabled={active} onChange={(event) => setNumber('seed', event.target.value)} type="number" value={config.seed} /></label>
            <label>Key space<input disabled={active} min="1" onChange={(event) => setNumber('keySpace', event.target.value)} type="number" value={config.keySpace} /></label>
            <label>Value bytes<input disabled={active} min="0" onChange={(event) => setNumber('valueBytes', event.target.value)} type="number" value={config.valueBytes} /></label>
            <label>Operations / sec<input disabled={active} min="1" onChange={(event) => setNumber('operationsPerSecond', event.target.value)} type="number" value={config.operationsPerSecond} /></label>
            <label>Reopen every<input disabled={active} min="0" onChange={(event) => setNumber('reopenEvery', event.target.value)} type="number" value={config.reopenEvery} /></label>
            <label>Distribution<select disabled={active} onChange={(event) => setConfig((current) => ({ ...current, distribution: event.target.value as WorkloadConfig['distribution'] }))} value={config.distribution}><option value="sequential">Sequential</option><option value="uniform">Uniform random</option><option value="hotspot">80/20 hotspot</option></select></label>
          </div>
          <fieldset className="ratio-fieldset"><legend>Operation mix</legend><label>Put<input disabled={active} max="100" min="0" onChange={(event) => setNumber('putRatio', event.target.value)} type="number" value={config.putRatio} />%</label><label>Get<input disabled={active} max="100" min="0" onChange={(event) => setNumber('getRatio', event.target.value)} type="number" value={config.getRatio} />%</label><label>Delete<input disabled={active} max="100" min="0" onChange={(event) => setNumber('deleteRatio', event.target.value)} type="number" value={config.deleteRatio} />%</label><Badge tone={ratioTotal === 100 ? 'success' : 'danger'}>{ratioTotal}% total</Badge></fieldset>
          <div className="button-row">
            {!active && <button disabled={state.connection !== 'open' || ratioTotal !== 100} onClick={() => void startWorkload(config)} type="button">Start workload</button>}
            {workload.status === 'running' && <button className="button-secondary" onClick={() => void pauseWorkload()} type="button">Pause</button>}
            {workload.status === 'paused' && <button onClick={() => void resumeWorkload()} type="button">Resume</button>}
            {active && <button className="button-danger" onClick={() => void cancelWorkload()} type="button">Cancel</button>}
          </div>
          {state.connection !== 'open' && <p className="form-hint">Open a {state.source} database session before starting.</p>}
        </section>

        <section className="panel workload-progress">
          <div className="section-heading"><div><p className="panel-kicker">Run {workload.id}</p><h3>{workload.status === 'idle' ? 'No run started' : `${progress}% complete`}</h3></div><Badge tone={state.source === 'live' ? 'success' : 'warning'}>{state.source === 'live' ? 'C++ reference map' : 'Mock oracle'}</Badge></div>
          <div className="large-progress"><span style={{ width: `${progress}%` }} /></div>
          <dl className="metadata-grid workload-stats">
            <div><dt>Completed</dt><dd>{workload.completedOperations} / {workload.config.operationCount}</dd></div>
            <div><dt>Seed</dt><dd>{workload.config.seed}</dd></div>
            <div><dt>Started</dt><dd>{shortTime(workload.startedAt)}</dd></div>
            <div><dt>Finished</dt><dd>{shortTime(workload.finishedAt)}</dd></div>
            <div><dt>Errors</dt><dd>{metrics.errorCount}</dd></div>
            <div><dt>Average flush</dt><dd>{formatMicros(metrics.averageFlushMicros)}</dd></div>
          </dl>
          <div className={`oracle-result ${workload.mismatch ? 'oracle-failed' : ''}`}>
            <span aria-hidden="true">{workload.mismatch ? '!' : '✓'}</span>
            <div><strong>{workload.mismatch ? 'First mismatch captured' : 'No model mismatch observed'}</strong><p>{workload.mismatch ? `${workload.mismatch.key}: expected ${workload.mismatch.expected}, received ${workload.mismatch.actual}` : state.source === 'live' ? 'The final full Scan matched the server-side ordered reference map.' : 'Mock mode uses a deterministic model.'}</p></div>
          </div>
          <div className="truth-note"><strong>Performance mode</strong><p>Detailed per-operation persistence will be disabled for live high-rate workloads. The mock retains bounded UI evidence only.</p></div>
        </section>
      </div>
    </div>
  )
}
