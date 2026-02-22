// frontend/src/components/Trading/Portfolio.jsx
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { tradingAPI } from '../../api/client'

export default function Portfolio() {
  const { t }       = useTranslation()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey:        ['portfolio'],
    queryFn:         () => tradingAPI.getPortfolio(),
    refetchInterval: 30_000,   // refresh every 30s
  })

  const handleClose = async (tradeId) => {
    if (!window.confirm('לסגור את העסקה הזו?')) return
    try {
      const res = await tradingAPI.closeTrade(tradeId)
      alert(res.message)
      queryClient.invalidateQueries(['portfolio'])
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה')
    }
  }

  if (isLoading) return <div className="card text-muted text-sm text-center">⏳ טוען תיק...</div>
  if (error)     return <div className="card text-danger text-sm text-center">⚠️ שגיאה בטעינה</div>

  const { positions = [], total_pnl = 0, total_pnl_pct = 0, total_investment = 0 } = data || {}

  return (
    <div className="card">
      <h3 className="text-white font-bold text-base mb-4">💼 {t('portfolio')}</h3>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'השקעה',      value: `$${total_investment.toFixed(2)}`,  color: 'text-white' },
          { label: 'רווח/הפסד',  value: `$${total_pnl.toFixed(2)}`,         color: total_pnl >= 0 ? 'text-accent' : 'text-danger' },
          { label: 'אחוז שינוי', value: `${total_pnl_pct.toFixed(2)}%`,     color: total_pnl_pct >= 0 ? 'text-accent' : 'text-danger' },
        ].map(s => (
          <div key={s.label} className="bg-primary rounded-lg p-3 text-center">
            <div className="text-muted text-xs mb-1">{s.label}</div>
            <div className={`font-bold text-sm ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Positions Table */}
      {positions.length === 0 ? (
        <p className="text-muted text-sm text-center py-4">אין עסקאות פתוחות</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs border-b border-white/5">
                <th className="text-right py-2 pr-2">סימבול</th>
                <th className="text-right py-2">כיוון</th>
                <th className="text-right py-2">כמות</th>
                <th className="text-right py-2">כניסה</th>
                <th className="text-right py-2">נוכחי</th>
                <th className="text-right py-2">רווח/הפסד</th>
                <th className="text-right py-2">פעולה</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(pos => (
                <tr key={pos.id} className="border-b border-white/5 hover:bg-white/2 transition">
                  <td className="py-2 pr-2 font-bold text-white">{pos.symbol}</td>
                  <td className={`py-2 font-medium ${pos.direction === 'BUY' ? 'text-accent' : 'text-danger'}`}>
                    {pos.direction_he}
                  </td>
                  <td className="py-2 text-white">{pos.quantity}</td>
                  <td className="py-2 text-muted" dir="ltr">${pos.entry_price?.toFixed(2)}</td>
                  <td className="py-2 text-white" dir="ltr">${pos.current_price?.toFixed(2)}</td>
                  <td className={`py-2 font-bold ${pos.pnl >= 0 ? 'text-accent' : 'text-danger'}`} dir="ltr">
                    {pos.pnl >= 0 ? '+' : ''}{pos.pnl?.toFixed(2)}$
                    <span className="text-xs text-muted mr-1">({pos.pnl_pct?.toFixed(1)}%)</span>
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => handleClose(pos.id)}
                      className="text-xs px-2 py-1 bg-danger/10 text-danger
                                 border border-danger/20 rounded hover:bg-danger/20 transition"
                    >
                      סגור
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
