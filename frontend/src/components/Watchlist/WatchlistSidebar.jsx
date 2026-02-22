// frontend/src/components/Watchlist/WatchlistSidebar.jsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate }              from 'react-router-dom'
import { useStore }                 from '../../store/useStore'
import { marketAPI }                from '../../api/client'

export default function WatchlistSidebar() {
  const navigate         = useNavigate()
  const queryClient      = useQueryClient()
  const setSelectedSymbol = useStore(s => s.setSelectedSymbol)

  const { data, isLoading } = useQuery({
    queryKey:        ['watchlist'],
    queryFn:         () => marketAPI.getWatchlist(),
    refetchInterval: 20_000,
  })

  const handleRemove = async (e, symbol) => {
    e.stopPropagation()
    await marketAPI.removeWatch(symbol)
    queryClient.invalidateQueries(['watchlist'])
  }

  const handleClick = (symbol) => {
    setSelectedSymbol(symbol)
    navigate(`/asset/${symbol}`)
  }

  const items = data?.items || []

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-white font-bold text-sm">⭐ רשימת מעקב</h3>
        <span className="text-muted text-xs">{items.length} נכסים</span>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-4 text-center">
          <p className="text-muted text-xs">אין נכסים במעקב</p>
          <p className="text-muted text-xs mt-1">לחץ ☆ בדף הנכס להוספה</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {items.map(item => {
            const price    = item.price
            const prevClose= item.previous_close
            const change   = price && prevClose ? price - prevClose : null
            const changePct= change && prevClose ? (change / prevClose) * 100 : null
            const isUp     = change >= 0

            return (
              <div
                key={item.symbol}
                onClick={() => handleClick(item.symbol)}
                className="flex items-center justify-between px-4 py-3
                           hover:bg-white/3 cursor-pointer transition group"
              >
                <div>
                  <div className="text-white font-bold text-sm">{item.symbol}</div>
                  <div className="text-muted text-xs truncate max-w-[100px]">
                    {item.name || item.symbol}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white text-sm font-medium" dir="ltr">
                    {price ? `$${price.toFixed(2)}` : '—'}
                  </div>
                  {changePct != null && (
                    <div className={`text-xs font-bold ${isUp ? 'text-accent' : 'text-danger'}`} dir="ltr">
                      {isUp ? '▲' : '▼'}{Math.abs(changePct).toFixed(2)}%
                    </div>
                  )}
                </div>
                <button
                  onClick={e => handleRemove(e, item.symbol)}
                  className="mr-2 text-muted hover:text-danger opacity-0
                             group-hover:opacity-100 transition text-lg leading-none"
                  title="הסר"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
