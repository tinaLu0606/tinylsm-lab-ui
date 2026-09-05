import type { LabApi } from './LabApi'
import { defaultOptions, defaultWorkload } from './defaults'
import { byteKey, decodeBytes, displayBytes, encodeBytes } from './encoding'
import type {
  DatabaseState,
  EncodedBytes,
  EntryType,
  ExperimentReport,
  LabEvent,
  LabOptions,
  LabStatus,
  MetricsSnapshot,
  OperationKind,
  OperationRequest,
  OperationResult,
  RecoveryRun,
  RecoveryScenario,
  RecoveryScenarioId,
  SstableBlockView,
  StorageFile,
  StorageSnapshot,
  TableInfo,
  Unsubscribe,
  ValueEntry,
  WalRecordView,
  WorkloadConfig,
  WorkloadRun,
} from './contracts'

interface MockEntry {
  key: Uint8Array
  value: Uint8Array
  sequence: number
  type: EntryType
}

interface MockTable {
  info: TableInfo
  entries: MockEntry[]
  blocks: SstableBlockView[]
}

const recoveryScenarios: RecoveryScenario[] = [
  {
    id: 'unclean-shutdown',
    name: 'Unclean shutdown',
    description: 'Stop a worker without DB::Close(), then replay the active WAL.',
    expectedOutcome: 'Acknowledged WAL records are recovered and the database reopens.',
    mutation: 'Terminate only a disposable worker process; no file bytes are edited.',
    available: false,
  },
  {
    id: 'truncated-wal',
    name: 'Truncated WAL tail',
    description: 'Copy the session and remove bytes from the final WAL record.',
    expectedOutcome: 'The valid prefix is replayed and the incomplete tail is truncated.',
    mutation: 'Truncate the active WAL inside a canonicalized sandbox copy.',
    available: false,
  },
  {
    id: 'crc-corruption',
    name: 'CRC corruption',
    description: 'Flip one controlled byte in a copied WAL, Manifest, or SSTable.',
    expectedOutcome: 'Open or read reports Corruption without silently accepting bytes.',
    mutation: 'Flip one byte inside a canonicalized sandbox copy.',
    available: false,
  },
]

function clone<T>(value: T): T {
  return structuredClone(value)
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index])
      return left[index] - right[index]
  }
  return left.length - right.length
}

function status(
  code: LabStatus['code'],
  message: string,
  operationId?: string,
  phase?: string,
): LabStatus {
  return { code, message, operationId, phase }
}

function valueEntry(entry: MockEntry): ValueEntry {
  return {
    key: displayBytes(entry.key),
    value: entry.type === 'tombstone' ? '' : displayBytes(entry.value),
    keyBase64: encodeBytes(entry.key, 'base64'),
    valueBase64: encodeBytes(entry.value, 'base64'),
    sequence: entry.sequence,
    type: entry.type,
  }
}

