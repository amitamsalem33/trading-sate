import { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'

const PERIODS = [
  { label: '1D', period: '1d',  interval: '5m'  },
  { label: '5D', period: '5d',  interval: '15m' },
  { label: '1M', period: '1mo', interval: '1h'  },
  { label: '3M', period: '3mo', interval: '1d'  },
  { label: '6M', period: '6mo', interval: '1d'  },
  { label: '1Y', period: '1y',  interval: '1d'  },
]

// Binance symbol: ends with USDT / BTC / ETH / BNB / BUSD
const isCrypto = (sym) => /^[A-Z0-9]+(USDT|BTC|ETH|BNB|BUSD)$/i.test(sym)

export default function CandlestickChart({ symbol, entryPrice, stopLoss, takeProfit }) {
  const chartContainerRef = useRef(null)
  const chartRef          = useRef(null)
  const candleSeriesRef   = useRef(null)
  const volumeSeriesRef   = useRef(null)
  const wsRef             = useRef(null)
  const pollRef           = useRef(null)

  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[3])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [rtStatus,       setRtStatus]       = useState(null) // 'live' | 'polling' | null

  // ── Chart initialization (once) ─────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#242938' },
        textColor: '#8892a4',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      width:     chartContainerRef.current.clientWidth,
      height:    420,
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor:       '#00d4aa',
      downColor:     '#ff4d6d',
      borderVisible: false,
      wickUpColor:   '#00d4aa',
      wickDownColor: '#ff4d6d',
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    chartRef.current        = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    const handleResize = () =>
      chart.applyOptions({ width: chartContainerRef.current.clientWidth })
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  // ── Load historical data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!symbol || !candleSeriesRef.current) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/market/ohlcv/${symbol}?period=${selectedPeriod.period}&interval=${selectedPeriod.interval}`
        )
        const { data } = await res.json()
        if (data?.length > 0) {
          const sorted = data.sort((a, b) => a.time - b.time)
          candleSeriesRef.current.setData(sorted)
          volumeSeriesRef.current.setData(
            sorted.map(c => ({
              time:  c.time,
              value: c.volume || 0,
              color: c.close >= c.open ? 'rgba(0,212,170,0.4)' : 'rgba(255,77,109,0.4)',
            }))
          )
          chartRef.current.timeScale().fitContent()
        }
      } catch {
        setError('שגיאה בטעינת נתונים')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [symbol, selectedPeriod])

  // ── Real-time updates ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!symbol || !candleSeriesRef.current) return

    const stopRt = () => {
      if (wsRef.current)   { wsRef.current.close(); wsRef.current = null }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      setRtStatus(null)
    }

    stopRt()

    if (isCrypto(symbol)) {
      // Binance WebSocket — interval already Binance-compatible (5m, 15m, 1h, 1d)
      const ws = new WebSocket(
        `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${selectedPeriod.interval}`
      )
      wsRef.current = ws

      ws.onopen  = () => setRtStatus('live')
      ws.onerror = () => setRtStatus(null)
      ws.onclose = () => setRtStatus(null)

      ws.onmessage = (event) => {
        const { k } = JSON.parse(event.data)
        if (!k) return
        const candle = {
          time:  Math.floor(k.t / 1000),
          open:  parseFloat(k.o),
          high:  parseFloat(k.h),
          low:   parseFloat(k.l),
          close: parseFloat(k.c),
        }
        candleSeriesRef.current?.update(candle)
        volumeSeriesRef.current?.update({
          time:  candle.time,
          value: parseFloat(k.v),
          color: candle.close >= candle.open
            ? 'rgba(0,212,170,0.4)'
            : 'rgba(255,77,109,0.4)',
        })
      }
    } else {
      // Stock: poll the server every 10 seconds and update the last candle
      const poll = async () => {
        try {
          const res = await fetch(
            `/api/market/ohlcv/${symbol}?period=${selectedPeriod.period}&interval=${selectedPeriod.interval}`
          )
          const { data } = await res.json()
          if (data?.length > 0) {
            const last = data.sort((a, b) => a.time - b.time).at(-1)
            candleSeriesRef.current?.update(last)
            volumeSeriesRef.current?.update({
              time:  last.time,
              value: last.volume || 0,
              color: last.close >= last.open
                ? 'rgba(0,212,170,0.4)'
                : 'rgba(255,77,109,0.4)',
            })
          }
        } catch { /* silent */ }
      }

      pollRef.current = setInterval(poll, 10_000)
      setRtStatus('polling')
    }

    return stopRt
  }, [symbol, selectedPeriod])

  return (
    <div className="card p-0 overflow-hidden relative">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 p-3 border-b border-white/5">
        <div className="flex gap-2 flex-1">
          {PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setSelectedPeriod(p)}
              className={`px-3 py-1 rounded text-xs transition ${
                selectedPeriod.label === p.label
                  ? 'bg-accent text-primary font-bold'
                  : 'text-muted hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {rtStatus === 'live' && (
          <span className="flex items-center gap-1.5 text-xs text-accent shrink-0">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            Live
          </span>
        )}
        {rtStatus === 'polling' && (
          <span className="flex items-center gap-1.5 text-xs text-muted shrink-0">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            ~10s
          </span>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/50 z-10 text-accent">
          טוען גרף...
        </div>
      )}
      <div ref={chartContainerRef} />
    </div>
  )
}
