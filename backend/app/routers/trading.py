from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from ..database import get_db, PaperTrade
from ..services.yfinance_service import yf_service

router = APIRouter()

class OrderRequest(BaseModel):
    symbol:      str
    direction:   str
    quantity:    float
    order_type:  str            = "MARKET"
    limit_price: Optional[float] = None
    stop_loss:   Optional[float] = None
    take_profit: Optional[float] = None

def calculate_pnl(trade, current_price):
    pnl = (current_price - trade.entry_price) * trade.quantity
    return round(pnl if trade.direction == "BUY" else -pnl, 2)

def format_trade(trade, current_price):
    pnl     = calculate_pnl(trade, current_price)
    invest  = trade.entry_price * trade.quantity
    pnl_pct = round((pnl / invest) * 100, 2) if invest else 0
    return {
        "id":            trade.id,
        "symbol":        trade.symbol,
        "direction":     trade.direction,
        "direction_he":  "קנייה" if trade.direction == "BUY" else "מכירה",
        "quantity":      trade.quantity,
        "entry_price":   trade.entry_price,
        "current_price": current_price,
        "exit_price":    trade.exit_price,
        "stop_loss":     trade.stop_loss,
        "take_profit":   trade.take_profit,
        "order_type":    trade.order_type,
        "limit_price":   trade.limit_price,
        "pnl":           pnl,
        "pnl_pct":       pnl_pct,
        "is_open":       trade.is_open,
        "created_at":    trade.created_at.isoformat(),
        "closed_at":     trade.closed_at.isoformat() if trade.closed_at else None,
    }

def _get_price(sym: str) -> float | None:
    """Get latest price — try quote first, fall back to last OHLCV candle."""
    try:
        price = yf_service.get_quote(sym).get("price")
        if price:
            return float(price)
    except Exception:
        pass
    try:
        data = yf_service.get_ohlcv(sym, period="1d", interval="5m").get("data", [])
        if data:
            return float(sorted(data, key=lambda x: x["time"])[-1]["close"])
    except Exception:
        pass
    return None

@router.post("/order")
async def place_order(order: OrderRequest, db: Session = Depends(get_db)):
    sym   = order.symbol.upper()
    price = _get_price(sym)
    if not price:
        raise HTTPException(status_code=400, detail=f"לא ניתן לקבל מחיר עבור {sym}")

    order_type = order.order_type.upper()

    if order_type == "LIMIT":
        if not order.limit_price:
            raise HTTPException(status_code=400, detail="פקודת LIMIT חייבת מחיר יעד")
        trade = PaperTrade(
            symbol=sym, direction=order.direction.upper(),
            quantity=order.quantity, entry_price=order.limit_price,
            limit_price=order.limit_price, order_type="LIMIT",
            is_triggered=False, is_open=False,
            stop_loss=order.stop_loss, take_profit=order.take_profit,
        )
        db.add(trade); db.commit(); db.refresh(trade)
        direction_he = "קנייה" if trade.direction == "BUY" else "מכירה"
        return {
            "message":       f"פקודת LIMIT {direction_he} נוצרה — ממתינה למחיר ${order.limit_price}",
            "trade_id":      trade.id,
            "order_type":    "LIMIT",
            "limit_price":   order.limit_price,
            "current_price": price,
            "status":        "ממתין לביצוע",
        }

    trade = PaperTrade(
        symbol=sym, direction=order.direction.upper(),
        quantity=order.quantity, entry_price=price,
        order_type="MARKET", is_triggered=True,
        stop_loss=order.stop_loss, take_profit=order.take_profit,
    )
    db.add(trade); db.commit(); db.refresh(trade)
    direction_he = "קנייה" if trade.direction == "BUY" else "מכירה"
    return {
        "message":     f"פקודת {direction_he} בוצעה בהצלחה ✓",
        "trade_id":    trade.id,
        "order_type":  "MARKET",
        "entry_price": price,
        "status":      "בוצע",
    }

