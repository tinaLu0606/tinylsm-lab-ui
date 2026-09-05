import type { LabOptions, WorkloadConfig } from './contracts'

export const defaultOptions: LabOptions = {
  memtableBytes: 512,
  createIfMissing: true,
  syncOnWrite: true,
  maxKeyBytes: 4 * 1024 * 1024,
  maxValueBytes: 64 * 1024 * 1024,
  sstableBlockBytes: 16 * 1024,
}

export const defaultWorkload: WorkloadConfig = {
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
}

