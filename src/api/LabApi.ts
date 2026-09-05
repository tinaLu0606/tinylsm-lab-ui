import type {
  DatabaseState,
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

export interface LabApi {
  open(path: string, options: LabOptions): Promise<DatabaseState>
  close(): Promise<DatabaseState>
  reopen(): Promise<DatabaseState>
  reset(): Promise<DatabaseState>
  execute(request: OperationRequest): Promise<OperationResult>
  getState(): Promise<DatabaseState>
  getStorage(): Promise<StorageSnapshot>
  getMetrics(): Promise<MetricsSnapshot>
  getOperations(): Promise<OperationResult[]>
  getEvents(): Promise<LabEvent[]>
  subscribe(listener: () => void): Unsubscribe
  startWorkload(config: WorkloadConfig): Promise<WorkloadRun>
  pauseWorkload(): Promise<WorkloadRun>
  resumeWorkload(): Promise<WorkloadRun>
  cancelWorkload(): Promise<WorkloadRun>
  getWorkload(): Promise<WorkloadRun>
  listRecoveryScenarios(): Promise<RecoveryScenario[]>
  previewRecovery(scenarioId: RecoveryScenarioId): Promise<RecoveryRun>
  runRecovery(scenarioId: RecoveryScenarioId): Promise<RecoveryRun>
  resetRecovery(): Promise<RecoveryRun[]>
  getRecoveryRuns(): Promise<RecoveryRun[]>
  exportReport(): Promise<ExperimentReport>
  importReport(report: ExperimentReport): Promise<void>
}

