// frontend/src/pages/BacktestPage.jsx
import { useState, useRef, useEffect } from 'react'

const STRATEGIES = [
  { id: 'ml',   label: '🤖 ML Ensemble',       desc: 'XGBoost + Random Forest' },
  { id: 'rsi',  label: '📊 RSI Strategy',       desc: 'קנייה < 30 | מכירה > 70' },
  { id: 'macd', label: '📈 MACD Crossover',     desc: 'פריצת קו אות' },
  { id: 'sma',  label: '📉 SMA 20/50 Cross',    desc: 'חציית ממוצעים נעים' },
]
const PERIODS = ['6mo','1y','2y','5y']

function MetricCard({ label, value, color = 'text-white', sub }) {
  return (
    <div className="card text-center">
      <div className="text-muted text-xs mb-1">{label}</div>
      <div className={`font-black text-xl ${color}`} dir="ltr">{value}</div>
      {sub && <div className="text-muted text-xs mt-0.5">{sub}</div>}
    </div>
  )
}

function MiniEquityCurve({ data }) {
  const svgRef = useRef(null)
  useEffect(() => {
    if (!data || data.length < 2 || !svgRef.current) return
    const w = svgRef.current.clientWidth || 300
    const h = 80
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * (h - 8) - 4
      return `${x},${y}`
    }).join(' ')
    const last   = data[data.length - 1]
    const first  = data[0]
    const isUp   = last >= first
    const color  = isUp ? '#00d4aa' : '#ff4d6d'
    svgRef.current.innerHTML = `
      <polyline points="${points}" fill="none" stroke="${color}"
                stroke-width="2" stroke-linejoin="round"/>
    `
  }, [data])
  return <svg ref={svgRef} className="w-full" height="80" />
}

