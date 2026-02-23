# backend/app/routers/signals.py
from fastapi import APIRouter, BackgroundTasks
from ..engine.signal_fusion  import generate_signal
from ..database import get_db, CachedSignal
from sqlalchemy.orm import Session
from fastapi import Depends
import json
from datetime import datetime, timedelta

router = APIRouter()

def _get_cached(symbol: str, db: Session) -> CachedSignal | None:
    """Return cached signal if less than 15 minutes old."""
    cached = db.query(CachedSignal).filter_by(symbol=symbol.upper()).first()
    if cached:
        age = datetime.utcnow() - cached.generated_at
        if age < timedelta(minutes=15):
            return cached
    return None

@router.get("/{symbol}")
async def get_signal(
    symbol: str,
    force_refresh: bool = False,
    db: Session = Depends(get_db)
):
    """
    Get full Alpha Engine signal for a symbol.
    Cached for 15 minutes. Use force_refresh=true to bypass.
    """
    sym = symbol.upper()

    if not force_refresh:
        cached = _get_cached(sym, db)
        if cached:
            return {
                "symbol":       sym,
                "decision":     cached.decision,
                "confidence":   cached.confidence,
                "entry_price":  cached.entry_price,
                "stop_loss":    cached.stop_loss,
                "take_profit":  cached.take_profit,
                "reasoning_he": cached.reasoning_he,
                "sources":      json.loads(cached.reasoning_he or "{}").get("sources", []),
                "cached":       True,
                "generated_at": cached.generated_at.isoformat(),
            }

    # Generate fresh signal
    signal = generate_signal(sym)

    # Cache in DB only on success (don't cache errors)
    if not signal.get("error"):
        try:
            existing = db.query(CachedSignal).filter_by(symbol=sym).first()
            payload  = {
                "decision":     signal.get("decision", "החזק"),
                "confidence":   signal.get("confidence", 0.5),
                "entry_price":  signal.get("entry_price"),
                "stop_loss":    signal.get("stop_loss"),
                "take_profit":  signal.get("take_profit"),
                "reasoning_he": signal.get("reasoning_he", ""),
                "generated_at": datetime.utcnow(),
            }
            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
            else:
                db.add(CachedSignal(symbol=sym, **payload))
            db.commit()
        except:
            pass

    return signal

@router.post("/train/{symbol}")
async def train_model(symbol: str):
    """Manually trigger ML model training for a symbol."""
    try:
        from ..engine.feature_engineering import feature_engineer
        from ..engine.ml_ensemble         import ml_ensemble
        df      = feature_engineer.get_feature_matrix(symbol.upper(), period="2y")
        metrics = ml_ensemble.train(df)
        return {"message": f"מודל אומן בהצלחה עבור {symbol}", "metrics": metrics}
    except Exception as e:
        return {"error": str(e)}
