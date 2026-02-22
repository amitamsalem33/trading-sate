# backend/app/routers/screener.py
from fastapi import APIRouter, Query
from ..engine.signal_fusion import generate_signal
import yfinance as yf
import asyncio

router = APIRouter()

# ── Predefined small-cap / penny stock watchlist ──────────────────────────────
SMALL_CAP_UNIVERSE = [
    # Small/Micro Cap US Stocks
    "SOUN", "BBAI", "IDEX", "MVIS", "CLOV", "AGEN", "MULN",
    "NKLA", "RIDE", "WKHS", "GOEV", "SPCE", "BLNK", "NNDM",
    "FREY", "SURF", "MMAT", "PROG", "ILUS", "FFIE",
    # Popular penny stocks / volatile
    "AMC",  "GME",  "BBBY", "CTRM", "NAKD",
    # Crypto proxies
    "MSTR","COIN","RIOT","MARA","HUT",
]

CRYPTO_UNIVERSE = [
    "BTC-USD", "ETH-USD", "SOL-USD", "ADA-USD", "DOGE-USD",
    "XRP-USD",  "AVAX-USD","LINK-USD","DOT-USD", "MATIC-USD",
]

def _quick_screener_score(symbol: str) -> dict | None:
    """Fast screening using only technical features (no ML/sentiment for speed)."""
    try:
        ticker = yf.Ticker(symbol)
        df     = ticker.history(period="1mo", interval="1d")
        if df.empty or len(df) < 10:
            return None

        close   = df['Close']
        volume  = df['Volume']
        returns = close.pct_change()

        rsi_val = _calc_rsi(close, 14)
        vol_ratio = float(volume.iloc[-1] / volume.mean()) if volume.mean() > 0 else 1
        mom_5d    = float((close.iloc[-1] / close.iloc[-5] - 1) * 100) if len(close) >= 5 else 0
        mom_20d   = float((close.iloc[-1] / close.iloc[-20] - 1) * 100) if len(close) >= 20 else 0

        current_price = float(close.iloc[-1])
        sma_20        = float(close.rolling(20).mean().iloc[-1])
        near_breakout = current_price > sma_20 * 0.99

        # Breakout score
        score = 0
        if rsi_val < 40:      score += 2
        if rsi_val > 60:      score += 1
        if vol_ratio > 1.5:   score += 2
        if mom_5d  > 5:       score += 2
        if mom_20d > 10:      score += 1
        if near_breakout:     score += 2

        if score < 4:
            return None

        return {
            "symbol":        symbol,
            "price":         round(current_price, 4),
            "rsi":           round(rsi_val, 1),
            "volume_ratio":  round(vol_ratio, 2),
            "momentum_5d":   round(mom_5d, 2),
            "momentum_20d":  round(mom_20d, 2),
            "score":         score,
            "alert_he":      _generate_alert(symbol, score, rsi_val, vol_ratio, mom_5d, mom_20d),
        }
    except:
        return None


def _calc_rsi(series, period=14):
    delta = series.diff()
    gain  = delta.where(delta > 0, 0).rolling(period).mean()
    loss  = (-delta.where(delta < 0, 0)).rolling(period).mean()
    rs    = gain / (loss + 1e-9)
    return float(100 - (100 / (1 + rs.iloc[-1])))


def _generate_alert(symbol, score, rsi, vol_ratio, mom_5d, mom_20d) -> str:
    """Generate a Hebrew alert string."""
    parts = []
    if rsi < 35:
        parts.append(f"RSI ({rsi:.0f}) מצביע על מכירת יתר — הזדמנות קנייה")
    if vol_ratio > 2:
        parts.append(f"נפח מסחר גבוה פי {vol_ratio:.1f} מהממוצע — סימן לפריצה")
    if mom_5d > 8:
        parts.append(f"מומנטום של +{mom_5d:.1f}% ב-5 ימים אחרונים")
    if mom_20d > 15:
        parts.append(f"עלייה של +{mom_20d:.1f}% בחודש — טרנד חזק")

    confidence_txt = "גבוהה מאוד" if score >= 7 else "גבוהה" if score >= 5 else "בינונית"

    return (
        f"⚡ לפי האלגוריתם, {symbol} מציג הזדמנות מסחר ברמת ביטחון {confidence_txt}. "
        + " | ".join(parts) + "."
    )


@router.get("/small-cap")
async def screen_small_caps(
    limit:      int  = Query(10, ge=1, le=30),
    deep_scan:  bool = Query(False, description="הרץ ניתוח ML מלא על המועמדים הטובים"),
):
    """Screen small-cap universe for breakout opportunities."""
    results = []
    for sym in SMALL_CAP_UNIVERSE:
        r = _quick_screener_score(sym)
        if r:
            results.append(r)

    results.sort(key=lambda x: x['score'], reverse=True)
    results = results[:limit]

    if deep_scan and results:
        top3 = results[:3]
        for item in top3:
            try:
                full = generate_signal(item['symbol'])
                item['full_signal']   = full.get('decision', 'החזק')
                item['confidence']    = full.get('confidence', 0)
                item['reasoning_he']  = full.get('reasoning_he', '')
                item['stop_loss']     = full.get('stop_loss')
                item['take_profit']   = full.get('take_profit')
                item['alert_he']      = full.get('reasoning_he', item['alert_he'])
            except:
                pass

    return {
        "count":   len(results),
        "results": results,
        "universe_size": len(SMALL_CAP_UNIVERSE),
    }


@router.get("/crypto")
async def screen_crypto(limit: int = Query(8, ge=1, le=20)):
    """Screen crypto universe."""
    results = []
    for sym in CRYPTO_UNIVERSE:
        r = _quick_screener_score(sym)
        if r:
            results.append(r)
    results.sort(key=lambda x: x['score'], reverse=True)
    return {"count": len(results), "results": results[:limit]}


@router.get("/custom")
async def screen_custom(
    symbols: str = Query(..., description="CSV: AAPL,TSLA,NVDA"),
    deep:    bool = Query(False),
):
    """Screen a custom list of symbols."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:20]
    results  = []
    for sym in sym_list:
        r = _quick_screener_score(sym)
        if r is None:
            try:
                import yfinance as yf
                t = yf.Ticker(sym)
                p = t.fast_info.last_price
                r = {"symbol": sym, "price": p, "score": 0, "alert_he": "אין אות ברור"}
            except:
                continue
        results.append(r)
    results.sort(key=lambda x: x.get('score', 0), reverse=True)
    return {"count": len(results), "results": results}
