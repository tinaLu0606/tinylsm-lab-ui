import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { LabApi } from '../api/LabApi'
import { HttpLabApi } from '../api/HttpLabApi'
import { MockLabApi } from '../api/MockLabApi'
import { defaultOptions } from '../api/defaults'
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
  WorkloadConfig,
  WorkloadRun,
} from '../api/contracts'

interface LabData {
  state: DatabaseState
  storage: StorageSnapshot
  metrics: MetricsSnapshot
  operations: OperationResult[]
  events: LabEvent[]
  workload: WorkloadRun
  recoveryScenarios: RecoveryScenario[]
  recoveryRuns: RecoveryRun[]
}

interface LabContextValue extends LabData {
  loading: boolean
  error?: string
  clearError(): void
  refresh(): Promise<void>
  open(path: string, options: LabOptions): Promise<void>
  close(): Promise<void>
  reopen(): Promise<void>
  reset(): Promise<void>
  execute(request: OperationRequest): Promise<OperationResult | undefined>
  startWorkload(config: WorkloadConfig): Promise<void>
  pauseWorkload(): Promise<void>
  resumeWorkload(): Promise<void>
  cancelWorkload(): Promise<void>
  previewRecovery(id: RecoveryScenarioId): Promise<void>
  runRecovery(id: RecoveryScenarioId): Promise<void>
  resetRecovery(): Promise<void>
  exportReport(): Promise<ExperimentReport | undefined>
  importReport(report: ExperimentReport): Promise<void>
}

function initialData(): LabData {
  return {
    state: {
      source: 'mock',
      connection: 'closed',
      path: '/tmp/tinylsm-lab/session-demo',
      options: structuredClone(defaultOptions),
      memtableBytes: 0,
      memtableEntries: 0,
      nextSequence: 1,
      activeWal: 1,
      lastSequence: 0,
      tables: [],
      directoryBytes: 48,
      pendingCleanup: 0,
      features: {
        compact: true,
        storageInspection: true,
        resourceMetrics: false,
        recoveryExperiments: false,
      },
    },
    storage: { source: 'mock', files: [], totalBytes: 0, hasMore: false },
    metrics: {
      source: 'mock',
      measuredAt: '2026-09-04T09:00:00.000Z',
      operationCounts: { put: 0, get: 0, delete: 0, scan: 0, compact: 0 },
      errorCount: 0,
      flushCount: 0,
      compactionCount: 0,
      averageFlushMicros: 0,
      averageCompactionMicros: 0,
      points: [],
      processMetricsAvailable: false,
    },
    operations: [],
    events: [],
    workload: {
      id: 'workload-idle',
      status: 'idle',
      config: {
        operationCount: 120,
        seed: 42,
        keySpace: 24,
        valueBytes: 24,
        putRatio: 55,
        getRatio: 35,
        deleteRatio: 10,
        operationsPerSecond: 60,
        distribution: 'hotspot',
        reopenEvery: 0,
      },
      completedOperations: 0,
    },
    recoveryScenarios: [],
    recoveryRuns: [],
  }
}

const LabContext = createContext<LabContextValue | undefined>(undefined)

export function LabProvider({ children, api: suppliedApi }: PropsWithChildren<{ api?: LabApi }>) {
  const api = useMemo(() => suppliedApi ?? (import.meta.env.VITE_LAB_API === 'live' ? new HttpLabApi() : new MockLabApi()), [suppliedApi])
  const [data, setData] = useState<LabData>(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const refreshScheduled = useRef(false)

  const refresh = useCallback(async () => {
    const [state, storage, metrics, operations, events, workload, recoveryScenarios, recoveryRuns] =
      await Promise.all([
        api.getState(),
        api.getStorage(),
        api.getMetrics(),
        api.getOperations(),
        api.getEvents(),
        api.getWorkload(),
        api.listRecoveryScenarios(),
        api.getRecoveryRuns(),
      ])
    setData({ state, storage, metrics, operations, events, workload, recoveryScenarios, recoveryRuns })
  }, [api])

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      setLoading(true)
      setError(undefined)
      try {
        const result = await action()
        await refresh()
        return result
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unexpected frontend error')
        return undefined
      } finally {
        setLoading(false)
      }
    },
    [refresh],
  )

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
    return api.subscribe(() => {
      if (refreshScheduled.current)
        return
      refreshScheduled.current = true
      window.setTimeout(() => {
        refreshScheduled.current = false
        void refresh()
      }, 50)
    })
  }, [api, refresh])

  const value: LabContextValue = {
    ...data,
    loading,
    error,
    clearError: () => setError(undefined),
    refresh,
    open: async (path, options) => void (await run(() => api.open(path, options))),
    close: async () => void (await run(() => api.close())),
    reopen: async () => void (await run(() => api.reopen())),
    reset: async () => void (await run(() => api.reset())),
    execute: (request) => run(() => api.execute(request)),
    startWorkload: async (config) => void (await run(() => api.startWorkload(config))),
    pauseWorkload: async () => void (await run(() => api.pauseWorkload())),
    resumeWorkload: async () => void (await run(() => api.resumeWorkload())),
    cancelWorkload: async () => void (await run(() => api.cancelWorkload())),
    previewRecovery: async (id) => void (await run(() => api.previewRecovery(id))),
    runRecovery: async (id) => void (await run(() => api.runRecovery(id))),
    resetRecovery: async () => void (await run(() => api.resetRecovery())),
    exportReport: () => run(() => api.exportReport()),
    importReport: async (report) => void (await run(() => api.importReport(report))),
  }

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>
}

export function useLab(): LabContextValue {
  const context = useContext(LabContext)
  if (!context)
    throw new Error('useLab must be used inside LabProvider')
  return context
}
