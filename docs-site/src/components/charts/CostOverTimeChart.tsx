import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { AuditEntry } from '../../types/audit'

interface CostOverTimeChartProps {
  entries: AuditEntry[]
}

export function CostOverTimeChart({ entries }: CostOverTimeChartProps) {
  let cumulative = 0
  const data = entries.map((e) => {
    cumulative += e.claude.cost_usd
    return {
      hash: e.commit.slice(0, 7),
      cumulative: parseFloat(cumulative.toFixed(4)),
    }
  })

  return (
    <div className="min-h-72">
      <ResponsiveContainer width="100%" height={288}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
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
            formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cumulative cost']}
            labelFormatter={(label) => `Commit ${label}`}
          />
          <Line
            type="monotone"
            dataKey="cumulative"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3, fill: '#6366f1' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
