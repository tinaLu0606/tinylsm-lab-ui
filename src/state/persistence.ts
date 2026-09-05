import type { ExperimentReport } from '../api/contracts'

const databaseName = 'tinylsm-lab-ui'
const storeName = 'workspace'
const databaseVersion = 1

interface StoredItem<T> {
  key: string
  value: T
  savedAt: string
}

function openDatabase(): Promise<IDBDatabase | undefined> {
  if (!('indexedDB' in globalThis))
    return Promise.resolve(undefined)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName))
        request.result.createObjectStore(storeName, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function writeItem<T>(item: StoredItem<T>): Promise<void> {
  const database = await openDatabase()
  if (!database)
    return
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(item)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

async function readItem<T>(key: string): Promise<StoredItem<T> | undefined> {
  const database = await openDatabase()
  if (!database)
    return undefined
  const result = await new Promise<StoredItem<T> | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result as StoredItem<T> | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return result
}

export interface UiPreferences {
  activeSection: string
  eventFilter: string
  statePanelCollapsed: boolean
}

export async function savePreferences(preferences: UiPreferences): Promise<void> {
  await writeItem({ key: 'preferences', value: preferences, savedAt: new Date().toISOString() })
}

export async function loadPreferences(): Promise<UiPreferences | undefined> {
  return (await readItem<UiPreferences>('preferences'))?.value
}

export async function saveRecentReport(report: ExperimentReport): Promise<void> {
  const current = (await readItem<ExperimentReport[]>('reports'))?.value ?? []
  const reports = [report, ...current].slice(0, 8)
  await writeItem({ key: 'reports', value: reports, savedAt: new Date().toISOString() })
}

export async function loadRecentReports(): Promise<ExperimentReport[]> {
  return (await readItem<ExperimentReport[]>('reports'))?.value ?? []
}

