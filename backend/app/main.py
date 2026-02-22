from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from .database import create_tables, SessionLocal, PaperTrade
from .routers import market, trading, signals, news, screener, backtest
from .services.yfinance_service import yf_service


async def check_limit_orders():
    while True:
        try:
            db = SessionLocal()
            pending = db.query(PaperTrade).filter_by(
                order_type="LIMIT", is_triggered=False, is_open=False
            ).all()
            for trade in pending:
                try:
                    current = yf_service.get_quote(trade.symbol).get("price", 0)
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
    allow_origins=["http://localhost:5173"],
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
