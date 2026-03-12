import { useState } from 'react'
import type { AuditEntry } from '../types/audit'
import { DropZone } from '../components/DropZone'
import { Dashboard } from '../components/Dashboard'

export function UploadPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleData = (data: AuditEntry[]) => {
    setError(null)
    setEntries(data)
  }

  const handleError = (msg: string) => {
    setEntries(null)
    setError(msg)
  }

  const reset = () => {
    setEntries(null)
    setError(null)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Upload Your Log</h1>
          <p className="mt-2 text-slate-500">
            Drop your{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-sm">.claude-audit/log.json</code>{' '}
            to visualize your project's token spend.
          </p>
        </div>
        {entries && (
          <button
            onClick={reset}
            className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Upload another
          </button>
        )}
      </div>

      {!entries && (
        <div className="mb-6">
          <DropZone onData={handleData} onError={handleError} />
          <p className="mt-3 text-center text-sm text-slate-400">
            Don't have a log yet?{' '}
            <a
              href="https://raw.githubusercontent.com/scottholdren/token-attribution-example/main/.claude-audit/log.json"
              download="log.json"
              className="text-indigo-500 hover:text-indigo-700 hover:underline"
            >
              Download this project's log
            </a>
          </p>
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      )}

      {entries && <Dashboard entries={entries} />}
    </div>
  )
}
