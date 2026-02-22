# backend/app/routers/news.py
from fastapi import APIRouter, HTTPException, Query
from datetime import date, timedelta
import finnhub
from ..config import get_settings

router   = APIRouter()
settings = get_settings()

# Finnhub client (synchronous SDK — fast enough for our needs)
fh_client = finnhub.Client(api_key=settings.finnhub_api_key)

def _safe_news(items: list) -> list:
    """Clean and normalize Finnhub news items."""
    clean = []
    for item in items:
        clean.append({
            "id":       item.get("id"),
            "headline": item.get("headline", ""),
            "summary":  item.get("summary",  ""),
            "source":   item.get("source",   ""),
            "url":      item.get("url",       ""),
            "image":    item.get("image",     ""),
            "datetime": item.get("datetime",  0),   # unix timestamp
            "category": item.get("category",  ""),
        })
    # Sort newest first
    return sorted(clean, key=lambda x: x["datetime"], reverse=True)

@router.get("/{symbol}")
async def get_company_news(
    symbol: str,
    days:   int = Query(7, ge=1, le=30, description="How many days back to fetch"),
):
    """
    Fetch company-specific news from Finnhub for a given symbol.
    """
    try:
        today    = date.today().strftime("%Y-%m-%d")
        from_dt  = (date.today() - timedelta(days=days)).strftime("%Y-%m-%d")
        news     = fh_client.company_news(symbol.upper(), _from=from_dt, to=today)
        return {
            "symbol": symbol.upper(),
            "count":  len(news),
            "news":   _safe_news(news)[:25],  # cap at 25 articles
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאה בטעינת חדשות: {str(e)}")

@router.get("/market/general")
async def get_general_news(
    category: str = Query("general", description="general forex crypto merger"),
):
    """
    Fetch general market news (not symbol-specific).
    """
    try:
        news = fh_client.general_news(category, min_id=0)
        return {
            "category": category,
            "count":    len(news),
            "news":     _safe_news(news)[:20],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"שגיאה בטעינת חדשות: {str(e)}")