function hexPreview(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return encodeBytes(bytes.slice(0, 96), 'hex')
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

export class MockLabApi implements LabApi {
  private options = clone(defaultOptions)
  private connection: DatabaseState['connection'] = 'closed'
  private path = '/tmp/tinylsm-lab/session-demo'
  private openedAt: string | undefined
  private nextSequence = 1
  private activeWal = 1
  private nextFileNumber = 2
  private lastSequence = 0
  private memtable = new Map<string, MockEntry>()
  private visible = new Map<string, MockEntry>()
  private walRecords: MockEntry[] = []
  private tables: MockTable[] = []
  private obsoleteFiles: StorageFile[] = []
  private operations: OperationResult[] = []
  private events: LabEvent[] = []
  private recoveryRuns: RecoveryRun[] = []
  private listeners = new Set<() => void>()
  private counts: Record<OperationKind, number> = {
    put: 0,
    get: 0,
    delete: 0,
    scan: 0,
    compact: 0,
  }
  private errorCount = 0
  private flushCount = 0
  private compactionCount = 0
  private flushMicros = 0
  private compactionMicros = 0
  private metricPoints: MetricsSnapshot['points'] = []
  private clockMillis = Date.parse('2026-09-04T09:00:00.000Z')
  private idCounter = 0
  private workload: WorkloadRun = {
    id: 'workload-idle',
    status: 'idle',
    config: clone(defaultWorkload),
    completedOperations: 0,
  }
  private workloadTimer?: ReturnType<typeof setInterval>
  private workloadRandom = seededRandom(defaultWorkload.seed)

  async open(path: string, options: LabOptions): Promise<DatabaseState> {
    if (!path.trim())
      throw new Error('Database path is required')
    if (options.memtableBytes <= 0 || options.sstableBlockBytes <= 0)
      throw new Error('MemTable and SSTable block sizes must be positive')

    this.path = path.trim()
    this.options = clone(options)
    this.connection = 'open'
    this.openedAt = this.tick()
    this.emit('session', `Opened mock database at ${this.path}`, 'success')
    this.recordMetric(0)
    this.notify()
    return this.snapshot()
  }

  async close(): Promise<DatabaseState> {
    this.connection = 'closed'
    this.stopWorkloadTimer()
    this.emit('session', 'Closed database session', 'info')
    this.notify()
    return this.snapshot()
  }

  async reopen(): Promise<DatabaseState> {
    this.connection = 'open'
    this.openedAt = this.tick()
    this.emit('recovery', `Replayed ${this.walRecords.length} active WAL records`, 'success')
    this.notify()
    return this.snapshot()
  }

  async reset(): Promise<DatabaseState> {
    this.stopWorkloadTimer()
    this.connection = 'closed'
    this.openedAt = undefined
    this.nextSequence = 1
    this.activeWal = 1
    this.nextFileNumber = 2
    this.lastSequence = 0
    this.memtable.clear()
    this.visible.clear()
    this.walRecords = []
    this.tables = []
    this.obsoleteFiles = []
    this.operations = []
    this.events = []
    this.recoveryRuns = []
    this.counts = { put: 0, get: 0, delete: 0, scan: 0, compact: 0 }
    this.errorCount = 0
    this.flushCount = 0
    this.compactionCount = 0
    this.flushMicros = 0
    this.compactionMicros = 0
    this.metricPoints = []
    this.workload = {
      id: 'workload-idle',
      status: 'idle',
      config: clone(defaultWorkload),
      completedOperations: 0,
    }
    this.notify()
    return this.snapshot()
  }

  async execute(request: OperationRequest): Promise<OperationResult> {
    const operationId = this.nextId('op')
    const startedAt = this.tick()
    const before = this.snapshot()
    let operationStatus = status('OK', 'Operation completed', operationId)
    let value: ValueEntry | undefined
    let entries: ValueEntry[] | undefined
    const durationMicros = 110 + this.idCounter * 37

    if (this.connection !== 'open') {
      operationStatus = status('CLOSED', 'Open a database session first', operationId, 'validate')
    } else {
      try {
        const result = this.applyOperation(request, operationId)
        operationStatus = result.operationStatus
        value = result.value
        entries = result.entries
      } catch (error) {
        operationStatus = status(
          'INVALID_ARGUMENT',
          error instanceof Error ? error.message : 'Invalid operation input',
          operationId,
          'validate',
        )
      }
    }

    this.counts[request.kind] += 1
    if (operationStatus.code !== 'OK') {
      this.errorCount += 1
      this.emit('operation', operationStatus.message, 'error', operationId)
    } else {
      this.emit('operation', `${request.kind.toUpperCase()} completed`, 'success', operationId)
    }

    const result: OperationResult = {
      operationId,
      request: clone(request),
      status: operationStatus,
      durationMicros,
      startedAt,
      value,
      entries,
      before,
      after: this.snapshot(),
    }
    this.operations = [result, ...this.operations].slice(0, 10_000)
    this.recordMetric(durationMicros)
    this.notify()
    return clone(result)
  }

  async getState(): Promise<DatabaseState> {
    return this.snapshot()
  }

  async getStorage(): Promise<StorageSnapshot> {
    const files = this.storageFiles()
    return {
      source: 'mock',
      files: clone(files),
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      hasMore: false,
    }
  }

  async getMetrics(): Promise<MetricsSnapshot> {
    return {
      source: 'mock',
      measuredAt: this.isoNow(),
      operationCounts: clone(this.counts),
      errorCount: this.errorCount,
      flushCount: this.flushCount,
      compactionCount: this.compactionCount,
      averageFlushMicros: this.flushCount === 0 ? 0 : this.flushMicros / this.flushCount,
      averageCompactionMicros:
        this.compactionCount === 0 ? 0 : this.compactionMicros / this.compactionCount,
      points: clone(this.metricPoints),
      processMetricsAvailable: false,
    }
  }

  async getOperations(): Promise<OperationResult[]> {
    return clone(this.operations)
  }

  async getEvents(): Promise<LabEvent[]> {
    return clone(this.events)
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async startWorkload(config: WorkloadConfig): Promise<WorkloadRun> {
    if (this.connection !== 'open')
      throw new Error('Open a database before starting a workload')
    if (config.putRatio + config.getRatio + config.deleteRatio !== 100)
      throw new Error('Put, Get, and Delete ratios must total 100')

    this.stopWorkloadTimer()
    this.workloadRandom = seededRandom(config.seed)
    this.workload = {
      id: this.nextId('workload'),
      status: 'running',
      config: clone(config),
      completedOperations: 0,
      startedAt: this.tick(),
    }
    this.emit('workload', `Started deterministic workload with seed ${config.seed}`, 'info')
    this.scheduleWorkload()
    this.notify()
    return clone(this.workload)
  }

  async pauseWorkload(): Promise<WorkloadRun> {
    if (this.workload.status === 'running') {
      this.workload.status = 'paused'
      this.stopWorkloadTimer()
      this.emit('workload', 'Paused workload', 'warning')
      this.notify()
    }
    return clone(this.workload)
  }

  async resumeWorkload(): Promise<WorkloadRun> {
    if (this.workload.status === 'paused') {
      this.workload.status = 'running'
      this.emit('workload', 'Resumed workload', 'info')
      this.scheduleWorkload()
      this.notify()
    }
    return clone(this.workload)
  }

  async cancelWorkload(): Promise<WorkloadRun> {
    if (this.workload.status === 'running' || this.workload.status === 'paused') {
      this.workload.status = 'cancelled'
      this.workload.finishedAt = this.tick()
      this.stopWorkloadTimer()
      this.emit('workload', 'Cancelled workload', 'warning')
      this.notify()
    }
    return clone(this.workload)
  }

  async getWorkload(): Promise<WorkloadRun> {
    return clone(this.workload)
  }

  async listRecoveryScenarios(): Promise<RecoveryScenario[]> {
    return clone(recoveryScenarios)
  }

  async previewRecovery(scenarioId: RecoveryScenarioId): Promise<RecoveryRun> {
    const scenario = this.requireScenario(scenarioId)
    const run: RecoveryRun = {
      id: this.nextId('recovery'),
      scenarioId,
      status: 'preview',
      sandboxPath: `/tmp/tinylsm-lab/recovery/${scenarioId}-${this.idCounter}`,
      expectedOutcome: scenario.expectedOutcome,
      createdAt: this.tick(),
      events: [],
    }
    this.recoveryRuns = [run, ...this.recoveryRuns]
    this.notify()
    return clone(run)
  }

  async runRecovery(scenarioId: RecoveryScenarioId): Promise<RecoveryRun> {
    const scenario = this.requireScenario(scenarioId)
    const existing = this.recoveryRuns.find((run) => run.scenarioId === scenarioId)
    const run = existing ?? (await this.previewRecovery(scenarioId))
    run.status = 'passed'
    run.actualOutcome = `Simulated only: ${scenario.expectedOutcome}`
    run.events = [
      this.makeEvent('recovery', 'Created an isolated mock sandbox', 'info', run.id),
      this.makeEvent('recovery', scenario.mutation, 'warning', run.id),
      this.makeEvent('recovery', 'Observed the expected simulated outcome', 'success', run.id),
    ]
    this.emit('recovery', `${scenario.name} completed in mock mode`, 'success', run.id)
    this.notify()
    return clone(run)
  }

  async resetRecovery(): Promise<RecoveryRun[]> {
    this.recoveryRuns = []
    this.emit('recovery', 'Reset mock recovery experiments', 'info')
    this.notify()
    return []
  }

  async getRecoveryRuns(): Promise<RecoveryRun[]> {
    return clone(this.recoveryRuns)
  }

  async exportReport(): Promise<ExperimentReport> {
    return {
      schemaVersion: 1,
      exportedAt: this.tick(),
      source: 'mock',
      state: this.snapshot(),
      operations: clone(this.operations),
      events: clone(this.events),
      metrics: await this.getMetrics(),
      workload: clone(this.workload),
      recoveryRuns: clone(this.recoveryRuns),
    }
  }

  async importReport(report: ExperimentReport): Promise<void> {
    if (report.schemaVersion !== 1)
      throw new Error('Unsupported report schema version')
    this.options = clone(report.state.options)
    this.path = report.state.path
    this.connection = 'closed'
    this.nextSequence = report.state.nextSequence
    this.activeWal = report.state.activeWal
    this.lastSequence = report.state.lastSequence
    this.operations = clone(report.operations)
    this.events = clone(report.events)
    this.metricPoints = clone(report.metrics.points)
    this.counts = clone(report.metrics.operationCounts)
    this.errorCount = report.metrics.errorCount
    this.workload = clone(report.workload ?? this.workload)
    this.recoveryRuns = clone(report.recoveryRuns)
    this.notify()
  }

  private applyOperation(
    request: OperationRequest,
    operationId: string,
  ): { operationStatus: LabStatus; value?: ValueEntry; entries?: ValueEntry[] } {
    if (request.kind === 'put' || request.kind === 'delete') {
      const key = decodeBytes(request.key)
      const value = request.kind === 'put' ? decodeBytes(request.value) : new Uint8Array()
      if (key.byteLength > this.options.maxKeyBytes || value.byteLength > this.options.maxValueBytes)
        return { operationStatus: status('INVALID_ARGUMENT', 'Key or value exceeds configured limit', operationId, 'validate') }

      const entry: MockEntry = {
        key,
        value,
        sequence: this.nextSequence,
        type: request.kind === 'delete' ? 'tombstone' : 'value',
      }
      this.nextSequence += 1
      this.walRecords.push(entry)
      this.emit('wal.append', `Appended sequence ${entry.sequence} to ${this.walName()}`, 'info', operationId, this.walName())
      if (this.options.syncOnWrite)
        this.emit('wal.sync', `Synced ${this.walName()}`, 'success', operationId, this.walName())
      this.memtable.set(byteKey(key), entry)
      this.visible.set(byteKey(key), entry)
      this.emit('memtable.apply', `${entry.type} applied to MemTable`, 'info', operationId)
      if (this.memtableBytes() >= this.options.memtableBytes)
        this.flush(operationId)
      return { operationStatus: status('OK', request.kind === 'put' ? 'Value stored' : 'Tombstone stored', operationId) }
    }

    if (request.kind === 'get') {
      const key = decodeBytes(request.key)
      const entry = this.visible.get(byteKey(key))
      if (!entry || entry.type === 'tombstone')
        return { operationStatus: status('NOT_FOUND', 'Key is missing or deleted', operationId, 'lookup') }
      return { operationStatus: status('OK', 'Value found', operationId), value: valueEntry(entry) }
    }

    if (request.kind === 'scan') {
      const begin = decodeBytes(request.begin)
      const end = decodeBytes(request.end)
      if (end.length > 0 && compareBytes(end, begin) < 0)
        return { operationStatus: status('INVALID_ARGUMENT', 'Scan end must not precede begin', operationId, 'validate') }
      const entries = [...this.visible.values()]
        .filter((entry) => entry.type === 'value')
        .filter((entry) => compareBytes(entry.key, begin) >= 0)
        .filter((entry) => end.length === 0 || compareBytes(entry.key, end) < 0)
        .sort((left, right) => compareBytes(left.key, right.key))
        .map(valueEntry)
      return { operationStatus: status('OK', `Scan returned ${entries.length} entries`, operationId), entries }
    }

    this.compact(operationId)
    return { operationStatus: status('OK', 'Full compaction completed', operationId) }
  }

  private flush(operationId: string): void {
    const entries = [...this.memtable.values()].sort((left, right) => compareBytes(left.key, right.key))
    if (entries.length === 0)
      return
    const tableNumber = this.nextFileNumber
    const tableName = `${tableNumber.toString().padStart(6, '0')}.sst`
    const fileSize = entries.reduce((sum, entry) => sum + 28 + entry.key.length + entry.value.length, 64)
    const info: TableInfo = {
      fileNumber: tableNumber,
      name: tableName,
      fileSize,
      smallestKey: displayBytes(entries[0].key),
      largestKey: displayBytes(entries.at(-1)!.key),
      minSequence: Math.min(...entries.map((entry) => entry.sequence)),
      maxSequence: Math.max(...entries.map((entry) => entry.sequence)),
      entries: entries.length,
    }
    this.emit('flush.build', `Built ${tableName}.tmp`, 'info', operationId, `${tableName}.tmp`)
    this.emit('sstable.publish', `Published ${tableName}`, 'success', operationId, tableName)
    this.tables.push({ info, entries, blocks: this.blocksFor(entries) })
    this.lastSequence = info.maxSequence
    this.nextFileNumber += 1
    const oldWal = this.walName()
    this.activeWal = this.nextFileNumber
    this.nextFileNumber += 1
    this.walRecords = []
    this.memtable.clear()
    this.flushCount += 1
    const duration = 1_200 + entries.length * 83
    this.flushMicros += duration
    this.emit('manifest.publish', `Manifest now references ${this.tables.length} table(s)`, 'success', operationId, 'MANIFEST')
    this.emit('wal.switch', `Switched ${oldWal} to ${this.walName()}`, 'success', operationId, this.walName())
  }

  private compact(operationId: string): void {
    const oldTables = this.tables
    const liveEntries = [...this.visible.values()]
      .filter((entry) => entry.type === 'value')
      .sort((left, right) => compareBytes(left.key, right.key))
    this.emit('compaction.merge', `Merged ${oldTables.length} table(s)`, 'info', operationId)
    this.tables = []
    oldTables.forEach((table) => {
      this.obsoleteFiles.push(this.tableFile(table, 'obsolete'))
    })
    if (liveEntries.length > 0) {
      const tableNumber = this.nextFileNumber
      const tableName = `${tableNumber.toString().padStart(6, '0')}.sst`
      const info: TableInfo = {
        fileNumber: tableNumber,
        name: tableName,
        fileSize: liveEntries.reduce((sum, entry) => sum + 28 + entry.key.length + entry.value.length, 64),
        smallestKey: displayBytes(liveEntries[0].key),
        largestKey: displayBytes(liveEntries.at(-1)!.key),
        minSequence: Math.min(...liveEntries.map((entry) => entry.sequence)),
        maxSequence: Math.max(...liveEntries.map((entry) => entry.sequence)),
        entries: liveEntries.length,
      }
      this.tables = [{ info, entries: liveEntries, blocks: this.blocksFor(liveEntries) }]
      this.nextFileNumber += 1
      this.emit('manifest.publish', `Published compacted ${tableName}`, 'success', operationId, 'MANIFEST')
    }
    this.compactionCount += 1
    const duration = 2_400 + liveEntries.length * 110
    this.compactionMicros += duration
  }

  private blocksFor(entries: MockEntry[]): SstableBlockView[] {
    const blocks: SstableBlockView[] = []
    let offset = 0
    for (let index = 0; index < entries.length; index += 4) {
      const group = entries.slice(index, index + 4)
      const size = group.reduce((sum, entry) => sum + 20 + entry.key.length + entry.value.length, 12)
      blocks.push({
        index: blocks.length,
        offset,
        size,
        smallestKey: displayBytes(group[0].key),
        largestKey: displayBytes(group.at(-1)!.key),
        entries: group.map(valueEntry),
        crc: 'ok',
      })
      offset += size
    }
    return blocks
  }

  private snapshot(): DatabaseState {
    const files = this.storageFiles()
    return {
      source: 'mock',
      connection: this.connection,
      path: this.path,
      options: clone(this.options),
      openedAt: this.openedAt,
      memtableBytes: this.memtableBytes(),
      memtableEntries: this.memtable.size,
      nextSequence: this.nextSequence,
      activeWal: this.activeWal,
      lastSequence: this.lastSequence,
      tables: this.tables.map((table) => clone(table.info)),
      directoryBytes: files.reduce((sum, file) => sum + file.size, 0),
      pendingCleanup: this.obsoleteFiles.length,
      features: {
        compact: true,
        storageInspection: true,
        resourceMetrics: false,
        recoveryExperiments: false,
      },
    }
  }

  private storageFiles(): StorageFile[] {
    const manifest = {
      formatVersion: 2,
      activeWal: this.activeWal,
      nextFileNumber: this.nextFileNumber,
      lastSequence: this.lastSequence,
      crc: 'ok' as const,
      tables: this.tables.map((table) => clone(table.info)),
    }
    const manifestFile: StorageFile = {
      name: 'MANIFEST',
      kind: 'manifest',
      state: 'active',
      size: 48 + this.tables.length * 64,
      modifiedAt: this.isoNow(),
      manifest,
      hexPreview: hexPreview(manifest),
    }
    const walRecords: WalRecordView[] = this.walRecords.map((entry, index) => ({
      offset: index * 48,
      encodedBytes: 24 + entry.key.length + entry.value.length,
      sequence: entry.sequence,
      type: entry.type,
      key: displayBytes(entry.key),
      value: displayBytes(entry.value),
      crc: 'ok',
    }))
    const walFile: StorageFile = {
      name: this.walName(),
      kind: 'wal',
      state: 'active',
      size: walRecords.reduce((sum, record) => sum + record.encodedBytes, 0),
      modifiedAt: this.isoNow(),
      referencedBy: 'MANIFEST',
      walRecords,
      hexPreview: hexPreview(walRecords),
    }
    return [
      manifestFile,
      walFile,
      ...this.tables.map((table) => this.tableFile(table, 'live')),
      ...this.obsoleteFiles,
    ]
  }

  private tableFile(table: MockTable, state: StorageFile['state']): StorageFile {
    return {
      name: table.info.name,
      kind: 'sstable',
      state,
      size: table.info.fileSize,
      modifiedAt: this.isoNow(),
      referencedBy: state === 'live' ? 'MANIFEST' : undefined,
      blocks: clone(table.blocks),
      hexPreview: hexPreview(table.blocks),
    }
  }

  private memtableBytes(): number {
    return [...this.memtable.values()].reduce(
      (sum, entry) => sum + 32 + entry.key.byteLength + entry.value.byteLength,
      0,
    )
  }

  private walName(): string {
    return `${this.activeWal.toString().padStart(6, '0')}.wal`
  }

  private emit(
    phase: string,
    summary: string,
    level: LabEvent['level'],
    operationId = 'system',
    file?: string,
  ): void {
    this.events = [this.makeEvent(phase, summary, level, operationId, file), ...this.events].slice(0, 10_000)
  }

  private makeEvent(
    phase: string,
    summary: string,
    level: LabEvent['level'],
    operationId: string,
    file?: string,
  ): LabEvent {
    return {
      id: this.nextId('event'),
      operationId,
      timestamp: this.tick(),
      level,
      phase,
      summary,
      file,
      durationMicros: 80 + this.idCounter * 11,
    }
  }

  private recordMetric(durationMicros: number): void {
    const operationCount = Object.values(this.counts).reduce((sum, count) => sum + count, 0)
    this.metricPoints = [
      ...this.metricPoints,
      {
        timestamp: this.tick(),
        operationsPerSecond: Math.min(500, operationCount * 3),
        p50Micros: durationMicros || 0,
        p95Micros: durationMicros ? Math.round(durationMicros * 1.45) : 0,
        p99Micros: durationMicros ? Math.round(durationMicros * 1.85) : 0,
        directoryBytes: this.storageFiles().reduce((sum, file) => sum + file.size, 0),
        memtableBytes: this.memtableBytes(),
      },
    ].slice(-120)
  }

  private scheduleWorkload(): void {
    const interval = Math.max(16, Math.round(1000 / Math.max(1, this.workload.config.operationsPerSecond)))
    this.workloadTimer = setInterval(() => void this.workloadStep(), interval)
  }

  private async workloadStep(): Promise<void> {
    if (this.workload.status !== 'running')
      return
    if (this.workload.completedOperations >= this.workload.config.operationCount) {
      this.finishWorkload()
      return
    }
    const config = this.workload.config
    const roll = this.workloadRandom() * 100
    const keyIndex = this.workloadKey(config)
    const key: EncodedBytes = { encoding: 'text', data: `key-${keyIndex.toString().padStart(3, '0')}` }
    let request: OperationRequest
    if (roll < config.putRatio) {
      const value = `v${this.workload.completedOperations}`.padEnd(config.valueBytes, 'x').slice(0, config.valueBytes)
      request = { kind: 'put', key, value: { encoding: 'text', data: value } }
    } else if (roll < config.putRatio + config.getRatio) {
      request = { kind: 'get', key }
    } else {
      request = { kind: 'delete', key }
    }
    await this.execute(request)
    this.workload.completedOperations += 1
    if (config.reopenEvery > 0 && this.workload.completedOperations % config.reopenEvery === 0)
      await this.reopen()
    if (this.workload.completedOperations >= config.operationCount)
      this.finishWorkload()
    else
      this.notify()
  }

  private workloadKey(config: WorkloadConfig): number {
    if (config.distribution === 'sequential')
      return this.workload.completedOperations % config.keySpace
    if (config.distribution === 'hotspot' && this.workloadRandom() < 0.8)
      return Math.floor(this.workloadRandom() * Math.max(1, Math.ceil(config.keySpace * 0.2)))
    return Math.floor(this.workloadRandom() * config.keySpace)
  }

  private finishWorkload(): void {
    this.workload.status = 'completed'
    this.workload.finishedAt = this.tick()
    this.stopWorkloadTimer()
    this.emit('workload', `Completed ${this.workload.completedOperations} operations`, 'success', this.workload.id)
    this.notify()
  }

  private stopWorkloadTimer(): void {
    if (this.workloadTimer)
      clearInterval(this.workloadTimer)
    this.workloadTimer = undefined
  }

  private requireScenario(id: RecoveryScenarioId): RecoveryScenario {
    const scenario = recoveryScenarios.find((candidate) => candidate.id === id)
    if (!scenario)
      throw new Error(`Unknown recovery scenario: ${id}`)
    return scenario
  }

  private nextId(prefix: string): string {
    this.idCounter += 1
    return `${prefix}-${this.idCounter.toString().padStart(4, '0')}`
  }

  private tick(): string {
    this.clockMillis += 17
    return new Date(this.clockMillis).toISOString()
  }

  private isoNow(): string {
    return new Date(this.clockMillis).toISOString()
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener())
  }
}

