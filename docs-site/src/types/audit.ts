export interface TokenCounts {
  input: number
  output: number
  cache_creation: number
  cache_read: number
}

export interface ClaudeAttribution {
  session_id: string
  response_id?: string
  model: string | null
  git_branch: string | null
  tokens: TokenCounts
  cost_usd: number
  session_timestamp: string
}

export interface AuditEntry {
  commit: string
  timestamp: string
  message: string
  author: string
  files_changed: string[]
  claude: ClaudeAttribution
}

export type AuditLog = AuditEntry[]
