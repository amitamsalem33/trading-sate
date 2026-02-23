from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from .database import create_tables, SessionLocal, PaperTrade
from .routers import market, trading, signals, news, screener, backtest
from .services.yfinance_service import yf_service


def _fetch_price(symbol: str) -> float:
    """Get latest price with OHLCV fallback."""
    try:
        p = yf_service.get_quote(symbol).get("price")
        if p:
            return float(p)
    except Exception:
        pass
    try:
        data = yf_service.get_ohlcv(symbol, period="1d", interval="5m").get("data", [])
        if data:
            return float(sorted(data, key=lambda x: x["time"])[-1]["close"])
    except Exception:
        pass
    return 0.0

async def check_limit_orders():
    from datetime import datetime
    while True:
        try:
            db = SessionLocal()

            # ── 1. Trigger pending LIMIT orders ──────────────────────────────
            pending = db.query(PaperTrade).filter_by(
                order_type="LIMIT", is_triggered=False, is_open=False
            ).all()
            for trade in pending:
                try:
                    current = _fetch_price(trade.symbol)
                    if not current:
                        continue
                    triggered = (
                        (trade.direction == "BUY"  and current <= trade.limit_price) or
                        (trade.direction == "SELL" and current >= trade.limit_price)
                    )
                    if triggered:
                        trade.entry_price  = current
                        trade.is_triggered = True
                        trade.is_open      = True
                        direction_he = "קנייה" if trade.direction == "BUY" else "מכירה"
                        print(f"✅ LIMIT הופעל! {trade.symbol} | {direction_he} | יעד: ${trade.limit_price} | מחיר: ${current}")
                except Exception as e:
                    print(f"⚠️ שגיאה ב-{trade.symbol}: {e}")
                    continue

            # ── 2. Check Stop Loss & Take Profit on open positions ────────────
            open_trades = db.query(PaperTrade).filter_by(is_open=True).all()
            for trade in open_trades:
                try:
                    current = _fetch_price(trade.symbol)
                    if not current:
                        continue
                    sl_hit = tp_hit = False
                    if trade.direction == "BUY":
                        sl_hit = trade.stop_loss   and current <= trade.stop_loss
                        tp_hit = trade.take_profit and current >= trade.take_profit
                    else:  # SELL
                        sl_hit = trade.stop_loss   and current >= trade.stop_loss
                        tp_hit = trade.take_profit and current <= trade.take_profit

                    if sl_hit or tp_hit:
                        reason = "סטופ לוס 🛑" if sl_hit else "טייק פרופיט 🎯"
                        close_price = trade.stop_loss if sl_hit else trade.take_profit
                        pnl = (close_price - trade.entry_price) * trade.quantity
                        if trade.direction == "SELL":
                            pnl = -pnl
                        trade.exit_price = close_price
                        trade.pnl        = round(pnl, 2)
                        trade.is_open    = False
                        trade.closed_at  = datetime.utcnow()
                        print(f"🔒 {reason} הופעל! {trade.symbol} | כניסה: ${trade.entry_price} | סגירה: ${close_price} | P&L: ${round(pnl,2)}")
                except Exception as e:
                    print(f"⚠️ שגיאה בבדיקת SL/TP {trade.symbol}: {e}")
                    continue

            db.commit()
            db.close()
        except Exception as e:
            print(f"⚠️ שגיאה כללית: {e}")
        await asyncio.sleep(10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    print("✅ Database tables created")
    task = asyncio.create_task(check_limit_orders())
    print("✅ Limit order checker started")
    yield
    task.cancel()
    print("🛑 Shutting down")


app = FastAPI(
    title="Quant Trading Platform API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173","https://trading-platform-roan.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router,   prefix="/api/market",   tags=["שוק"])
app.include_router(trading.router,  prefix="/api/trading",  tags=["מסחר"])
app.include_router(signals.router,  prefix="/api/signals",  tags=["אותות"])
app.include_router(news.router,     prefix="/api/news",     tags=["חדשות"])
app.include_router(screener.router, prefix="/api/screener", tags=["סורק"])
app.include_router(backtest.router, prefix="/api/backtest", tags=["בקטסט"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "message": "המערכת פעילה"}
