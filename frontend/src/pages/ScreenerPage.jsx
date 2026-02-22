// frontend/src/pages/ScreenerPage.jsx
import { useState }       from 'react'
import { useQuery }       from '@tanstack/react-query'
import { useNavigate }    from 'react-router-dom'
import { useStore }       from '../store/useStore'

const TABS = [
  { id: 'small-cap', label: '🔬 מניות קטנות' },
  { id: 'crypto',    label: '₿ קריפטו'       },
]

function ScoreBar({ score, max = 9 }) {
  const pct   = Math.round((score / max) * 100)
  const color = pct >= 70 ? 'bg-accent' : pct >= 40 ? 'bg-warning' : 'bg-danger'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-white/5 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted w-6 text-right">{score}</span>
    </div>
  )
}

function ScreenerCard({ item, onSelect }) {
  const isPositive = item.momentum_5d >= 0
  const score      = item.score || 0
  const strength   = score >= 7 ? '🔥 חזק מאוד' : score >= 5 ? '⚡ חזק' : '📊 בינוני'

  return (
    <div
      onClick={() => onSelect(item.symbol)}
      className="card hover:border-accent/40 transition cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-white font-black text-lg group-hover:text-accent transition">
            {item.symbol}
          </div>
          <div className="text-muted text-xs">{strength}</div>
        </div>
        <div className="text-right">
          <div className="text-white font-bold" dir="ltr">
            ${typeof item.price === 'number' ? item.price.toFixed(4) : item.price}
          </div>
          <div className={`text-xs font-bold ${isPositive ? 'text-accent' : 'text-danger'}`} dir="ltr">
            {isPositive ? '▲' : '▼'}{Math.abs(item.momentum_5d || 0).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-primary rounded p-1.5">
          <div className="text-muted text-xs">RSI</div>
          <div className={`font-bold text-sm ${
            item.rsi < 35 ? 'text-accent' : item.rsi > 65 ? 'text-danger' : 'text-white'
          }`}>{item.rsi?.toFixed(1)}</div>
        </div>
        <div className="bg-primary rounded p-1.5">
          <div className="text-muted text-xs">נפח</div>
          <div className="font-bold text-sm text-white">{item.volume_ratio?.toFixed(1)}x</div>
        </div>
        <div className="bg-primary rounded p-1.5">
          <div className="text-muted text-xs">20D %</div>
          <div className={`font-bold text-sm ${
            (item.momentum_20d || 0) >= 0 ? 'text-accent' : 'text-danger'
          }`} dir="ltr">
            {(item.momentum_20d || 0) >= 0 ? '+' : ''}{item.momentum_20d?.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Score Bar */}
      <ScoreBar score={score} />

      {/* Alert */}
      {item.alert_he && (
        <div className="mt-3 bg-accent/5 border border-accent/15 rounded-lg p-2.5">
          <p className="text-accent text-xs leading-relaxed">{item.alert_he}</p>
        </div>
      )}

      {/* Full signal badge if available */}
      {item.full_signal && (
        <div className={`mt-2 text-center py-1 rounded text-xs font-bold
          ${item.full_signal === 'קנייה' ? 'bg-accent/20 text-accent' :
            item.full_signal === 'מכירה' ? 'bg-danger/20 text-danger' :
            'bg-warning/20 text-warning'}`}>
          {item.full_signal}
        </div>
      )}
    </div>
  )
}

export default function ScreenerPage() {
  const navigate          = useNavigate()
  const setSelectedSymbol = useStore(s => s.setSelectedSymbol)
  const [activeTab, setActiveTab] = useState('small-cap')
  const [deepScan,  setDeepScan]  = useState(false)

  const endpoint = activeTab === 'small-cap'
    ? `/api/screener/small-cap?limit=20&deep_scan=${deepScan}`
    : `/api/screener/crypto?limit=12`

  const { data, isLoading, error, refetch } = useQuery({
    queryKey:        ['screener', activeTab, deepScan],
    queryFn:         () => fetch(endpoint).then(r => r.json()),
    refetchInterval: 2 * 60_000,   // refresh every 2 min
    staleTime:       60_000,
  })

  const handleSelect = (symbol) => {
    setSelectedSymbol(symbol)
    navigate(`/asset/${symbol}`)
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">🔬 סורק הזדמנויות</h1>
          <p className="text-muted text-sm mt-1">
            סריקה אוטומטית של {data?.universe_size || '—'} סימבולים | מתרענן כל 2 דקות
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setDeepScan(!deepScan)}
              className={`w-10 h-5 rounded-full transition relative
                ${deepScan ? 'bg-accent' : 'bg-white/10'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full
                               shadow transition-all
                               ${deepScan ? 'right-0.5' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-muted">סריקה עמוקה (ML)</span>
          </label>
          <button
            onClick={refetch}
            className="text-sm px-4 py-2 bg-accent/10 text-accent
                       border border-accent/20 rounded-lg hover:bg-accent/20 transition"
          >
            🔄 סרוק עכשיו
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden border border-white/10 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 text-sm font-bold transition
              ${activeTab === t.id
                ? 'bg-accent text-primary'
                : 'text-muted hover:text-white hover:bg-white/5'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="card h-48 animate-pulse bg-surface/50" />
          ))}
        </div>
      ) : error ? (
        <div className="card text-center py-8">
          <p className="text-danger">⚠️ שגיאה בטעינת הסורק</p>
          <button onClick={refetch} className="text-accent text-sm mt-2 hover:underline">
            נסה שוב
          </button>
        </div>
      ) : data?.results?.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-muted">לא נמצאו הזדמנויות כרגע. נסה שוב מאוחר יותר.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(data?.results || []).map(item => (
            <ScreenerCard key={item.symbol} item={item} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
