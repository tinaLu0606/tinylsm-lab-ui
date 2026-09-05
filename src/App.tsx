import { useEffect, useState } from 'react'

import { EventDock } from './components/EventDock'
import { SessionBar } from './components/SessionBar'
import { StateRail } from './components/StateRail'
import { PlaygroundPage } from './features/playground/PlaygroundPage'
import { RecoveryPage } from './features/recovery/RecoveryPage'
import { ReportsPage } from './features/reports/ReportsPage'
import { StoragePage } from './features/storage/StoragePage'
import { TimelinePage } from './features/timeline/TimelinePage'
import { WorkloadPage } from './features/workload/WorkloadPage'
import { useLab } from './state/LabContext'
import { loadPreferences, savePreferences } from './state/persistence'

const sections = [
  { id: 'playground', label: 'Playground', hint: 'Operate' },
  { id: 'storage', label: 'Storage', hint: 'Inspect' },
  { id: 'timeline', label: 'Timeline', hint: 'Observe' },
  { id: 'workload', label: 'Workload', hint: 'Measure' },
  { id: 'recovery', label: 'Recovery', hint: 'Break safely' },
  { id: 'reports', label: 'Reports', hint: 'Reproduce' },
] as const

type SectionId = (typeof sections)[number]['id']

function pageFor(section: SectionId) {
  switch (section) {
    case 'playground': return <PlaygroundPage />
    case 'storage': return <StoragePage />
    case 'timeline': return <TimelinePage />
    case 'workload': return <WorkloadPage />
    case 'recovery': return <RecoveryPage />
    case 'reports': return <ReportsPage />
  }
}

function App() {
  const { error, clearError, loading, state } = useLab()
  const [active, setActive] = useState<SectionId>('playground')
  const [stateCollapsed, setStateCollapsed] = useState(false)

  useEffect(() => {
    void loadPreferences().then((preferences) => {
      if (!preferences)
        return
      if (sections.some((section) => section.id === preferences.activeSection))
        setActive(preferences.activeSection as SectionId)
      setStateCollapsed(preferences.statePanelCollapsed)
    })
  }, [])

  useEffect(() => {
    void savePreferences({ activeSection: active, eventFilter: '', statePanelCollapsed: stateCollapsed })
  }, [active, stateCollapsed])

  return (
    <div className="app-shell">
      <SessionBar />
      {error && <div className="global-error" role="alert"><span><strong>Request failed</strong>{error}</span><button aria-label="Dismiss error" onClick={clearError} type="button">×</button></div>}
      {state.source === 'mock' ? (
        <div className="mock-disclosure"><strong>Deterministic frontend simulation</strong><span>No request reaches TinyLSM. Values marked Mock or Unavailable are never real engine measurements.</span></div>
      ) : (
        <div className="live-disclosure"><strong>Live TinyLSM session</strong><span>State, paged storage decoding, bounded operation logs, workload validation, process metrics and sandboxed recovery experiments come from the local C++ Lab Server.</span></div>
      )}
      <div className="app-grid">
        <nav className="primary-nav" aria-label="Lab sections">
          {sections.map((section, index) => (
            <button aria-current={active === section.id ? 'page' : undefined} className={active === section.id ? 'nav-item nav-item-active' : 'nav-item'} key={section.id} onClick={() => setActive(section.id)} type="button">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{section.label}</strong>
              <small>{section.hint}</small>
            </button>
          ))}
        </nav>
        <main className="main-content" id="main-content" tabIndex={-1}>
          {loading && <div className="loading-bar" role="progressbar"><span /></div>}
          {pageFor(active)}
        </main>
        <StateRail collapsed={stateCollapsed} onToggle={() => setStateCollapsed((value) => !value)} />
      </div>
      <EventDock />
    </div>
  )
}

export default App
