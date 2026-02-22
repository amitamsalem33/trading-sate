import { useQuery } from '@tanstack/react-query'
import { newsAPI }  from '../../api/client'

function timeAgo(unixTs) {
  const diff = Math.floor(Date.now() / 1000) - unixTs
  if (diff < 3600)   return `לפני ${Math.floor(diff / 60)} דקות`
  if (diff < 86400)  return `לפני ${Math.floor(diff / 3600)} שעות`
  return `לפני ${Math.floor(diff / 86400)} ימים`
}

function SentimentBadge({ headline }) {
  const bullish = /surge|jump|beat|rally|profit|growth|record|rise|gain|buy/i.test(headline)
  const bearish  = /fall|drop|miss|loss|crash|cut|risk|warn|decline|sell/i.test(headline)
  if (bullish)  return <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">חיובי ↑</span>
  if (bearish)  return <span className="text-xs px-1.5 py-0.5 bg-danger/10 text-danger rounded">שלילי ↓</span>
  return <span className="text-xs px-1.5 py-0.5 bg-white/5 text-muted rounded">ניטרלי</span>
}

export default function NewsPanel({ symbol }) {
  const { data, isLoading, error } = useQuery({
    queryKey:        ['news', symbol],
    queryFn:         () => newsAPI.getNews(symbol),
    enabled:         !!symbol,
    staleTime:       5 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  if (isLoading) return (
    <div className="card">
      <h3 className="font-bold text-white text-base mb-3">📰 חדשות</h3>
      <p className="text-muted text-sm text-center py-4">⏳ טוען חדשות...</p>
    </div>
  )

  if (error) return (
    <div className="card">
      <h3 className="font-bold text-white text-base mb-3">📰 חדשות</h3>
      <p className="text-danger text-sm text-center py-4">⚠️ שגיאה בטעינת חדשות</p>
    </div>
  )

  const news = data?.news || []

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white text-base">📰 חדשות — {symbol}</h3>
        <span className="text-xs text-muted bg-primary rounded px-2 py-1">
          {news.length} כתבות
        </span>
      </div>

      {news.length === 0 ? (
        <p className="text-muted text-sm text-center py-4">אין חדשות זמינות</p>
      ) : (
        <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto pl-1">
          {news.map((item, i) => (
            <a
              key={item.id || i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block bg-primary rounded-lg p-3 border border-white/5 hover:border-accent/30 transition"
            >
              {item.image && (
                <img
                  src={item.image}
                  alt=""
                  className="w-full h-28 object-cover rounded mb-2 opacity-80 group-hover:opacity-100 transition"
                  onError={e => e.target.style.display = 'none'}
                />
              )}
              <div className="flex items-start gap-2 mb-1">
                <SentimentBadge headline={item.headline} />
                <span className="text-white text-sm font-medium leading-snug group-hover:text-accent transition line-clamp-2">
                  {item.headline}
                </span>
              </div>
              {item.summary && (
                <p className="text-muted text-xs leading-relaxed mt-1 line-clamp-2">
                  {item.summary}
                </p>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                <span className="text-xs text-muted">{item.source}</span>
                <span className="text-xs text-muted" dir="rtl">{timeAgo(item.datetime)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
