# backend/app/engine/signal_fusion.py
"""
Signal Fusion Engine — The Alpha Core
Combines:
  1. Technical Analysis (feature_engineering)
  2. ML Ensemble (XGBoost + RF)
  3. Sentiment Analysis (FinBERT / keyword)
  4. Fundamental Analysis (yfinance)
  5. Risk Management (Kelly + ATR)
→ Outputs final BUY/SELL/HOLD decision in Hebrew with full reasoning
"""
import traceback
from typing import Optional
from .feature_engineering import feature_engineer
from .ml_ensemble         import ml_ensemble
from .sentiment           import sentiment_engine
from .risk_manager        import risk_manager
from ..services.yfinance_service import yf_service


# ── Weights for signal fusion ─────────────────────────────────────────────────
WEIGHTS = {
    "ml":          0.40,   # ML ensemble (XGBoost + RF)
    "sentiment":   0.30,   # News sentiment (FinBERT)
    "technical":   0.20,   # Rule-based TA signals
    "fundamental": 0.10,   # Fundamental score
}


def _ta_score(features: dict) -> float:
    """Rule-based TA score from -1 to +1."""
    score = 0.0
    weight_sum = 0.0

    checks = [
        (features.get('rsi_os', 0) == 1,          0.15,  +1, "RSI oversold"),
        (features.get('rsi_ob', 0) == 1,          0.15,  -1, "RSI overbought"),
        (features.get('macd_cross', 0) == 1,      0.20,  +1, "MACD bullish cross"),
        (features.get('sma_cross_20_50', 0) == 1, 0.15,  +1, "SMA20 > SMA50"),
        (features.get('bullish_divergence', 0),   0.15,  +1, "Bullish divergence"),
        (features.get('bearish_divergence', 0),   0.15,  -1, "Bearish divergence"),
        (features.get('volume_surge', 0) == 1 and
         features.get('price_vs_sma20', 0) > 0,  0.10,  +1, "Volume surge + uptrend"),
        (features.get('near_support', 0) == 1,    0.10,  +1, "Near support level"),
        (features.get('near_resistance', 0) == 1, 0.10,  -1, "Near resistance level"),
        (features.get('bb_pct', 0.5) < 0.10,      0.10,  +1, "BB lower band touch"),
        (features.get('bb_pct', 0.5) > 0.90,      0.10,  -1, "BB upper band touch"),
        (features.get('hammer', 0) == 1,           0.05,  +1, "Hammer candle"),
        (features.get('price_vs_vwap', 0) > 0.01, 0.05,  +1, "Price above VWAP"),
        (features.get('price_vs_vwap', 0) < -0.01,0.05,  -1, "Price below VWAP"),
    ]

    triggered = []
    for condition, weight, direction, label in checks:
        weight_sum += weight
        if condition:
            score      += weight * direction
            triggered.append({"signal": label, "direction": direction, "weight": weight})

    normalized = score / (weight_sum + 1e-9)
    return normalized, triggered


def _fundamental_score(fundamentals: dict) -> float:
    """Fundamental score from -1 to +1."""
    score = 0.0
    pe    = fundamentals.get('pe_ratio')
    fpe   = fundamentals.get('forward_pe')
    roe   = fundamentals.get('return_on_equity')
    mg    = fundamentals.get('profit_margin')
    rg    = fundamentals.get('revenue_growth')
    de    = fundamentals.get('debt_to_equity')
    beta  = fundamentals.get('beta')

    # P/E analysis
    if pe and 0 < pe < 15:   score += 0.3
    elif pe and pe > 40:      score -= 0.2
    elif pe and 15 <= pe < 25: score += 0.1

    # Forward P/E vs trailing
    if fpe and pe and fpe < pe: score += 0.2  # earnings growing

    # ROE
    if roe and roe > 0.15: score += 0.2
    elif roe and roe < 0:  score -= 0.3

    # Margin
    if mg and mg > 0.20: score += 0.15
    elif mg and mg < 0:  score -= 0.2

    # Revenue growth
    if rg and rg > 0.15: score += 0.15
    elif rg and rg < 0:  score -= 0.15

    # Debt
    if de and de > 200:  score -= 0.2
    elif de and de < 50: score += 0.1

    return max(-1.0, min(1.0, score))


def _to_hebrew_decision(score: float, confidence: float) -> dict:
    """Convert numeric score to Hebrew decision label."""
    if score > 0.15 and confidence > 0.50:
        label, color, emoji = "קנייה",  "green",  "📈"
    elif score < -0.15 and confidence > 0.50:
        label, color, emoji = "מכירה", "red",    "📉"
    else:
        label, color, emoji = "החזק",  "yellow", "⏸️"
    return {"label": label, "color": color, "emoji": emoji, "score": round(score, 4)}


