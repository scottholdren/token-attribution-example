import sampleData from '../data/sample-log.json'
import type { AuditEntry } from '../types/audit'
import { Dashboard } from '../components/Dashboard'

const entries = sampleData as AuditEntry[]

export function SamplePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Sample Data</h1>
        <p className="mt-2 text-slate-500">
          15 realistic commits from a shopping cart feature built with Claude Code over two weeks. Costs and token counts reflect real usage patterns.
        </p>
      </div>
      <Dashboard entries={entries} />
    </div>
  )
}
