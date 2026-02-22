// frontend/src/components/Trading/OrderPanel.jsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tradingAPI } from '../../api/client'
import { useQueryClient } from '@tanstack/react-query'

export default function OrderPanel({ symbol, currentPrice, onOrderPlaced }) {
  const { t }       = useTranslation()
  const queryClient = useQueryClient()

  const [direction,   setDirection]   = useState('BUY')
  const [orderType,   setOrderType]   = useState('MARKET')
  const [quantity,    setQuantity]    = useState(1)
  const [limitPrice,  setLimitPrice]  = useState('')
  const [stopLoss,    setStopLoss]    = useState('')
  const [takeProfit,  setTakeProfit]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [message,     setMessage]     = useState(null)

  const isBuy     = direction === 'BUY'
  const isLimit   = orderType === 'LIMIT'
  const execPrice = isLimit ? parseFloat(limitPrice) || 0 : currentPrice || 0
  const totalValue= execPrice ? (quantity * execPrice).toFixed(2) : '—'

  // מחיר ביחס לנוכחי
  const priceDiff = isLimit && currentPrice && limitPrice
    ? (((parseFloat(limitPrice) - currentPrice) / currentPrice) * 100).toFixed(2)
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLimit && !limitPrice) {
      setMessage({ text: 'חובה להזין מחיר יעד לפקודת Limit', type: 'error' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await tradingAPI.placeOrder({
        symbol,
        direction,
        quantity:    parseFloat(quantity),
        order_type:  orderType,
        limit_price: isLimit ? parseFloat(limitPrice) : null,
        stop_loss:   stopLoss   ? parseFloat(stopLoss)   : null,
        take_profit: takeProfit ? parseFloat(takeProfit) : null,
      })
      setMessage({ text: res.message, type: 'success' })
      queryClient.invalidateQueries(['portfolio'])
      queryClient.invalidateQueries(['pending-orders'])
      if (onOrderPlaced) onOrderPlaced(res)
    } catch (err) {
      setMessage({
        text: err.response?.data?.detail || 'שגיאה בביצוע הפקודה',
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `w-full bg-primary border border-white/10 rounded-lg px-3 py-2
                      text-white text-sm focus:outline-none focus:border-accent text-right`

  return (
    <div className="card">
      <h3 className="text-white font-bold text-base mb-4 flex items-center gap-2">
        📋 ביצוע פקודה
        <span className="text-muted text-xs font-normal mr-auto">
          {symbol} · {currentPrice ? `$${currentPrice.toFixed(2)}` : '...'}
        </span>
      </h3>

      {/* ── Buy / Sell ── */}
      <div className="flex rounded-lg overflow-hidden mb-3 border border-white/10">
        <button type="button" onClick={() => setDirection('BUY')}
          className={`flex-1 py-2.5 font-bold text-sm transition
            ${isBuy ? 'bg-accent text-primary' : 'text-muted hover:text-white'}`}>
          📈 קנייה
        </button>
        <button type="button" onClick={() => setDirection('SELL')}
          className={`flex-1 py-2.5 font-bold text-sm transition
            ${!isBuy ? 'bg-danger text-white' : 'text-muted hover:text-white'}`}>
          📉 מכירה
        </button>
      </div>

      {/* ── Market / Limit ── */}
      <div className="flex rounded-lg overflow-hidden mb-4 border border-white/10">
        <button type="button" onClick={() => setOrderType('MARKET')}
          className={`flex-1 py-2 text-xs font-bold transition
            ${!isLimit ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}>
          ⚡ Market — מיידי
        </button>
        <button type="button" onClick={() => setOrderType('LIMIT')}
          className={`flex-1 py-2 text-xs font-bold transition
            ${isLimit ? 'bg-warning/20 text-warning border-warning/30' : 'text-muted hover:text-white'}`}>
          🎯 Limit — מחיר יעד
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">

        {/* Limit Price — מוצג רק אם LIMIT */}
        {isLimit && (
          <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
            <label className="text-warning text-xs font-bold mb-1 block">
              🎯 מחיר יעד לביצוע
            </label>
            <input
              type="number" step="0.01" value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)}
              placeholder={currentPrice ? `נוכחי: $${currentPrice.toFixed(2)}` : ''}
              className={inputClass + ' border-warning/30'}
              required={isLimit}
            />
            {priceDiff !== null && (
              <p className={`text-xs mt-1 ${
                parseFloat(priceDiff) > 0 ? 'text-accent' : 'text-danger'
              }`}>
                {parseFloat(priceDiff) > 0 ? '▲' : '▼'} {Math.abs(priceDiff)}% מהמחיר הנוכחי
                {isBuy && parseFloat(priceDiff) < 0 && ' — קנייה בהנחה ✓'}
                {isBuy && parseFloat(priceDiff) > 0 && ' — קנייה בפרמיה'}
                {!isBuy && parseFloat(priceDiff) > 0 && ' — מכירה בפרמיה ✓'}
              </p>
            )}
          </div>
        )}

        {/* Quantity */}
        <div>
          <label className="text-muted text-xs mb-1 block">כמות</label>
          <input type="number" min="0.0001" step="0.0001"
            value={quantity} onChange={e => setQuantity(e.target.value)}
            className={inputClass} required />
        </div>

        {/* Stop Loss */}
        <div>
          <label className="text-xs mb-1 flex justify-between">
            <span className="text-danger">סטופ לוס</span>
            <span className="text-muted text-xs">אופציונלי</span>
          </label>
          <input type="number" step="0.01" value={stopLoss}
            onChange={e => setStopLoss(e.target.value)}
            placeholder="—" className={inputClass} />
        </div>

        {/* Take Profit */}
        <div>
          <label className="text-xs mb-1 flex justify-between">
            <span className="text-accent">טייק פרופיט</span>
            <span className="text-muted text-xs">אופציונלי</span>
          </label>
          <input type="number" step="0.01" value={takeProfit}
            onChange={e => setTakeProfit(e.target.value)}
            placeholder="—" className={inputClass} />
        </div>

        {/* Summary */}
        <div className="bg-primary rounded-lg p-3 text-sm flex justify-between">
          <span className="text-muted">
            {isLimit ? 'שווי בביצוע:' : 'שווי כולל:'}
          </span>
          <span className="text-white font-bold">${totalValue}</span>
        </div>

        {/* Message */}
        {message && (
          <div className={`rounded-lg px-3 py-2 text-sm font-medium
            ${message.type === 'success'
              ? 'bg-accent/10 text-accent border border-accent/20'
              : 'bg-danger/10 text-danger border border-danger/20'}`}>
            {message.text}
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={loading || !currentPrice}
          className={`w-full py-3 rounded-lg font-bold text-sm transition
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isBuy ? 'bg-accent text-primary' : 'bg-danger text-white'}`}>
          {loading ? 'מבצע...' : isLimit
            ? `🎯 צור פקודת Limit — ${isBuy ? 'קנה' : 'מכור'} ב-$${limitPrice || '?'}`
            : `${isBuy ? '📈 קנה' : '📉 מכור'} ${quantity} × ${symbol}`}
        </button>
      </form>
    </div>
  )
}