def _generate_hebrew_reasoning(
    symbol:      str,
    decision:    dict,
    features:    dict,
    ml_result:   dict,
    sentiment:   dict,
    ta_signals:  list,
    fundamentals:dict,
    risk:        dict,
) -> str:
    """Generate a full Hebrew explanation of the algorithm's reasoning."""

    label     = decision['label']
    score     = decision['score']
    ml_conf   = round(ml_result['confidence'] * 100, 1)
    sent_lbl  = sentiment.get('label', 'ניטרלי')
    bull_cnt  = sentiment.get('bullish_count', 0)
    bear_cnt  = sentiment.get('bearish_count', 0)
    rsi       = round(features.get('rsi_14', 50), 1)
    vol_ratio = round(features.get('volume_ratio', 1), 2)
    atr_pct   = round(features.get('atr_pct', 0) * 100, 2)
    price     = features.get('price', 0)

    # ── Headline ──
    reasons = []

    reasons.append(
        f"**המלצה: {label} {decision['emoji']}**\n"
        f"ציון אלגוריתמי כולל: {round((score + 1) / 2 * 100, 1)}/100 "
        f"| רמת ביטחון: {ml_conf}%"
    )

    # ── ML Block ──
    ml_dec  = {1: "קנייה", 0: "החזק", -1: "מכירה"}.get(ml_result['decision'], "החזק")
    proba   = ml_result.get('probabilities', {})
    reasons.append(
        f"\n📊 **ניתוח מכונה (XGBoost + Random Forest):**\n"
        f"המודל מסווג את {symbol} כ-**{ml_dec}** "
        f"עם הסתברות: קנייה {round(proba.get('buy',0)*100,1)}% | "
        f"החזק {round(proba.get('hold',0)*100,1)}% | "
        f"מכירה {round(proba.get('sell',0)*100,1)}%"
    )

    # ── TA Block ──
    ta_pos = [s for s in ta_signals if s['direction'] > 0]
    ta_neg = [s for s in ta_signals if s['direction'] < 0]
    reasons.append(f"\n📐 **ניתוח טכני ({len(ta_signals)} אותות):**")

    if ta_pos:
        reasons.append("✅ אותות חיוביים: " + ", ".join([s['signal'] for s in ta_pos]))
    if ta_neg:
        reasons.append("❌ אותות שליליים: " + ", ".join([s['signal'] for s in ta_neg]))

    reasons.append(
        f"RSI(14): {rsi} "
        f"{'— אזור מכירת יתר 🟢' if rsi < 35 else '— אזור קניית יתר 🔴' if rsi > 65 else '— ניטרלי ⚪'} | "
        f"נפח מסחר: {vol_ratio}x ממוצע | "
        f"תנודתיות (ATR): {atr_pct}%"
    )

    # ── Sentiment Block ──
    reasons.append(
        f"\n📰 **ניתוח סנטימנט חדשות (Finnhub + מילות מפתח):**\n"
        f"סנטימנט כולל: **{sent_lbl}** | "
        f"חיוביות: {bull_cnt} כתבות | שליליות: {bear_cnt} כתבות\n"
        f"סקרנו {sentiment.get('total_articles', 0)} כתבות מ-7 הימים האחרונים"
    )

    # ── Fundamentals Block ──
    pe  = fundamentals.get('pe_ratio')
    roe = fundamentals.get('return_on_equity')
    if pe or roe:
        reasons.append(
            f"\n📈 **נתוני יסוד:**\n"
            f"{'P/E: ' + str(round(pe,1)) if pe else 'P/E: לא זמין'} | "
            f"{'ROE: ' + str(round(roe*100,1)) + '%' if roe else 'ROE: לא זמין'}"
        )

    # ── Risk Block ──
    if risk:
        reasons.append(
            f"\n🛡️ **ניהול סיכונים (ATR-based):**\n"
            f"כניסה: ${round(price, 2)} | "
            f"סטופ לוס: ${risk.get('stop_loss', '—')} "
            f"({risk.get('sl_pct', '—')}% סיכון) | "
            f"מטרה: ${risk.get('take_profit', '—')} "
            f"({risk.get('tp_pct', '—')}% רווח)\n"
            f"יחס סיכון/תגמול: 1:{risk.get('risk_reward', '—')} | "
            f"גודל פוזיציה מומלץ: {risk.get('recommended_shares', '?')} יחידות"
        )

    return "\n".join(reasons)


