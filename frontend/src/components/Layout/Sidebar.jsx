// frontend/src/components/Layout/Sidebar.jsx — גרסה מלאה
import { NavLink }          from 'react-router-dom'
import { useTranslation }   from 'react-i18next'
import WatchlistSidebar     from '../Watchlist/WatchlistSidebar'

const links = [
  { to: '/',           label: 'dashboard',  icon: '🏠' },
  { to: '/portfolio',  label: 'portfolio',  icon: '💼' },
  { to: '/screener',   label: 'screener',   icon: '🔬' },
  { to: '/backtest',   label: 'backtest',   icon: '🧪' },
]

export default function Sidebar() {
  const { t } = useTranslation()
  return (
    <aside className="w-56 bg-surface border-l border-white/5
                      flex flex-col overflow-hidden">
      {/* Navigation */}
      <nav className="flex flex-col py-4 gap-1 border-b border-white/5">
        {links.map(l => (
          <NavLink key={l.to} to={l.to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2.5 text-sm font-medium
               rounded-lg mx-2 transition text-right
               ${isActive
                 ? 'bg-accent/10 text-accent'
                 : 'text-muted hover:text-white hover:bg-white/5'}`
            }>
            <span>{l.icon}</span>
            <span>{t(l.label)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Watchlist */}
      <div className="flex-1 overflow-y-auto p-2">
        <WatchlistSidebar />
      </div>
    </aside>
  )
}
