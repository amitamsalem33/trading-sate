// frontend/src/hooks/useLivePrice.js
import { useState, useEffect, useRef, useCallback } from 'react'

export function useLivePrice(symbol) {
  const [price,     setPrice]     = useState(null)
  const [prevPrice, setPrevPrice] = useState(null)
  const [source,    setSource]    = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef    = useRef(null)
  const symRef   = useRef(symbol)

  const connect = useCallback(() => {
    if (!symbol) return
    // סגור חיבור קיים
    if (wsRef.current) {
      wsRef.current.close()
    }

    const ws = new WebSocket(`ws://localhost:8000/api/market/ws/${symbol}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'price' && data.price) {
        setPrice(prev => {
          setPrevPrice(prev)
          return data.price
        })
        setSource(data.source)
      }
      if (data.type === 'connected') {
        setSource(data.source)
      }
    }

    ws.onerror = () => {
      setConnected(false)
    }

    ws.onclose = () => {
      setConnected(false)
      // נסה להתחבר מחדש אחרי 3 שניות
      setTimeout(() => {
        if (symRef.current === symbol) connect()
      }, 3000)
    }
  }, [symbol])

  useEffect(() => {
    symRef.current = symbol
    setPrice(null)
    setPrevPrice(null)
    setConnected(false)
    connect()
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [symbol])

  const direction = price && prevPrice
    ? price > prevPrice ? 'up' : price < prevPrice ? 'down' : 'same'
    : 'same'

  return { price, prevPrice, direction, connected, source }
}
