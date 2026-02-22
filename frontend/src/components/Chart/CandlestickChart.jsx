import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'

const PERIODS = [
  { label: '1D', period: '1d', interval: '5m' },
  { label: '5D', period: '5d', interval: '15m' },
  { label: '1M', period: '1mo', interval: '1h' },
  { label: '3M', period: '3mo', interval: '1d' },
  { label: '6M', period: '6mo', interval: '1d' },
  { label: '1Y', period: '1y', interval: '1d' },
]

export default function CandlestickChart({ symbol, entryPrice, stopLoss, takeProfit }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[3])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: '#242938' }, textColor: '#8892a4' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      width: chartContainerRef.current.clientWidth,
      height: 420,
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true },
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00d4aa', downColor: '#ff4d6d', borderVisible: false,
      wickUpColor: '#00d4aa', wickDownColor: '#ff4d6d',
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current.clientWidth })
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!symbol || !candleSeriesRef.current) return
    
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/market/ohlcv/${symbol}?period=${selectedPeriod.period}&interval=${selectedPeriod.interval}`)
        const { data } = await res.json()
        if (data && data.length > 0) {
          candleSeriesRef.current.setData(data.sort((a, b) => a.time - b.time))
          chartRef.current.timeScale().fitContent()
        }
      } catch (err) {
        setError("שגיאה בטעינת נתונים")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [symbol, selectedPeriod])

  return (
    <div className="card p-0 overflow-hidden relative">
      <div className="flex gap-2 p-3 border-b border-white/5">
        {PERIODS.map(p => (
          <button key={p.label} onClick={() => setSelectedPeriod(p)} 
            className={`px-3 py-1 rounded text-xs ${selectedPeriod.label === p.label ? 'bg-accent text-primary' : 'text-muted'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-surface/50 z-10 text-accent">טוען גרף...</div>}
      <div ref={chartContainerRef} />
    </div>
  )
}
