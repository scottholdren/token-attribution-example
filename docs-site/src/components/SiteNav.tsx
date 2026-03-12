type Page = 'home' | 'sample' | 'upload'

interface SiteNavProps {
  page: Page
  setPage: (p: Page) => void
}

export function SiteNav({ page, setPage }: SiteNavProps) {
  const link = (label: string, target: Page) => (
    <button
      onClick={() => setPage(target)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        page === target
          ? 'bg-indigo-600 text-white'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  )

  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
        <span className="mr-4 font-semibold text-slate-800">Token Attribution</span>
        {link('Docs', 'home')}
        {link('Sample Data', 'sample')}
        {link('Upload Log', 'upload')}
      </div>
    </nav>
  )
}
