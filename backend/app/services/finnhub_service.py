# backend/app/services/finnhub_service.py
import finnhub
from datetime import date, timedelta
from ..config import get_settings

settings  = get_settings()
fh_client = finnhub.Client(api_key=settings.finnhub_api_key)

class FinnhubService:

    def get_company_profile(self, symbol: str) -> dict:
        try:
            return fh_client.company_profile2(symbol=symbol.upper())
        except:
            return {}

    def get_basic_financials(self, symbol: str) -> dict:
        try:
            return fh_client.company_basic_financials(symbol.upper(), 'all')
        except:
            return {}

    def get_news(self, symbol: str, days: int = 7) -> list:
        try:
            today   = date.today().strftime("%Y-%m-%d")
            from_dt = (date.today() - timedelta(days=days)).strftime("%Y-%m-%d")
            return fh_client.company_news(symbol.upper(), _from=from_dt, to=today)
        except:
            return []

    def get_recommendation_trends(self, symbol: str) -> list:
        try:
            return fh_client.recommendation_trends(symbol.upper())
        except:
            return []

    def get_earnings_calendar(self, symbol: str) -> dict:
        try:
            today   = date.today().strftime("%Y-%m-%d")
            to_dt   = (date.today() + timedelta(days=30)).strftime("%Y-%m-%d")
            return fh_client.earnings_calendar(
                _from=today, to=to_dt, symbol=symbol.upper()
            )
        except:
            return {}


finnhub_service = FinnhubService()