export default function BacktestPage() {
  const [symbol,   setSymbol]   = useState('AAPL')
  const [strategy, setStrategy] = useState('ml')
  const [period,   setPeriod]   = useState('2y')
  const [capital,  setCapital]  = useState(10000)
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState(null)

  const runBacktest = async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch(
        `/api/backtest/run?symbol=${symbol}&strategy=${strategy}` +
        `&period=${period}&initial_capital=${capital}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `w-full bg-primary border border-white/10 rounded-lg px-3 py-2.5
                      text-white text-sm focus:outline-none focus:border-accent text-right`

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-white">🧪 בדיקת אסטרטגיה (Backtest)</h1>
        <p className="text-muted text-sm mt-1">
          בדוק את ביצועי האסטרטגיה על נתונים היסטוריים עם Walk-Forward Optimization
        </p>
      </div>

      {/* Config Card */}
      <div className="card">
        <h3 className="text-white font-bold mb-4">⚙️ הגדרות</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-muted text-xs mb-1 block">סימבול</label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              className={inputClass}
              placeholder="AAPL"
            />
          </div>
          <div>
            <label className="text-muted text-xs mb-1 block">תקופה</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className={inputClass + ' cursor-pointer'}>
              {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-muted text-xs mb-1 block">הון התחלתי ($)</label>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        {/* Strategy Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {STRATEGIES.map(s => (
            <button
              key={s.id}
              onClick={() => setStrategy(s.id)}
              className={`p-3 rounded-lg border text-right transition
                ${strategy === s.id
                  ? 'border-accent/50 bg-accent/10 text-white'
                  : 'border-white/10 text-muted hover:border-white/20 hover:text-white'}`}
            >
              <div className="font-bold text-sm">{s.label}</div>
              <div className="text-xs opacity-70 mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>

        <button
          onClick={runBacktest}
          disabled={loading}
          className="w-full py-3 bg-accent text-primary font-bold rounded-lg
                     hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '⏳ מריץ backtest...' : '▶️ הרץ Backtest'}
        </button>
      </div>

      {error && (
        <div className="card bg-danger/10 border border-danger/20">
          <p className="text-danger text-sm">⚠️ {error}</p>
        </div>
      )}

      {result && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="תשואה כוללת"
              value={`${result.total_return_pct >= 0 ? '+' : ''}${result.total_return_pct}%`}
              color={result.total_return_pct >= 0 ? 'text-accent' : 'text-danger'}
            />
            <MetricCard
              label="Sharpe Ratio"
              value={result.sharpe_ratio}
              color={result.sharpe_ratio >= 1 ? 'text-accent' : result.sharpe_ratio >= 0 ? 'text-warning' : 'text-danger'}
              sub="≥1 טוב"
            />
            <MetricCard
              label="Max Drawdown"
              value={`${result.max_drawdown_pct}%`}
              color="text-danger"
            />
            <MetricCard
              label="אחוז ניצחון"
              value={`${result.win_rate_pct}%`}
              color={result.win_rate_pct >= 50 ? 'text-accent' : 'text-danger'}
            />
            <MetricCard
              label="מספר עסקאות"
              value={result.total_trades}
            />
            <MetricCard
              label="הון סופי"
              value={`$${result.final_capital?.toLocaleString()}`}
              color="text-white"
            />
          </div>

          {/* Equity Curve */}
          {result.equity_curve && (
            <div className="card">
              <h3 className="text-white font-bold mb-3">
                📈 עקומת הון — {result.symbol} | {result.strategy} | {result.period}
              </h3>
              <MiniEquityCurve data={result.equity_curve} />
            </div>
          )}

          {/* Walk-Forward */}
          {result.walk_forward && result.walk_forward.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold">🔁 Walk-Forward Optimization</h3>
                <span className={`text-sm font-bold ${result.wf_avg_return >= 0 ? 'text-accent' : 'text-danger'}`}>
                  ממוצע: {result.wf_avg_return >= 0 ? '+' : ''}{result.wf_avg_return}%
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted text-xs border-b border-white/5">
                      {['תקופה','תשואה','Sharpe','Win Rate','Max DD'].map(h => (
                        <th key={h} className="text-right py-2 px-3 font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.walk_forward.map(wf => (
                      <tr key={wf.fold} className="border-b border-white/5">
                        <td className="py-2 px-3 text-muted">Fold {wf.fold}</td>
                        <td className={`py-2 px-3 font-bold ${wf.return >= 0 ? 'text-accent' : 'text-danger'}`} dir="ltr">
                          {wf.return >= 0 ? '+' : ''}{wf.return}%
                        </td>
                        <td className="py-2 px-3 text-white" dir="ltr">{wf.sharpe}</td>
                        <td className="py-2 px-3 text-white" dir="ltr">{wf.win_rate}%</td>
                        <td className="py-2 px-3 text-danger" dir="ltr">{wf.max_dd}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Trades */}
          {result.trades && result.trades.length > 0 && (
            <div className="card">
              <h3 className="text-white font-bold mb-3">📜 עסקאות אחרונות</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted text-xs border-b border-white/5">
                      <th className="text-right py-2 px-3 font-normal">#</th>
                      <th className="text-right py-2 px-3 font-normal">כניסה</th>
                      <th className="text-right py-2 px-3 font-normal">יציאה</th>
                      <th className="text-right py-2 px-3 font-normal">רווח/הפסד $</th>
                      <th className="text-right py-2 px-3 font-normal">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(0, 20).map((t, i) => (
                      <tr key={i} className="border-b border-white/5">
                        <td className="py-2 px-3 text-muted">{i + 1}</td>
                        <td className="py-2 px-3 text-white" dir="ltr">${t.entry?.toFixed(2)}</td>
                        <td className="py-2 px-3 text-white" dir="ltr">${t.exit?.toFixed(2)}</td>
                        <td className={`py-2 px-3 font-bold ${t.pnl >= 0 ? 'text-accent' : 'text-danger'}`} dir="ltr">
                          {t.pnl >= 0 ? '+' : ''}{t.pnl}$
                        </td>
                        <td className={`py-2 px-3 ${t.pnl_pct >= 0 ? 'text-accent' : 'text-danger'}`} dir="ltr">
                          {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
