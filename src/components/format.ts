export function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function formatMicros(micros: number): string {
  if (micros < 1000)
    return `${Math.round(micros)} µs`
  return `${(micros / 1000).toFixed(2)} ms`
}

export function shortTime(value?: string): string {
  if (!value)
    return '—'
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function percentage(part: number, total: number): number {
  if (total <= 0)
    return 0
  return Math.min(100, Math.round((part / total) * 100))
}

