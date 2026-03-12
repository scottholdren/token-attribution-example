import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { AuditEntry } from '../../types/audit'

interface CostPerCommitChartProps {
  entries: AuditEntry[]
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#818cf8', '#c4b5fd']

export function CostPerCommitChart({ entries }: CostPerCommitChartProps) {
  const data = entries.map((e, i) => ({
    hash: e.commit.slice(0, 7),
    cost: e.claude.cost_usd,
    message: e.message,
    colorIdx: i % COLORS.length,
  }))

  return (
    <div className="min-h-72">
      <ResponsiveContainer width="100%" height={288}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="hash"
            tick={{ fontSize: 11, fontFamily: 'monospace' }}
            angle={-45}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            tick={{ fontSize: 11 }}
            width={56}
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
            labelFormatter={(label) => {
              const entry = data.find((d) => d.hash === label)
              return entry ? `${label} — ${entry.message}` : label
            }}
          />
          <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.colorIdx]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