@router.get("/portfolio")
async def get_portfolio(db: Session = Depends(get_db)):
    open_trades = db.query(PaperTrade).filter_by(is_open=True).all()
    positions = []
    total_pnl = 0.0
    total_inv = 0.0
    for trade in open_trades:
        price = _get_price(trade.symbol) or trade.entry_price
        fmt = format_trade(trade, price)
        total_pnl += fmt["pnl"]
        total_inv += trade.entry_price * trade.quantity
        positions.append(fmt)
    total_pct = round((total_pnl / total_inv) * 100, 2) if total_inv else 0
    return {
        "positions":        positions,
        "total_pnl":        round(total_pnl, 2),
        "total_pnl_pct":    total_pct,
        "total_investment": round(total_inv, 2),
        "open_count":       len(positions),
    }

@router.get("/pending")
async def get_pending_orders(db: Session = Depends(get_db)):
    pending = db.query(PaperTrade).filter_by(
        order_type="LIMIT", is_triggered=False, is_open=False
    ).all()
    result = []
    for t in pending:
        current = _get_price(t.symbol) or 0
        diff_pct = round(((t.limit_price - current) / current) * 100, 2) if current else 0
        result.append({
            "id": t.id, "symbol": t.symbol,
            "direction": t.direction,
            "direction_he": "קנייה" if t.direction == "BUY" else "מכירה",
            "quantity": t.quantity, "limit_price": t.limit_price,
            "current_price": current, "diff_pct": diff_pct,
            "stop_loss": t.stop_loss, "take_profit": t.take_profit,
            "created_at": t.created_at.isoformat(),
        })
    return {"pending_orders": result, "count": len(result)}

@router.get("/history")
async def get_trade_history(db: Session = Depends(get_db)):
    closed = db.query(PaperTrade).filter_by(is_open=False, is_triggered=True)               .order_by(PaperTrade.closed_at.desc()).limit(50).all()
    trades = [format_trade(t, t.exit_price or t.entry_price) for t in closed]
    return {
        "trades": trades,
        "total_realized_pnl": round(sum(t.pnl or 0 for t in closed), 2),
    }

@router.post("/close/{trade_id}")
async def close_trade(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(PaperTrade).filter_by(id=trade_id, is_open=True).first()
    if not trade:
        raise HTTPException(status_code=404, detail="עסקה פתוחה לא נמצאה")
    price = _get_price(trade.symbol) or trade.entry_price
    pnl = calculate_pnl(trade, price)
    trade.exit_price = price
    trade.pnl        = pnl
    trade.is_open    = False
    trade.closed_at  = datetime.utcnow()
    db.commit()
    return {
        "message":    "העסקה נסגרה בהצלחה ✓",
        "symbol":     trade.symbol,
        "exit_price": price,
        "pnl":        pnl,
        "pnl_pct":    round((pnl / (trade.entry_price * trade.quantity)) * 100, 2),
    }

@router.post("/check-limits")
async def check_and_trigger_limits(db: Session = Depends(get_db)):
    pending = db.query(PaperTrade).filter_by(
        order_type="LIMIT", is_triggered=False, is_open=False
    ).all()
    triggered = []
    for trade in pending:
        try:
            current = _get_price(trade.symbol) or 0
            if not current:
                continue
            should = (
                (trade.direction == "BUY"  and current <= trade.limit_price) or
                (trade.direction == "SELL" and current >= trade.limit_price)
            )
            if should:
                trade.entry_price = current
                trade.is_triggered = True
                trade.is_open = True
                triggered.append({"id": trade.id, "symbol": trade.symbol,
                                   "direction": trade.direction,
                                   "limit_price": trade.limit_price,
                                   "exec_price": current})
        except:
            continue
    if triggered:
        db.commit()
    return {"checked": len(pending), "triggered": len(triggered), "orders": triggered}

@router.delete("/pending/{trade_id}")
async def cancel_pending_order(trade_id: int, db: Session = Depends(get_db)):
    trade = db.query(PaperTrade).filter_by(
        id=trade_id, order_type="LIMIT", is_triggered=False
    ).first()
    if not trade:
        raise HTTPException(status_code=404, detail="פקודה ממתינה לא נמצאה")
    db.delete(trade)
    db.commit()
    return {"message": f"פקודת LIMIT על {trade.symbol} בוטלה ✓"}

@router.delete("/reset")
async def reset_portfolio(db: Session = Depends(get_db)):
    deleted = db.query(PaperTrade).delete()
    db.commit()
    return {"message": f"✅ התיק אופס בהצלחה — {deleted} עסקאות נמחקו", "deleted_count": deleted}
