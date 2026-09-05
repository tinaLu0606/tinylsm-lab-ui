import { useState, type ReactNode, type UIEvent } from 'react'

// Fixed-height windowing keeps bounded mock histories inexpensive to render.
export function VirtualList<T>({
  className,
  height,
  items,
  itemHeight,
  itemKey,
  renderItem,
}: {
  className?: string
  height: number
  items: T[]
  itemHeight: number
  itemKey(item: T): string
  renderItem(item: T): ReactNode
}) {
  const [scrollTop, setScrollTop] = useState(0)
  const first = Math.max(0, Math.floor(scrollTop / itemHeight) - 3)
  const last = Math.min(items.length, first + Math.ceil(height / itemHeight) + 6)

  return (
    <div className={`virtual-list ${className ?? ''}`} onScroll={(event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)} style={{ height }}>
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {items.slice(first, last).map((item, index) => (
          <div key={itemKey(item)} style={{ height: itemHeight, left: 0, position: 'absolute', right: 0, top: (first + index) * itemHeight }}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  )
}
