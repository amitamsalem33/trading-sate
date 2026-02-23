
# backend/app/routers/market.py
from fastapi import WebSocket, WebSocketDisconnect
import asyncio
import json
import yfinance as yf
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db, WatchlistItem
from ..services.yfinance_service import yf_service

router = APIRouter()

# ── OHLCV Candlestick Data ────────────────────────────────────────────────────

@router.get("/ohlcv/{symbol}")
async def get_ohlcv(
    symbol: str,
    period:   str = Query("3mo", description="1d 5d 1mo 3mo 6mo 1y 2y 5y"),
    interval: str = Query("1d",  description="1m 5m 15m 30m 1h 1d 1wk 1mo"),
):
    """
    Returns candlestick data formatted for TradingView Lightweight Charts.
    Powered exclusively by yfinance.
    """
    result = yf_service.get_ohlcv(symbol.upper(), period, interval)
    if not result["data"]:
        raise HTTPException(status_code=404, detail=f"לא נמצאו נתונים עבור {symbol}")
    return result

# ── Real-time-like Quote ──────────────────────────────────────────────────────

@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    """
    Returns the latest price and key market stats for a symbol.
    """
    try:
        return yf_service.get_quote(symbol.upper())
    except Exception as e:
        # Return partial data instead of crashing (e.g. rate limit from yfinance)
        return {"symbol": symbol.upper(), "error": str(e)}

# ── Fundamentals ──────────────────────────────────────────────────────────────

@router.get("/fundamentals/{symbol}")
async def get_fundamentals(symbol: str):
    # Always return 200 — crypto symbols won't have most fields (that's OK)
    try:
        return yf_service.get_fundamentals(symbol.upper())
    except Exception:
        return {"symbol": symbol.upper()}

# ── Batch Quotes (for watchlist) ──────────────────────────────────────────────

@router.get("/quotes/batch")
async def get_batch_quotes(
    symbols: str = Query(..., description="Comma-separated list: AAPL,TSLA,NVDA")
):
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return yf_service.get_multiple_quotes(sym_list)

# ── Watchlist CRUD ────────────────────────────────────────────────────────────

@router.get("/watchlist")
async def get_watchlist(db: Session = Depends(get_db)):
    items = db.query(WatchlistItem).all()
    symbols = [i.symbol for i in items]
    if not symbols:
        return {"items": []}
    quotes = yf_service.get_multiple_quotes(symbols)
    return {"items": quotes}

@router.post("/watchlist/{symbol}")
async def add_to_watchlist(symbol: str, db: Session = Depends(get_db)):
    sym = symbol.upper()
    existing = db.query(WatchlistItem).filter_by(symbol=sym).first()
    if existing:
        return {"message": f"{sym} כבר נמצא ברשימת המעקב"}
    db.add(WatchlistItem(symbol=sym))
    db.commit()
    return {"message": f"{sym} נוסף לרשימת המעקב בהצלחה ✓"}

@router.delete("/watchlist/{symbol}")
async def remove_from_watchlist(symbol: str, db: Session = Depends(get_db)):
    db.query(WatchlistItem).filter_by(symbol=symbol.upper()).delete()
    db.commit()
    return {"message": f"{symbol.upper()} הוסר מרשימת המעקב"}
    
# ── WebSocket: מחיר חי לכל נכס ──────────────────────────────────────────────

def _is_crypto(symbol: str) -> bool:
    return symbol.endswith("-USD") or symbol.endswith("USDT") or \
           symbol in {"BTC","ETH","SOL","DOGE","ADA","XRP"}

def _binance_symbol(symbol: str) -> str:
    """המר סימבול yfinance לסימבול Binance"""
    return symbol.replace("-USD","USDT").replace("-","").upper()

@router.websocket("/ws/{symbol}")
async def websocket_price(websocket: WebSocket, symbol: str):
    await websocket.accept()
    sym = symbol.upper()

    if _is_crypto(sym):
        await _stream_crypto(websocket, sym)
    else:
        await _stream_stock(websocket, sym)


async def _stream_crypto(websocket: WebSocket, symbol: str):
    """Binance WebSocket — עדכון כל שנייה"""
    import websockets as ws_lib
    binance_sym = _binance_symbol(symbol).lower()
    url = f"wss://stream.binance.com:9443/ws/{binance_sym}@trade"
    try:
        async with ws_lib.connect(url) as binance_ws:
            await websocket.send_json({"type": "connected", "source": "binance"})
            while True:
                try:
                    raw  = await asyncio.wait_for(binance_ws.recv(), timeout=10)
                    data = json.loads(raw)
                    price = float(data.get("p", 0))
                    if price:
                        await websocket.send_json({
                            "type":   "price",
                            "symbol": symbol,
                            "price":  price,
                            "time":   data.get("T", 0),
                            "source": "binance"
                        })
                except asyncio.TimeoutError:
                    await websocket.send_json({"type": "ping"})
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass


async def _stream_stock(websocket: WebSocket, symbol: str):
    """Finnhub WebSocket — עדכון בזמן אמת למניות"""
    from ..config import get_settings
    settings = get_settings()
    url = f"wss://ws.finnhub.io?token={settings.finnhub_api_key}"
    import websockets as ws_lib
    try:
        async with ws_lib.connect(url) as fh_ws:
            # הירשם לסימבול
            await fh_ws.send(json.dumps({"type":"subscribe","symbol": symbol}))
            await websocket.send_json({"type": "connected", "source": "finnhub"})
            last_price = None
            while True:
                try:
                    raw  = await asyncio.wait_for(fh_ws.recv(), timeout=15)
                    data = json.loads(raw)
                    if data.get("type") == "trade" and data.get("data"):
                        trade = data["data"][-1]
                        price = float(trade.get("p", 0))
                        if price and price != last_price:
                            last_price = price
                            await websocket.send_json({
                                "type":   "price",
                                "symbol": symbol,
                                "price":  price,
                                "volume": trade.get("v", 0),
                                "time":   trade.get("t", 0),
                                "source": "finnhub"
                            })
                except asyncio.TimeoutError:
                    await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass
