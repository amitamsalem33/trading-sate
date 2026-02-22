import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore'

export default function Navbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setSelectedSymbol = useStore(s => s.setSelectedSymbol)
  const [query, setQuery] = useState('')

  const handleSearch = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    const sym = query.trim().toUpperCase()
    setSelectedSymbol(sym)
    navigate(`/asset/${sym}`)
    setQuery('')
  }

  return (
    <nav className="bg-surface border-b border-white/5 px-6 py-3 flex items-center justify-between">
      <span className="text-accent font-bold text-lg">{t('app_name')}</span>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('search_placeholder')}
          className="bg-primary text-white border border-white/10 rounded-lg px-4 py-2 text-sm w-64 focus:outline-none focus:border-accent text-right"
        />
        <button type="submit"
          className="bg-accent text-primary font-bold px-4 rounded-lg text-sm hover:opacity-90">
          חפש
        </button>
      </form>
    </nav>
  )
}
