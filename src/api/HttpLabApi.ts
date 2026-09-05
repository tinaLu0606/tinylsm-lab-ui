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

function unavailableWorkload(): WorkloadRun {
  return { id: 'workload-unavailable', status: 'idle', config: structuredClone(defaultWorkload), completedOperations: 0 }
}

function unavailableRecovery(): RecoveryScenario[] {
  return [
    { id: 'unclean-shutdown', name: 'Unclean shutdown', description: 'Requires the Goal 4 controlled worker.', expectedOutcome: 'Unavailable in the live Goal 2 server.', mutation: 'No files are changed.', available: false },
    { id: 'truncated-wal', name: 'Truncated WAL tail', description: 'Requires the Goal 4 sandbox copy.', expectedOutcome: 'Unavailable in the live Goal 2 server.', mutation: 'No files are changed.', available: false },
    { id: 'crc-corruption', name: 'CRC corruption', description: 'Requires the Goal 4 sandbox copy.', expectedOutcome: 'Unavailable in the live Goal 2 server.', mutation: 'No files are changed.', available: false },
  ]
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
  private workload = unavailableWorkload()

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
    return this.request('/api/events')
  }

  subscribe(listener: () => void): Unsubscribe {
    const source = new EventSource(`${this.baseUrl}/api/events/stream`)
    source.addEventListener('lab-event', listener)
    return () => source.close()
  }

  async startWorkload(_config: WorkloadConfig): Promise<WorkloadRun> {
    throw new Error('Live workloads are not implemented until Goal 3')
  }

  async pauseWorkload(): Promise<WorkloadRun> {
    throw new Error('Live workloads are not implemented until Goal 3')
  }

  async resumeWorkload(): Promise<WorkloadRun> {
    throw new Error('Live workloads are not implemented until Goal 3')
  }

  async cancelWorkload(): Promise<WorkloadRun> {
    throw new Error('Live workloads are not implemented until Goal 3')
  }

  async getWorkload(): Promise<WorkloadRun> {
    return structuredClone(this.workload)
  }

  async listRecoveryScenarios(): Promise<RecoveryScenario[]> {
    return unavailableRecovery()
  }

  async previewRecovery(_scenarioId: RecoveryScenarioId): Promise<RecoveryRun> {
    throw new Error('Live recovery experiments are not implemented until Goal 4')
  }

  async runRecovery(_scenarioId: RecoveryScenarioId): Promise<RecoveryRun> {
    throw new Error('Live recovery experiments are not implemented until Goal 4')
  }

  async resetRecovery(): Promise<RecoveryRun[]> {
    return []
  }

  async getRecoveryRuns(): Promise<RecoveryRun[]> {
    return []
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
      recoveryRuns: [],
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
}
