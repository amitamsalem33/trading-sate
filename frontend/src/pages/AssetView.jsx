// frontend/src/pages/AssetView.jsx
import { useState, useEffect } from 'react'
import { useParams }            from 'react-router-dom'
import { useTranslation }       from 'react-i18next'
import { useQueryClient }       from '@tanstack/react-query'
import { marketAPI }            from '../api/client'
import CandlestickChart         from '../components/Chart/CandlestickChart'
import OrderPanel               from '../components/Trading/OrderPanel'
import Portfolio                from '../components/Trading/Portfolio'
import NewsPanel                from '../components/News/NewsPanel'
import QuoteBar                 from '../components/Market/QuoteBar'
import ReasoningPanel from '../components/Signal/ReasoningPanel'
export default function AssetView() {
  const { symbol }    = useParams()
  const { t }         = useTranslation()
  const queryClient   = useQueryClient()

  // Latest price for OrderPanel
  const [currentPrice,  setCurrentPrice]  = useState(null)
  // After order placed, pass entry/SL/TP lines to chart
  const [lastOrder,     setLastOrder]     = useState(null)
  // Watchlist state
  const [inWatchlist,   setInWatchlist]   = useState(false)
  const [watchMsg,      setWatchMsg]      = useState('')
  // Active tab for right column
  const [rightTab,      setRightTab]      = useState('order')  // 'order' | 'portfolio'

  // Fetch quote to get current price for the OrderPanel
  useEffect(() => {
    if (!symbol) return
    setLastOrder(null)
    const fetchPrice = async () => {
      try {
        const q = await marketAPI.getQuote(symbol)
        setCurrentPrice(q?.price ?? null)
      } catch (_) {}
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 15_000)
    return () => clearInterval(interval)
  }, [symbol])

  const handleOrderPlaced = (order) => {
    setLastOrder(order)
    queryClient.invalidateQueries(['portfolio'])
  }

  const toggleWatchlist = async () => {
    try {
      if (inWatchlist) {
        await marketAPI.removeWatch(symbol)
        setInWatchlist(false)
        setWatchMsg('הוסר מרשימת המעקב')
      } else {
        await marketAPI.addWatch(symbol)
        setInWatchlist(true)
        setWatchMsg('נוסף לרשימת המעקב ✓')
      }
      setTimeout(() => setWatchMsg(''), 3000)
    } catch (_) {}
  }

  if (!symbol) return null

  return (
    <div className="flex flex-col gap-5">

      {/* ── Top Bar: Symbol header + Watchlist btn ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white" dir="ltr">{symbol}</h1>
        <div className="flex items-center gap-3">
          {watchMsg && (
            <span className="text-xs text-accent bg-accent/10 rounded px-2 py-1">
              {watchMsg}
            </span>
          )}
          <button
            onClick={toggleWatchlist}
            className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg
                        border transition font-medium
                        ${inWatchlist
                          ? 'border-warning/40 text-warning bg-warning/10 hover:bg-warning/20'
                          : 'border-white/10 text-muted hover:text-white hover:border-white/20'}`}
          >
            {inWatchlist ? '⭐ ברשימת המעקב' : '☆ הוסף למעקב'}
          </button>
        </div>
      </div>

      {/* ── Quote Stats Bar ── */}
<QuoteBar symbol={symbol} onPriceUpdate={setCurrentPrice} />
      {/* ── Main Grid: Chart (left 65%) + Right Panel (35%) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Chart Column */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          <CandlestickChart
            symbol={symbol}
            entryPrice={lastOrder?.entry_price  ?? null}
            stopLoss={lastOrder?.stop_loss      ?? null}
            takeProfit={lastOrder?.take_profit  ?? null}
          />

         <ReasoningPanel symbol={symbol} />
          <div className="card border border-dashed border-accent/20">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🤖</span>
              <div>
                <div className="text-white font-bold text-sm">אות מסחר — שלב 3</div>
                <div className="text-muted text-xs">
                  מנוע ה-Alpha יחשב כאן את ההמלצה בשילוב ML, TA ו-Sentiment
                </div>
              </div>
              <div className="mr-auto bg-warning/10 text-warning border border-warning/20
                              rounded-lg px-3 py-1.5 text-sm font-bold">
                החזק ⏳
              </div>
            </div>
          </div>

          {/* News Panel */}
          <NewsPanel symbol={symbol} />
        </div>

        {/* Right Column: Order Panel + Portfolio */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Tab Switcher */}
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {[
              { id: 'order',     label: '📋 פקודה'  },
              { id: 'portfolio', label: '💼 תיק'    },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id)}
                className={`flex-1 py-2.5 text-sm font-bold transition
                  ${rightTab === tab.id
                    ? 'bg-accent text-primary'
                    : 'text-muted hover:text-white hover:bg-white/5'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {rightTab === 'order' ? (
            <OrderPanel
              symbol={symbol}
              currentPrice={currentPrice}
              onOrderPlaced={handleOrderPlaced}
            />
          ) : (
            <Portfolio />
          )}

          {/* Fundamentals mini-card */}
          <FundamentalsCard symbol={symbol} />
        </div>
      </div>
    </div>
  )
}

// ── Inline Fundamentals mini-card ──────────────────────────────────────────
import { useQuery } from '@tanstack/react-query'

function FundamentalsCard({ symbol }) {
  const { data, isLoading } = useQuery({
    queryKey: ['fundamentals', symbol],
    queryFn:  () => fetch(`/api/market/fundamentals/${symbol}`).then(r => r.json()),
    enabled:  !!symbol,
    staleTime: 10 * 60_000,
  })

  const rows = [
    { label: 'P/E Trailing',   value: data?.pe_ratio?.toFixed(1) },
    { label: 'P/E Forward',    value: data?.forward_pe?.toFixed(1) },
    { label: 'P/B',            value: data?.pb_ratio?.toFixed(2) },
    { label: 'EV/EBITDA',      value: data?.ev_ebitda?.toFixed(1) },
    { label: 'מרווח רווח',     value: data?.profit_margin ? `${(data.profit_margin * 100).toFixed(1)}%` : null },
    { label: 'ROE',            value: data?.return_on_equity ? `${(data.return_on_equity * 100).toFixed(1)}%` : null },
    { label: 'חוב/הון עצמי',  value: data?.debt_to_equity?.toFixed(2) },
    { label: 'בטא',            value: data?.beta?.toFixed(2) },
    { label: 'יעד אנליסטים',   value: data?.analyst_target ? `$${data.analyst_target.toFixed(2)}` : null },
  ]

  return (
    <div className="card">
      <h3 className="text-white font-bold text-base mb-3">📊 נתוני יסוד</h3>
      {isLoading ? (
        <p className="text-muted text-sm text-center">⏳ טוען...</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {rows.map(r => r.value && (
            <div key={r.label} className="bg-primary rounded p-2 flex justify-between items-center">
              <span className="text-muted text-xs">{r.label}</span>
              <span className="text-white text-xs font-bold" dir="ltr">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
