# backend/app/engine/sentiment.py
"""Sentiment Analysis Engine
Uses keyword-based scoring of news headlines.
"""
import re
import finnhub
from datetime import date, timedelta
from ..config import get_settings

settings = get_settings()

# ── Keyword dictionaries ───────────────────────────────────────────────────────
BULLISH_WORDS = {
    'surge', 'jump', 'rally', 'soar', 'beat', 'exceed', 'record',
    'growth', 'profit', 'gain', 'rise', 'bull', 'upgrade', 'buy',
    'strong', 'positive', 'optimistic', 'breakthrough', 'partnership',
    'revenue', 'expansion', 'acquisition', 'dividend', 'earnings beat',
    'guidance raised', 'outperform', 'overweight', 'recovery',
}

BEARISH_WORDS = {
    'fall', 'drop', 'crash', 'plunge', 'miss', 'loss', 'decline',
    'bear', 'downgrade', 'sell', 'weak', 'negative', 'concern', 'risk',
    'lawsuit', 'investigation', 'cut', 'layoff', 'bankruptcy', 'debt',
    'warning', 'guidance cut', 'underperform', 'underweight', 'recall',
    'fraud', 'penalty', 'fine', 'recession', 'default',
}

class SentimentEngine:
    def score_text(self, text: str) -> dict:
        """
        Score a single text string.
        Returns: { score: float (-1 to +1), label: str, confidence: float }
        """
        if not text or len(text.strip()) < 5:
            return {"score": 0.0, "label": "neutral", "confidence": 0.5}
        return self._keyword_score(text)

    def _keyword_score(self, text: str) -> dict:
        text_lower = text.lower()
        words      = set(re.findall(r'\b\w+\b', text_lower))
        bull_hits = len(words & BULLISH_WORDS)
        bear_hits = len(words & BEARISH_WORDS)
        total     = bull_hits + bear_hits
        if total == 0:
            return {"score": 0.0, "label": "neutral", "confidence": 0.5}
        score = (bull_hits - bear_hits) / total
        conf  = min(0.5 + total * 0.08, 0.90)
        if score > 0.1:   label = "positive"
        elif score < -0.1: label = "negative"
        else:              label = "neutral"
        return {"score": round(score, 4), "label": label, "confidence": round(conf, 4)}

    def score_news_batch(self, news_items: list) -> dict:
        """
        Score a batch of news articles and return aggregate sentiment.
        """
        if not news_items:
            return {
                "aggregate_score":    0.0,
                "label":              "neutral",
                "bullish_count":      0,
                "bearish_count":      0,
                "neutral_count":      0,
                "total_articles":     0,
                "scored_articles":    [],
            }
        scored   = []
        scores   = []
        bull_cnt = bear_cnt = neu_cnt = 0
        for item in news_items[:15]:   # cap at 15 for speed
            headline = item.get('headline', '')
            summary  = item.get('summary', '')
            text     = f"{headline}. {summary}"[:400]
            result = self.score_text(text)
            scored.append({
                "headline":   headline[:120],
                "url":        item.get('url', ''),
                "source":     item.get('source', ''),
                "datetime":   item.get('datetime', 0),
                "sentiment":  result['label'],
                "score":      result['score'],
                "confidence": result['confidence'],
            })
            scores.append(result['score'])
            if result['label'] == 'positive': bull_cnt += 1
            elif result['label'] == 'negative': bear_cnt += 1
            else: neu_cnt += 1
        agg = float(sum(scores) / len(scores)) if scores else 0.0
        if agg > 0.15:    agg_label = "חיובי 📈"
        elif agg < -0.15: agg_label = "שלילי 📉"
        else:              agg_label = "ניטרלי ➡️"
        return {
            "aggregate_score":  round(agg, 4),
            "label":            agg_label,
            "bullish_count":    bull_cnt,
            "bearish_count":    bear_cnt,
            "neutral_count":    neu_cnt,
            "total_articles":   len(news_items),
            "scored_articles":  scored,
        }

    def get_symbol_sentiment(self, symbol: str, days: int = 7) -> dict:
        """
        Fetch Finnhub news for symbol and return aggregate sentiment.
        """
        try:
            client   = finnhub.Client(api_key=settings.finnhub_api_key)
            today    = date.today().strftime("%Y-%m-%d")
            from_dt  = (date.today() - timedelta(days=days)).strftime("%Y-%m-%d")
            news     = client.company_news(symbol.upper(), _from=from_dt, to=today)
            return self.score_news_batch(news)
        except Exception as e:
            return {
                "aggregate_score": 0.0, "label": "ניטרלי ➡️",
                "bullish_count": 0, "bearish_count": 0, "neutral_count": 0,
                "total_articles": 0, "scored_articles": [],
                "error": str(e),
            }

# Singleton
sentiment_engine = SentimentEngine()
