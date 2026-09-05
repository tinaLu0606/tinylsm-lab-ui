import { type ChangeEvent, useEffect, useMemo, useState } from 'react'

import type { ExperimentReport, OperationRequest } from '../../api/contracts'
import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { formatBytes, shortTime } from '../../components/format'
import { useLab } from '../../state/LabContext'
import { loadRecentReports, saveRecentReport } from '../../state/persistence'

function commandFor(request: OperationRequest): string {
  const data = (field?: { data: string }) => JSON.stringify(field?.data ?? '')
  if (request.kind === 'put')
    return `PUT ${data(request.key)} ${data(request.value)}`
  if (request.kind === 'get')
    return `GET ${data(request.key)}`
  if (request.kind === 'delete')
    return `DELETE ${data(request.key)}`
  if (request.kind === 'scan')
    return `SCAN ${data(request.begin)} ${data(request.end)}`
  return 'COMPACT'
}

function downloadReport(report: ExperimentReport): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `tinylsm-lab-${report.exportedAt.replaceAll(/[:.]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const { state, operations, exportReport, importReport } = useLab()
  const [recent, setRecent] = useState<ExperimentReport[]>([])
  const [notice, setNotice] = useState<string>()
  const reproduction = useMemo(() => operations.slice().reverse().map((operation) => commandFor(operation.request)).join('\n'), [operations])

  useEffect(() => {
    void loadRecentReports().then(setRecent)
  }, [])

  const handleExport = async () => {
    const report = await exportReport()
    if (!report)
      return
    await saveRecentReport(report)
    setRecent(await loadRecentReports())
    downloadReport(report)
    setNotice('Experiment exported and retained in this browser.')
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file)
      return
    try {
      const report = JSON.parse(await file.text()) as ExperimentReport
      await importReport(report)
      await saveRecentReport(report)
      setRecent(await loadRecentReports())
      setNotice(`Imported ${file.name} in disconnected report mode.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not import report')
    } finally {
      event.target.value = ''
    }
  }

  const copyReproduction = async () => {
    await navigator.clipboard.writeText(reproduction)
    setNotice('Reproduction steps copied.')
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div><p className="panel-kicker">Portable experiment evidence</p><h2>Reports & replay</h2><p>Export options, operations, state snapshots, metrics and recovery evidence as one versioned artifact.</p></div>
        <Badge tone="info">Schema v1</Badge>
      </section>

      {notice && <div className="callout" role="status"><strong>Report status</strong><span>{notice}</span></div>}

      <div className="reports-layout">
        <section className="panel">
          <div className="section-heading"><div><p className="panel-kicker">Current session</p><h3>Export experiment</h3></div><Badge tone={state.source === 'live' ? 'success' : 'warning'}>{state.source} source</Badge></div>
          <p className="muted-copy">The report includes bounded operation/event history, state, metrics, workload configuration and recovery previews.</p>
          <div className="button-row"><button onClick={() => void handleExport()} type="button">Export JSON</button><label className="button-secondary file-input-button">Import JSON<input accept="application/json,.json" disabled={state.source === 'live'} onChange={(event) => void handleImport(event)} type="file" /></label></div>
        </section>

        <section className="panel">
          <div className="section-heading"><div><p className="panel-kicker">Bug report seed</p><h3>Reproduction steps</h3></div><span className="muted-copy">{operations.length} operation(s)</span></div>
          {reproduction ? <><pre className="reproduction-view">{reproduction}</pre><button className="button-secondary" onClick={() => void copyReproduction()} type="button">Copy steps</button></> : <EmptyState detail="Run operations in Playground to generate a replayable sequence." title="Nothing to reproduce" />}
        </section>
      </div>

      <section className="panel">
        <div className="section-heading"><div><p className="panel-kicker">IndexedDB retention</p><h3>Recent browser reports</h3></div><span className="muted-copy">Maximum 8 exports</span></div>
        {recent.length === 0 ? <EmptyState detail="Exported or imported reports are retained locally in this browser." title="No retained reports" /> : (
          <div className="report-list">
            {recent.map((report) => (
              <article key={report.exportedAt}>
                <span className="report-icon">R</span>
                <div><strong>{report.state.path.split('/').at(-1)}</strong><small>{shortTime(report.exportedAt)} · {report.operations.length} operations · {formatBytes(report.state.directoryBytes)}</small></div>
                <Badge tone={report.source === 'mock' ? 'warning' : 'success'}>{report.source}</Badge>
                <button className="button-link" onClick={() => void importReport(report)} type="button">Open report</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
