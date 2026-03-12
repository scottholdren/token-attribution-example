import type { AuditEntry } from '../types/audit'

interface RawDataTableProps {
  entries: AuditEntry[]
}

function shortHash(h: string) {
  return h.slice(0, 7)
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RawDataTable({ entries }: RawDataTableProps) {
  const totalCost = entries.reduce((s, e) => s + e.claude.cost_usd, 0)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Commit</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Message</th>
            <th className="px-4 py-3">Author</th>
            <th className="px-4 py-3 text-right">Input</th>
            <th className="px-4 py-3 text-right">Output</th>
            <th className="px-4 py-3 text-right">Cache R</th>
            <th className="px-4 py-3 text-right">Cache W</th>
            <th className="px-4 py-3 text-right">Cost (USD)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => (
            <tr key={e.commit} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-indigo-600">{shortHash(e.commit)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(e.timestamp)}</td>
              <td className="px-4 py-3 max-w-xs truncate text-slate-800">{e.message}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">{e.author}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-600">
                {e.claude.tokens.input.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-600">
                {e.claude.tokens.output.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-600">
                {e.claude.tokens.cache_read.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-600">
                {e.claude.tokens.cache_creation.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                ${e.claude.cost_usd.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 bg-slate-50">
          <tr>
            <td colSpan={8} className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
              Total ({entries.length} commits)
            </td>
            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
              ${totalCost.toFixed(4)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
