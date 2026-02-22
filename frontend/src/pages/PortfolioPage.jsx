import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

function PendingOrders() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey:        ['pending-orders'],
    queryFn:         () => fetch('/api/trading/pending').then(r => r.json()),
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (!data?.pending_orders?.length) return
    const timer = setInterval(async () => {
      try {
        const res  = await fetch('/api/trading/check-limits', { method: 'POST' })
        const json = await res.json()
        if (json.triggered > 0) {
          queryClient.invalidateQueries(['pending-orders'])
          queryClient.invalidateQueries(['portfolio'])
          const symbols = json.orders.map(o => o.symbol).join(', ')
          alert("✅ פקודת Limit הופעלה! " + symbols)
        }
      } catch(e) {}
    }, 30_000)
    return () => clearInterval(timer)
  }, [data?.pending_orders?.length])

  const cancelOrder = async (id) => {
    if (!window.confirm('לבטל את הפקודה הממתינה?')) return
    await fetch("/api/trading/pending/" + id, { method: 'DELETE' })
    queryClient.invalidateQueries(['pending-orders'])
  }

  const checkNow = async () => {
    try {
      const res  = await fetch('/api/trading/check-limits', { method: 'POST' })
      const data = await res.json()
      if (data.triggered > 0) {
        alert("✅ " + data.triggered + " פקודות הופעלו!")
        queryClient.invalidateQueries(['pending-orders'])
        queryClient.invalidateQueries(['portfolio'])
      } else {
        alert('אין פקודות שהגיעו למחיר היעד כרגע')
      }
    } catch(e) { alert('שגיאה בבדיקה') }
  }

  const orders = data?.pending_orders || []

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-bold text-base">
          🎯 פקודות Limit ממתינות
          {orders.length > 0 && (
            <span className="mr-2 text-xs bg-warning/20 text-warning rounded-full px-2 py-0.5">
              {orders.length}
            </span>
          )}
        </h2>
        <button onClick={checkNow}
          className="text-xs px-3 py-1.5 bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/20 transition">
          🔄 בדוק מחירים
        </button>
      </div>
      {isLoading ? (
        <p className="text-muted text-sm text-center py-3">⏳ טוען...</p>
      ) : orders.length === 0 ? (
        <p className="text-muted text-sm text-center py-4">אין פקודות ממתינות</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-white/5">
                {['סימבול','כיוון','כמות','מחיר יעד','נוכחי','הפרש','ביטול'].map(h => (
                  <th key={h} className="text-right py-2 px-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-b border-white/5">
                  <td className="py-2 px-2 font-bold text-white">{o.symbol}</td>
                  <td className={"py-2 px-2 font-medium " + (o.direction === 'BUY' ? 'text-accent' : 'text-danger')}>
                    {o.direction_he}
                  </td>
                  <td className="py-2 px-2 text-white" dir="ltr">{o.quantity}</td>
                  <td className="py-2 px-2 text-warning font-bold" dir="ltr">${o.limit_price?.toFixed(2)}</td>
                  <td className="py-2 px-2 text-white" dir="ltr">${o.current_price?.toFixed(2)}</td>
                  <td className={"py-2 px-2 text-xs font-bold " + (o.diff_pct <= 0 ? 'text-accent' : 'text-muted')} dir="ltr">
                    {o.diff_pct > 0 ? '+' : ''}{o.diff_pct}%
                  </td>
                  <td className="py-2 px-2">
                    <button onClick={() => cancelOrder(o.id)}
                      className="text-xs px-2 py-1 bg-danger/10 text-danger border border-danger/20 rounded hover:bg-danger/20">
                      ביטול
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PortfolioPage() {
  const queryClient = useQueryClient()

  const handleReset = async () => {
    if (!window.confirm('⚠️ האם אתה בטוח? פעולה זו תמחק את כל העסקאות!')) return
    try {
      await fetch('/api/trading/reset', { method: 'DELETE' })
      queryClient.invalidateQueries(['portfolio'])
      queryClient.invalidateQueries(['trade-history'])
      queryClient.invalidateQueries(['pending-orders'])
      alert('✅ התיק אופס בהצלחה')
    } catch(e) { alert('שגיאה באיפוס') }
  }

  const { data: open, isLoading: openLoading } = useQuery({
    queryKey:        ['portfolio'],
    queryFn:         () => fetch('/api/trading/portfolio').then(r => r.json()),
    refetchInterval: 30_000,
  })

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ['trade-history'],
    queryFn:  () => fetch('/api/trading/history').then(r => r.json()),
  })

  const positions = open?.positions || []
  const trades    = history?.trades  || []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">💼 תיק ההשקעות שלי</h1>
        <button onClick={handleReset}
          className="px-4 py-2 bg-danger/10 text-danger border border-danger/30 rounded-lg text-sm font-bold hover:bg-danger/20 transition">
          🗑️ איפוס תיק
        </button>
      </div>

      {!openLoading && open && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'עסקאות פתוחות',      value: open.open_count || 0,                        color: 'text-white'  },
            { label: 'השקעה כוללת',        value: "$" + (open.total_investment || 0).toFixed(2), color: 'text-white'  },
            { label: 'רווח/הפסד לא ממומש', value: "$" + (open.total_pnl || 0).toFixed(2),        color: (open.total_pnl || 0) >= 0 ? 'text-accent' : 'text-danger' },
            { label: 'ביצועים %',          value: (open.total_pnl_pct || 0).toFixed(2) + "%",   color: (open.total_pnl_pct || 0) >= 0 ? 'text-accent' : 'text-danger' },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <div className="text-muted text-xs mb-1">{s.label}</div>
              <div className={"font-bold text-lg " + s.color} dir="ltr">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <PendingOrders />

      <div className="card">
        <h2 className="text-white font-bold text-base mb-4">📂 פוזיציות פתוחות</h2>
        {openLoading ? (
          <p className="text-muted text-sm text-center">⏳ טוען...</p>
        ) : positions.length === 0 ? (
          <p className="text-muted text-sm text-center py-4">אין פוזיציות פתוחות</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-white/5">
                  {['סימבול','כיוון','כמות','כניסה','נוכחי','SL','TP','רווח/הפסד','%'].map(h => (
                    <th key={h} className="text-right py-2 px-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/2">
                    <td className="py-2 px-2 font-bold text-white">{p.symbol}</td>
                    <td className={"py-2 px-2 font-medium " + (p.direction === 'BUY' ? 'text-accent' : 'text-danger')}>{p.direction_he}</td>
                    <td className="py-2 px-2 text-white" dir="ltr">{p.quantity}</td>
                    <td className="py-2 px-2 text-muted" dir="ltr">${p.entry_price?.toFixed(2)}</td>
                    <td className="py-2 px-2 text-white" dir="ltr">${p.current_price?.toFixed(2)}</td>
                    <td className="py-2 px-2 text-danger text-xs" dir="ltr">{p.stop_loss ? "$"+p.stop_loss.toFixed(2) : '—'}</td>
                    <td className="py-2 px-2 text-accent text-xs" dir="ltr">{p.take_profit ? "$"+p.take_profit.toFixed(2) : '—'}</td>
                    <td className={"py-2 px-2 font-bold " + (p.pnl >= 0 ? 'text-accent' : 'text-danger')} dir="ltr">
                      {p.pnl >= 0 ? '+' : ''}{p.pnl?.toFixed(2)}$
                    </td>
                    <td className={"py-2 px-2 text-xs " + (p.pnl_pct >= 0 ? 'text-accent' : 'text-danger')} dir="ltr">
                      {p.pnl_pct?.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-base">📜 היסטוריית עסקאות</h2>
          {!histLoading && history && (
            <span className={"text-sm font-bold " + ((history.total_realized_pnl || 0) >= 0 ? 'text-accent' : 'text-danger')}>
              רווח ממומש: ${(history.total_realized_pnl || 0).toFixed(2)}
            </span>
          )}
        </div>
        {histLoading ? (
          <p className="text-muted text-sm text-center">⏳ טוען...</p>
        ) : trades.length === 0 ? (
          <p className="text-muted text-sm text-center py-4">אין עסקאות סגורות עדיין</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs border-b border-white/5">
                  {['סימבול','כיוון','כמות','כניסה','יציאה','רווח/הפסד','%','תאריך'].map(h => (
                    <th key={h} className="text-right py-2 px-2 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(t => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/2">
                    <td className="py-2 px-2 font-bold text-white">{t.symbol}</td>
                    <td className={"py-2 px-2 " + (t.direction === 'BUY' ? 'text-accent' : 'text-danger')}>{t.direction_he}</td>
                    <td className="py-2 px-2 text-white" dir="ltr">{t.quantity}</td>
                    <td className="py-2 px-2 text-muted" dir="ltr">${t.entry_price?.toFixed(2)}</td>
                    <td className="py-2 px-2 text-white" dir="ltr">${t.exit_price?.toFixed(2)}</td>
                    <td className={"py-2 px-2 font-bold " + (t.pnl >= 0 ? 'text-accent' : 'text-danger')} dir="ltr">
                      {t.pnl >= 0 ? '+' : ''}{t.pnl?.toFixed(2)}$
                    </td>
                    <td className={"py-2 px-2 text-xs " + (t.pnl_pct >= 0 ? 'text-accent' : 'text-danger')} dir="ltr">
                      {t.pnl_pct?.toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-muted text-xs">
                      {t.closed_at ? new Date(t.closed_at).toLocaleDateString('he-IL') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
