import type { AuditEntry } from '../types/audit'
import { CostOverTimeChart } from './charts/CostOverTimeChart'
import { CostPerCommitChart } from './charts/CostPerCommitChart'
import { RawDataTable } from './RawDataTable'

interface DashboardProps {
  entries: AuditEntry[]
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  )
}

export function Dashboard({ entries }: DashboardProps) {
  const totalCost = entries.reduce((s, e) => s + e.claude.cost_usd, 0)
  const totalTokens = entries.reduce(
    (s, e) => s + e.claude.tokens.input + e.claude.tokens.output,
    0,
  )
  const avgCost = entries.length > 0 ? totalCost / entries.length : 0
  const maxEntry = entries.reduce(
    (max, e) => (e.claude.cost_usd > max.claude.cost_usd ? e : max),
    entries[0],
  )

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Cost" value={`$${totalCost.toFixed(4)}`} />
        <StatCard label="Commits" value={entries.length.toString()} />
        <StatCard label="Avg per Commit" value={`$${avgCost.toFixed(4)}`} />
        <StatCard
          label="Most Expensive"
          value={`$${maxEntry?.claude.cost_usd.toFixed(4) ?? '-'}`}
        />
        <StatCard
          label="Total Tokens"
          value={`${(totalTokens / 1000).toFixed(1)}k`}
        />
        <StatCard
          label="Input Tokens"
          value={`${(entries.reduce((s, e) => s + e.claude.tokens.input, 0) / 1000).toFixed(1)}k`}
        />
        <StatCard
          label="Output Tokens"
          value={`${(entries.reduce((s, e) => s + e.claude.tokens.output, 0) / 1000).toFixed(1)}k`}
        />
        <StatCard
          label="Cache Read"
          value={`${(entries.reduce((s, e) => s + e.claude.tokens.cache_read, 0) / 1000).toFixed(1)}k`}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Cumulative Cost Over Time">
          <CostOverTimeChart entries={entries} />
        </ChartCard>
        <ChartCard title="Cost per Commit">
          <CostPerCommitChart entries={entries} />
        </ChartCard>
      </div>

      {/* Raw data */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          All Entries
        </h3>
        <RawDataTable entries={entries} />
      </div>
    </div>
  )
}
