import { useState, useCallback, useRef } from 'react'
import type { AuditEntry } from '../types/audit'

interface DropZoneProps {
  onData: (entries: AuditEntry[]) => void
  onError: (msg: string) => void
}

function validateEntries(data: unknown): AuditEntry[] {
  if (!Array.isArray(data)) throw new Error('JSON must be an array of audit entries.')
  if (data.length === 0) throw new Error('Array is empty — no entries to display.')
  const first = data[0] as Record<string, unknown>
  if (
    typeof first !== 'object' ||
    !first.claude ||
    typeof (first.claude as Record<string, unknown>).cost_usd !== 'number'
  ) {
    throw new Error('Entries must have a "claude.cost_usd" field. Is this a Claude audit log?')
  }
  return data as AuditEntry[]
}

export function DropZone({ onData, onError }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.json')) {
        onError('Please upload a .json file.')
        return
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string)
          const entries = validateEntries(parsed)
          onData(entries)
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Failed to parse file.')
        }
      }
      reader.readAsText(file)
    },
    [onData, onError],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDragLeave = () => setDragging(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
        dragging
          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
          : 'border-slate-300 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50'
      }`}
    >
      <svg
        className="mb-3 h-10 w-10 opacity-50"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <p className="text-base font-medium">Drop your log.json here</p>
      <p className="mt-1 text-sm">or click to browse</p>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={onInputChange}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
