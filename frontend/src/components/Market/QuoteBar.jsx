// frontend/src/components/Market/QuoteBar.jsx
import { useQuery }      from '@tanstack/react-query'
import { marketAPI }     from '../../api/client'
import { useLivePrice }  from '../../hooks/useLivePrice'

function StatBox({ label, value, color = 'text-white' }) {
  return (
    <div className="text-center">
      <div className="text-muted text-xs mb-0.5">{label}</div>
      <div className={`font-bold text-sm ${color}`} dir="ltr">{value ?? '—'}</div>
    </div>
  )
}

function fmt(v, prefix = '$', decimals = 2) {
  if (v == null) return '—'
  if (v >= 1e12) return `${prefix}${(v/1e12).toFixed(2)}T`
  if (v >= 1e9)  return `${prefix}${(v/1e9).toFixed(2)}B`
  if (v >= 1e6)  return `${prefix}${(v/1e6).toFixed(2)}M`
  return `${prefix}${Number(v).toFixed(decimals)}`
}

export default function QuoteBar({ symbol, onPriceUpdate }) {
  // נתוני יסוד (מתעדכן כל 30 שניות)
  const { data } = useQuery({
    queryKey:        ['quote', symbol],
    queryFn:         () => marketAPI.getQuote(symbol),
    enabled:         !!symbol,
    refetchInterval: 30_000,
  })

  // מחיר חי — WebSocket
  const { price: livePrice, direction, connected, source } = useLivePrice(symbol)

  // השתמש במחיר החי אם זמין, אחרת במחיר מה-API
  const displayPrice = livePrice ?? data?.price
  const prevClose    = data?.previous_close
  const change       = displayPrice && prevClose ? displayPrice - prevClose : null
  const changePct    = change && prevClose ? (change / prevClose) * 100 : null
  const isUp         = change >= 0

  // עדכן את OrderPanel כשהמחיר משתנה
  if (onPriceUpdate && livePrice) onPriceUpdate(livePrice)

  return (
    <div className="card py-3">
      {/* Name + Live Price */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-white font-bold text-xl">{data?.name || symbol}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-muted text-xs">{data?.exchange}</span>
            {/* אינדיקטור חיבור */}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
              ${connected
                ? 'bg-accent/10 text-accent'
                : 'bg-white/5 text-muted'}`}>
              {connected ? `● Live (${source})` : '○ מתחבר...'}
            </span>
          </div>
        </div>

        <div className="text-right">
          {/* המחיר מתעדכן בזמן אמת עם אנימציה */}
          <div
            className={`font-black text-3xl tabular-nums transition-colors duration-200
              ${direction === 'up'   ? 'text-accent' :
                direction === 'down' ? 'text-danger'  : 'text-white'}`}
            dir="ltr"
          >
            {displayPrice
              ? `$${displayPrice.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: displayPrice > 100 ? 2 : 4
                })}`
              : '—'
            }
          </div>

          {change != null && (
            <div className={`text-sm font-bold ${isUp ? 'text-accent' : 'text-danger'}`} dir="ltr">
              {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
              ({Math.abs(changePct).toFixed(2)}%)
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 bg-primary rounded-lg p-3">
        <StatBox label="פתיחה"      value={fmt(data?.open)} />
        <StatBox label="גבוה"       value={fmt(data?.day_high)}  color="text-accent" />
        <StatBox label="נמוך"       value={fmt(data?.day_low)}   color="text-danger" />
        <StatBox label="סגירה קודמת" value={fmt(data?.previous_close)} />
        <StatBox label="שווי שוק"   value={fmt(data?.market_cap)} />
        <StatBox label="P/E"        value={data?.pe_ratio?.toFixed(1)} />
        <StatBox label="52W גבוה"   value={fmt(data?.['52w_high'])} color="text-accent" />
        <StatBox label="52W נמוך"   value={fmt(data?.['52w_low'])}  color="text-danger" />
      </div>
    </div>
  )
}
