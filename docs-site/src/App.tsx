import { useState } from 'react'
import { SiteNav } from './components/SiteNav'
import { HomePage } from './pages/HomePage'
import { SamplePage } from './pages/SamplePage'
import { UploadPage } from './pages/UploadPage'

type Page = 'home' | 'sample' | 'upload'

export function App() {
  const [page, setPage] = useState<Page>('home')

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteNav page={page} setPage={setPage} />
      <main>
        {page === 'home' && <HomePage setPage={setPage} />}
        {page === 'sample' && <SamplePage />}
        {page === 'upload' && <UploadPage />}
      </main>
    </div>
  )
}
