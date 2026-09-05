import type { LabApi } from './LabApi'
import { defaultWorkload } from './defaults'
import { decodeBytes, encodeBytes } from './encoding'
import type {
  DatabaseState,
  EncodedBytes,
  ExperimentReport,
  LabEvent,
  LabOptions,
  MetricsSnapshot,
  OperationRequest,
  OperationResult,
  RecoveryRun,
  RecoveryScenario,
  RecoveryScenarioId,
  StorageSnapshot,
  Unsubscribe,
  WorkloadConfig,
  WorkloadRun,
} from './contracts'

interface ErrorBody {
  status?: { code?: string; message?: string; phase?: string }
}

function base64(value?: EncodedBytes): EncodedBytes | undefined {
  if (!value)
    return undefined
  const bytes = decodeBytes(value)
  return { encoding: 'base64', data: encodeBytes(bytes, 'base64'), byteLength: bytes.byteLength }
}

function wireRequest(request: OperationRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const key = base64(request.key)
  const value = base64(request.value)
  const begin = base64(request.begin)
  const end = base64(request.end)
  if (key)
    body.key = key
  if (value)
    body.value = value
  if (begin)
    body.begin = begin
  if (end)
    body.end = end
  return body
}

/** A transport-only LabApi. All state and operation outcomes come from C++. */
export class HttpLabApi implements LabApi {
  private readonly baseUrl: string
  private workload: WorkloadRun = { id: 'workload-idle', status: 'idle', config: structuredClone(defaultWorkload), completedOperations: 0 }
  private recoveryRuns: RecoveryRun[] = []

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async open(path: string, options: LabOptions): Promise<DatabaseState> {
    return this.request('/api/session/open', { method: 'POST', body: { path, options } })
  }

  async close(): Promise<DatabaseState> {
    return this.request('/api/session/close', { method: 'POST', body: {} })
  }

  async reopen(): Promise<DatabaseState> {
    return this.request('/api/session/reopen', { method: 'POST', body: {} })
  }

  async reset(): Promise<DatabaseState> {
    return this.close()
  }

  async execute(request: OperationRequest): Promise<OperationResult> {
    return this.request(`/api/operations/${request.kind}`, { method: 'POST', body: wireRequest(request) })
  }

  async getState(): Promise<DatabaseState> {
    return this.request('/api/session/state')
  }

  async getStorage(): Promise<StorageSnapshot> {
    return this.request('/api/storage/files')
  }

  async getMetrics(): Promise<MetricsSnapshot> {
    return this.request('/api/metrics')
  }

  async getOperations(): Promise<OperationResult[]> {
    return this.request('/api/operations')
  }

  async getEvents(): Promise<LabEvent[]> {
    const page = await this.request<{ events: LabEvent[] }>('/api/events?limit=200')
    return page.events
  }

  subscribe(listener: () => void): Unsubscribe {
    const source = new EventSource(`${this.baseUrl}/api/events/stream`)
    source.addEventListener('lab-event', listener)
    return () => source.close()
  }

  async startWorkload(config: WorkloadConfig): Promise<WorkloadRun> {
    return this.setWorkload(await this.request('/api/workloads', { method: 'POST', body: config }))
  }

  async pauseWorkload(): Promise<WorkloadRun> {
    return this.setWorkload(await this.request(`/api/workloads/${this.workload.id}/pause`, { method: 'POST', body: {} }))
  }

  async resumeWorkload(): Promise<WorkloadRun> {
    return this.setWorkload(await this.request(`/api/workloads/${this.workload.id}/resume`, { method: 'POST', body: {} }))
  }

  async cancelWorkload(): Promise<WorkloadRun> {
    return this.setWorkload(await this.request(`/api/workloads/${this.workload.id}/cancel`, { method: 'POST', body: {} }))
  }

  async getWorkload(): Promise<WorkloadRun> {
    return this.setWorkload(await this.request('/api/workloads/current'))
  }

  async listRecoveryScenarios(): Promise<RecoveryScenario[]> {
    return this.request('/api/recovery/scenarios')
  }

  async previewRecovery(scenarioId: RecoveryScenarioId): Promise<RecoveryRun> {
    return this.setRecoveryRun(await this.request('/api/recovery/experiments', {
      method: 'POST', body: { scenarioId },
    }))
  }

  async runRecovery(scenarioId: RecoveryScenarioId): Promise<RecoveryRun> {
    const preview = [...this.recoveryRuns].reverse().find((run) => run.scenarioId === scenarioId && run.status === 'preview')
    if (!preview)
      throw new Error('Create a recovery preview before running it')
    return this.setRecoveryRun(await this.request(`/api/recovery/experiments/${preview.id}/run`, { method: 'POST', body: {} }))
  }

  async resetRecovery(): Promise<RecoveryRun[]> {
    await this.request('/api/recovery/reset', { method: 'POST', body: {} })
    this.recoveryRuns = []
    return []
  }

  async getRecoveryRuns(): Promise<RecoveryRun[]> {
    this.recoveryRuns = await this.request('/api/recovery/experiments')
    return structuredClone(this.recoveryRuns)
  }

  async exportReport(): Promise<ExperimentReport> {
    const [state, operations, events, metrics] = await Promise.all([
      this.getState(), this.getOperations(), this.getEvents(), this.getMetrics(),
    ])
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'live',
      state,
      operations,
      events,
      metrics,
      workload: await this.getWorkload(),
      recoveryRuns: await this.getRecoveryRuns(),
    }
  }

  async importReport(_report: ExperimentReport): Promise<void> {
    throw new Error('Importing a report cannot alter a live TinyLSM session')
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const body = await response.json() as T & ErrorBody
    if (!response.ok) {
      const detail = body.status
      const prefix = detail?.code ? `${detail.code}: ` : ''
      throw new Error(`${prefix}${detail?.message ?? `HTTP ${response.status}`}`)
    }
    return body
  }

  private setWorkload(workload: WorkloadRun): WorkloadRun {
    this.workload = workload
    return structuredClone(workload)
  }

  private setRecoveryRun(run: RecoveryRun): RecoveryRun {
    const index = this.recoveryRuns.findIndex((candidate) => candidate.id === run.id)
    if (index >= 0)
      this.recoveryRuns[index] = run
    else
      this.recoveryRuns.push(run)
    return structuredClone(run)
  }
}
