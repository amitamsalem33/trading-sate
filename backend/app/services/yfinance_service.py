# backend/app/services/yfinance_service.py
import yfinance as yf
import pandas as pd
from datetime import datetime, date, timedelta
from typing import Optional
import time

# ── Simple in-memory TTL cache ────────────────────────────────────────────────
_cache: dict = {}

def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and time.time() < entry['expires']:
        return entry['value']
    return None

def _cache_set(key: str, value, ttl_seconds: int):
    _cache[key] = {'value': value, 'expires': time.time() + ttl_seconds}

class YFinanceService:
    """
    Central service for all yfinance data fetching.
    All methods return clean, serializable Python dicts/lists.
    """

    def get_ohlcv(
        self,
        symbol: str,
        period: str = "3mo",
        interval: str = "1d"
    ) -> dict:
        """
        Fetch OHLCV candlestick data.
        Returns a list of candles formatted for TradingView Lightweight Charts.
        """
        cache_key = f"ohlcv:{symbol}:{period}:{interval}"
        cached = _cache_get(cache_key)
        if cached:
            return cached

        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)

        if df.empty:
            return {"symbol": symbol, "data": [], "error": "לא נמצאו נתונים"}

        df = df.reset_index()

        # Determine the datetime column name (varies by interval)
        time_col = "Datetime" if "Datetime" in df.columns else "Date"

        candles = []
        for _, row in df.iterrows():
            ts = row[time_col]
            # Convert to UTC unix timestamp (int) — required by Lightweight Charts
            if hasattr(ts, "timestamp"):
                unix_time = int(ts.timestamp())
            else:
                unix_time = int(
                    datetime.combine(ts, datetime.min.time()).timestamp()
                )

            candles.append({
                "time":   unix_time,
                "open":   round(float(row["Open"]),   4),
                "high":   round(float(row["High"]),   4),
                "low":    round(float(row["Low"]),     4),
                "close":  round(float(row["Close"]),   4),
                "volume": int(row["Volume"]) if row["Volume"] == row["Volume"] else 0,
            })

        result = {"symbol": symbol, "data": candles}
        _cache_set(cache_key, result, ttl_seconds=60)
        return result

    def get_quote(self, symbol: str) -> dict:
        """
        Fetch the latest real-time-like quote with key stats.
        """
        cache_key = f"quote:{symbol}"
        cached = _cache_get(cache_key)
        if cached:
            return cached

        ticker = yf.Ticker(symbol)
        info = ticker.info  # full info dict
        fast = ticker.fast_info

        # Safely extract fields — yfinance keys can vary by asset type
        def safe(key, fallback=None):
            return info.get(key, fallback)

        result = {
            "symbol":           symbol.upper(),
            "name":             safe("longName") or safe("shortName") or symbol,
            "price":            safe("currentPrice") or safe("regularMarketPrice")
                                    or getattr(fast, "last_price", None),
            "previous_close":   safe("previousClose")
                                    or getattr(fast, "previous_close", None),
            "open":             safe("open") or safe("regularMarketOpen"),
            "day_high":         safe("dayHigh") or safe("regularMarketDayHigh"),
            "day_low":          safe("dayLow")  or safe("regularMarketDayLow"),
            "volume":           safe("volume")  or safe("regularMarketVolume"),
            "market_cap":       safe("marketCap"),
            "pe_ratio":         safe("trailingPE"),
            "eps":              safe("trailingEps"),
            "52w_high":         safe("fiftyTwoWeekHigh"),
            "52w_low":          safe("fiftyTwoWeekLow"),
            "currency":         safe("currency") or getattr(fast, "currency", "USD"),
            "exchange":         safe("exchange"),
            "sector":           safe("sector"),
            "industry":         safe("industry"),
        }
        _cache_set(cache_key, result, ttl_seconds=30)
        return result

    def get_fundamentals(self, symbol: str) -> dict:
        """
        Fetch key fundamental data for the Reasoning Panel.
        Returns empty fields gracefully for crypto / unavailable symbols.
        """
        cache_key = f"fundamentals:{symbol}"
        cached = _cache_get(cache_key)
        if cached:
            return cached

        try:
            ticker = yf.Ticker(symbol)
            info   = ticker.info
        except Exception:
            return {"symbol": symbol.upper()}

        def safe(key, fallback=None):
            return info.get(key, fallback)

        result = {
            "symbol":              symbol.upper(),
            "market_cap":          safe("marketCap"),
            "pe_ratio":            safe("trailingPE"),
            "forward_pe":          safe("forwardPE"),
            "pb_ratio":            safe("priceToBook"),
            "ps_ratio":            safe("priceToSalesTrailing12Months"),
            "ev_ebitda":           safe("enterpriseToEbitda"),
            "profit_margin":       safe("profitMargins"),
            "revenue_growth":      safe("revenueGrowth"),
            "earnings_growth":     safe("earningsGrowth"),
            "debt_to_equity":      safe("debtToEquity"),
            "return_on_equity":    safe("returnOnEquity"),
            "free_cashflow":       safe("freeCashflow"),
            "dividend_yield":      safe("dividendYield"),
            "beta":                safe("beta"),
            "short_ratio":         safe("shortRatio"),
            "analyst_target":      safe("targetMeanPrice"),
            "recommendation":      safe("recommendationKey"),
        }
        _cache_set(cache_key, result, ttl_seconds=300)  # 5 min for fundamentals
        return result

    def get_multiple_quotes(self, symbols: list[str]) -> list[dict]:
        """
        Batch-fetch quotes for the watchlist / screener.
        """
        results = []
        for sym in symbols:
            try:
                results.append(self.get_quote(sym))
            except Exception as e:
                results.append({"symbol": sym, "error": str(e)})
        return results


# Singleton — import this instance everywhere
yf_service = YFinanceService()