def generate_signal(symbol: str) -> dict:
    """
    Main entry point — generates full Alpha signal for a symbol.
    Returns comprehensive dict with decision, reasoning, sources, risk levels.
    """
    result = {
        "symbol":       symbol.upper(),
        "decision":     "החזק",
        "emoji":        "⏸️",
        "color":        "yellow",
        "confidence":   0.5,
        "entry_price":  None,
        "stop_loss":    None,
        "take_profit":  None,
        "reasoning_he": "מחשב...",
        "sources":      [],
        "ml_result":    {},
        "sentiment":    {},
        "risk":         {},
        "ta_signals":   [],
        "error":        None,
    }

    try:
        # ── Step 1: Feature Engineering ──────────────────────────
        features     = feature_engineer.get_latest_features(symbol)
        fundamentals = yf_service.get_fundamentals(symbol)
        price        = features['price']
        atr_14       = features.get('atr_14', price * 0.02)
        volatility   = features.get('volatility_20', 0.25)

        # ── Step 2: ML Ensemble ───────────────────────────────────
        try:
            # Try training first if not trained
            if not ml_ensemble.trained:
                df_train = feature_engineer.get_feature_matrix(symbol, period="2y")
                ml_ensemble.train(df_train)
            ml_result = ml_ensemble.predict(features)
        except Exception as e:
            ml_result = ml_ensemble._rule_based_fallback(features)

        # ── Step 3: TA Score ──────────────────────────────────────
        ta_score_val, ta_signals = _ta_score(features)

        # ── Step 4: Sentiment ─────────────────────────────────────
        sentiment = sentiment_engine.get_symbol_sentiment(symbol, days=7)
        sent_score = sentiment.get('aggregate_score', 0.0)

        # ── Step 5: Fundamental Score ─────────────────────────────
        fund_score = _fundamental_score(fundamentals)

        # ── Step 6: ML Score conversion (-1 to +1) ───────────────
        ml_decision = ml_result['decision']           # -1, 0, 1
        ml_conf     = ml_result['confidence']
        ml_score    = ml_decision * ml_conf            # weighted

        # ── Step 7: Fusion ────────────────────────────────────────
        fused_score = (
            WEIGHTS['ml']          * ml_score    +
            WEIGHTS['sentiment']   * sent_score  +
            WEIGHTS['technical']   * ta_score_val+
            WEIGHTS['fundamental'] * fund_score
        )

        combined_confidence = (
            ml_conf * 0.5 +
            min(abs(sent_score) + 0.3, 1.0) * 0.3 +
            min(abs(ta_score_val) + 0.3, 1.0) * 0.2
        )

        # ── Step 8: Decision ──────────────────────────────────────
        decision = _to_hebrew_decision(fused_score, combined_confidence)

        # ── Step 9: Risk Levels ───────────────────────────────────
        direction = "BUY" if decision['label'] == "קנייה" else \
                    "SELL" if decision['label'] == "מכירה" else "BUY"
        risk = risk_manager.full_risk_assessment(
            price          = price,
            atr_14         = atr_14,
            volatility_20d = volatility,
            win_probability= combined_confidence,
            direction      = direction,
        )

        # ── Step 10: Hebrew Reasoning ─────────────────────────────
        reasoning = _generate_hebrew_reasoning(
            symbol, decision, features, ml_result,
            sentiment, ta_signals, fundamentals, risk,
        )

        # ── Step 11: Sources ──────────────────────────────────────
        sources = [
            {
                "headline":  a['headline'],
                "url":       a['url'],
                "source":    a['source'],
                "sentiment": a['sentiment'],
                "score":     a['score'],
                "datetime":  a['datetime'],
            }
            for a in sentiment.get('scored_articles', [])[:5]
        ]

        result.update({
            "decision":          decision['label'],
            "emoji":             decision['emoji'],
            "color":             decision['color'],
            "fused_score":       round(fused_score, 4),
            "confidence":        round(combined_confidence, 4),
            "entry_price":       round(price, 4),
            "stop_loss":         risk.get('stop_loss'),
            "take_profit":       risk.get('take_profit'),
            "risk_reward":       risk.get('risk_reward'),
            "recommended_shares":risk.get('recommended_shares'),
            "reasoning_he":      reasoning,
            "sources":           sources,
            "ml_result":         ml_result,
            "sentiment":         sentiment,
            "risk":              risk,
            "ta_signals":        ta_signals,
            "features":          {k: v for k, v in features.items()
                                  if k not in ('resistance_20','support_20','vwap')},
        })

    except Exception as e:
        result['error']        = str(e)
        result['reasoning_he'] = f"שגיאה בחישוב האות: {str(e)}"
        print(f"Signal error for {symbol}: {traceback.format_exc()}")

    return result
