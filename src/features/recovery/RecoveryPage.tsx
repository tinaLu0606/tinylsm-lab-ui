import { useState } from 'react'

import type { RecoveryScenarioId } from '../../api/contracts'
import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { shortTime } from '../../components/format'
import { useLab } from '../../state/LabContext'

export function RecoveryPage() {
  const { recoveryScenarios, recoveryRuns, previewRecovery, runRecovery, resetRecovery } = useLab()
  const [selected, setSelected] = useState<RecoveryScenarioId>('unclean-shutdown')
  const scenario = recoveryScenarios.find((candidate) => candidate.id === selected)
  const run = recoveryRuns.find((candidate) => candidate.scenarioId === selected)

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div><p className="panel-kicker">Sandboxed failure exploration</p><h2>Recovery Lab</h2><p>Preview every destructive action before it touches an isolated experiment copy. Goal 1 is simulation-only.</p></div>
        <Badge tone="warning">Backend unavailable</Badge>
      </section>

      <div className="recovery-layout">
        <section className="scenario-list">
          {recoveryScenarios.map((candidate) => (
            <button className={selected === candidate.id ? 'scenario-card scenario-selected' : 'scenario-card'} key={candidate.id} onClick={() => setSelected(candidate.id)} type="button">
              <span className="scenario-index">0{recoveryScenarios.indexOf(candidate) + 1}</span>
              <span><strong>{candidate.name}</strong><small>{candidate.description}</small></span>
              <Badge tone="warning">Simulated</Badge>
            </button>
          ))}
        </section>

        <section className="panel recovery-detail">
          {!scenario ? <EmptyState detail="Choose a recovery experiment." title="No scenario selected" /> : (
            <>
              <div className="section-heading"><div><p className="panel-kicker">Experiment contract</p><h3>{scenario.name}</h3></div><Badge tone="danger">Sandbox only</Badge></div>
              <div className="recovery-contract">
                <article><span>Planned mutation</span><p>{scenario.mutation}</p></article>
                <article><span>Expected result</span><p>{scenario.expectedOutcome}</p></article>
                <article><span>Safety boundary</span><p>Never modify an arbitrary user path. A live backend must canonicalize a server-created copy first.</p></article>
              </div>
              {!run ? (
                <button onClick={() => void previewRecovery(selected)} type="button">Create preview</button>
              ) : (
                <div className="recovery-preview">
                  <div className="callout callout-warning"><strong>Previewed sandbox</strong><code>{run.sandboxPath}</code><span>No real file has been changed in Mock mode.</span></div>
                  <div className="button-row"><button disabled={run.status === 'passed'} onClick={() => void runRecovery(selected)} type="button">Run simulation</button><button className="button-secondary" onClick={() => void resetRecovery()} type="button">Reset all</button></div>
                  {run.actualOutcome && <div className="oracle-result"><span>✓</span><div><strong>Expected outcome observed</strong><p>{run.actualOutcome}</p></div></div>}
                  {run.events.length > 0 && <div className="mini-event-list">{run.events.map((event) => <div key={event.id}><time>{shortTime(event.timestamp)}</time><Badge tone={event.level === 'warning' ? 'warning' : event.level === 'success' ? 'success' : 'neutral'}>{event.phase}</Badge><span>{event.summary}</span></div>)}</div>}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

