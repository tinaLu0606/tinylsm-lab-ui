export type DataSource = 'mock' | 'live' | 'unavailable'
export type ConnectionState = 'closed' | 'opening' | 'open' | 'error'
export type StatusCode =
  | 'OK'
  | 'NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'IO_ERROR'
  | 'CORRUPTION'
  | 'NOT_SUPPORTED'
  | 'RESOURCE_EXHAUSTED'
  | 'CLOSED'
  | 'INTERNAL_ERROR'

export type Encoding = 'text' | 'hex' | 'base64'
export type OperationKind = 'put' | 'get' | 'delete' | 'scan' | 'compact'
export type EntryType = 'value' | 'tombstone'
export type FileKind = 'manifest' | 'wal' | 'sstable' | 'temporary'
export type FileState = 'active' | 'live' | 'obsolete' | 'orphan' | 'temporary'
export type EventLevel = 'info' | 'success' | 'warning' | 'error'
export type WorkloadStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'
export type WorkloadDistribution = 'sequential' | 'uniform' | 'hotspot'
export type RecoveryScenarioId = 'unclean-shutdown' | 'truncated-wal' | 'crc-corruption'

export interface LabOptions {
  memtableBytes: number
  createIfMissing: boolean
  syncOnWrite: boolean
  maxKeyBytes: number
  maxValueBytes: number
  sstableBlockBytes: number
}

export interface FeatureFlags {
  compact: boolean
  storageInspection: boolean
  resourceMetrics: boolean
  recoveryExperiments: boolean
}

export interface EncodedBytes {
  encoding: Encoding
  data: string
  byteLength?: number
}

export interface TableInfo {
  fileNumber: number
  name: string
  fileSize: number
  smallestKey: string
  largestKey: string
  minSequence: number
  maxSequence: number
  entries?: number
}

export interface DatabaseState {
  source: DataSource
  connection: ConnectionState
  path: string
  options: LabOptions
  openedAt?: string
  memtableBytes: number
  memtableEntries: number
  nextSequence: number
  activeWal: number
  lastSequence: number
  tables: TableInfo[]
  directoryBytes: number
  pendingCleanup: number
  terminalError?: LabStatus
  features: FeatureFlags
}

export interface LabStatus {
  code: StatusCode
  message: string
  operationId?: string
  phase?: string
}

export interface OperationRequest {
  kind: OperationKind
  key?: EncodedBytes
  value?: EncodedBytes
  begin?: EncodedBytes
  end?: EncodedBytes
}

export interface ValueEntry {
  key: string
  value: string
  keyBase64: string
  valueBase64: string
  sequence?: number
  type: EntryType
}

export interface OperationResult {
  operationId: string
  request: OperationRequest
  status: LabStatus
  durationMicros: number
  startedAt: string
  value?: ValueEntry
  entries?: ValueEntry[]
  before: DatabaseState
  after: DatabaseState
}

export interface LabEvent {
  id: string
  operationId: string
  timestamp: string
  level: EventLevel
  phase: string
  summary: string
  file?: string
  durationMicros?: number
}

export interface ManifestView {
  formatVersion: number
  activeWal: number
  nextFileNumber: number
  lastSequence: number
  crc: 'ok' | 'invalid'
  tables: TableInfo[]
}

export interface WalRecordView {
  offset: number
  encodedBytes: number
  sequence: number
  type: EntryType
  key: string
  value: string
  crc: 'ok' | 'invalid'
  error?: LabStatus
}

export interface SstableBlockView {
  index: number
  offset: number
  size: number
  smallestKey: string
  largestKey: string
  entries: ValueEntry[]
  crc: 'ok' | 'invalid'
  error?: LabStatus
}

export interface StorageFile {
  name: string
  kind: FileKind
  state: FileState
  size: number
  modifiedAt: string
  referencedBy?: string
  manifest?: ManifestView
  walRecords?: WalRecordView[]
  blocks?: SstableBlockView[]
  hexPreview: string
}

export interface StorageSnapshot {
  source: DataSource
  files: StorageFile[]
  totalBytes: number
  cursor?: string
  hasMore: boolean
}

export interface MetricPoint {
  timestamp: string
  operationsPerSecond: number
  p50Micros: number
  p95Micros: number
  p99Micros: number
  rssBytes?: number
  cpuPercent?: number
  directoryBytes: number
  manifestBytes?: number
  walBytes?: number
  sstableBytes?: number
  temporaryBytes?: number
  memtableBytes: number
}

export interface MetricsSnapshot {
  source: DataSource
  measuredAt: string
  operationCounts: Record<OperationKind, number>
  errorCount: number
  flushCount: number
  compactionCount: number
  averageFlushMicros: number
  averageCompactionMicros: number
  points: MetricPoint[]
  processMetricsAvailable: boolean
}

export interface WorkloadConfig {
  operationCount: number
  seed: number
  keySpace: number
  valueBytes: number
  putRatio: number
  getRatio: number
  deleteRatio: number
  operationsPerSecond: number
  distribution: WorkloadDistribution
  reopenEvery: number
}

export interface WorkloadRun {
  id: string
  status: WorkloadStatus
  config: WorkloadConfig
  completedOperations: number
  startedAt?: string
  finishedAt?: string
  mismatch?: {
    operation: number
    key: string
    expected: string
    actual: string
  }
  performanceMode?: boolean
}

export interface RecoveryScenario {
  id: RecoveryScenarioId
  name: string
  description: string
  expectedOutcome: string
  mutation: string
  available: boolean
}

export interface RecoveryRun {
  id: string
  scenarioId: RecoveryScenarioId
  status: 'preview' | 'running' | 'passed' | 'failed'
  sandboxPath: string
  expectedOutcome: string
  actualOutcome?: string
  createdAt: string
  events: LabEvent[]
}

export interface ExperimentReport {
  schemaVersion: 1
  exportedAt: string
  source: DataSource
  state: DatabaseState
  operations: OperationResult[]
  events: LabEvent[]
  metrics: MetricsSnapshot
  workload?: WorkloadRun
  recoveryRuns: RecoveryRun[]
}

export interface Unsubscribe {
  (): void
}
