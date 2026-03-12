interface CodeBlockProps {
  children: string
  language?: string
}

export function CodeBlock({ children, language }: CodeBlockProps) {
  return (
    <div className="relative my-4">
      {language && (
        <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">{language}</span>
      )}
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100 leading-relaxed">
        <code>{children.trim()}</code>
      </pre>
    </div>
  )
}
