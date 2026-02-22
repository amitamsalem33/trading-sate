# backend/app/routers/backtest.py
from fastapi import APIRouter, Query
from ..engine.backtester import run_backtest

router = APIRouter()

@router.post("/run")
async def run_backtest_endpoint(
    symbol:          str   = Query(..., description="סימבול כגון AAPL"),
    period:          str   = Query("2y",    description="1y 2y 5y"),
    strategy:        str   = Query("ml",    description="ml rsi macd sma"),
    initial_capital: float = Query(10000.0, description="הון התחלתי"),
):
    """Run a full backtest and return performance metrics + equity curve."""
    result = run_backtest(
        symbol          = symbol.upper(),
        period          = period,
        initial_capital = initial_capital,
        strategy        = strategy,
    )
    return result

@router.get("/strategies")
async def list_strategies():
    return {
        "strategies": [
            {"id": "ml",   "name": "ML Ensemble (XGBoost + RF)", "description": "מודל למידת מכונה מתקדם"},
            {"id": "rsi",  "name": "RSI Strategy",               "description": "קנייה ב-RSI < 30, מכירה ב-RSI > 70"},
            {"id": "macd", "name": "MACD Crossover",             "description": "פריצת MACD"},
            {"id": "sma",  "name": "SMA 20/50 Crossover",        "description": "חציית ממוצעים נעים"},
        ]
    }
