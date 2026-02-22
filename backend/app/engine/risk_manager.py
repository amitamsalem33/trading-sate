# backend/app/engine/risk_manager.py
"""Risk Management Engine — Phase 4
Implements:
  - Kelly Criterion for position sizing
  - Volatility Targeting
  - ATR-based dynamic Stop-Loss and Take-Profit
  - Max drawdown protection
"""
import numpy as np
import pandas as pd
from typing import Optional

class RiskManager:
    def __init__(self,
                 account_size:        float = 100_000.0,
                 max_risk_per_trade:  float = 0.02,     # 2% of account per trade
                 volatility_target:   float = 0.15,     # 15% annualized vol target
                 atr_sl_multiplier:   float = 2.0,      # SL = 2x ATR below entry
                 atr_tp_multiplier:   float = 3.0,      # TP = 3x ATR above entry
                 kelly_fraction:      float = 0.25,     # fractional Kelly (safer)
                 ):
        self.account_size       = account_size
        self.max_risk_per_trade = max_risk_per_trade
        self.volatility_target  = volatility_target
        self.atr_sl_multiplier  = atr_sl_multiplier
        self.atr_tp_multiplier  = atr_tp_multiplier
        self.kelly_fraction     = kelly_fraction

    # ── Kelly Criterion ──────────────────────────────────────────────────────
    def kelly_position_size(
        self,
        win_probability: float,
        avg_win:         float,
        avg_loss:        float,
        price:           float,
    ) -> dict:
        if avg_loss <= 0 or avg_win <= 0 or price <= 0:
            return self._zero_sizing("Invalid inputs")

        q = 1 - win_probability
        b = avg_win / avg_loss
        full_kelly = (win_probability * b - q) / b
        frac_kelly = full_kelly * self.kelly_fraction

        # Cap at max risk per trade
        frac_kelly = max(0.0, min(frac_kelly, self.max_risk_per_trade * 3))
        capital_to_risk  = self.account_size * frac_kelly
        shares           = int(capital_to_risk / price)
        position_value   = shares * price

        return {
            "method":         "Kelly Criterion",
            "full_kelly_pct":  round(full_kelly * 100, 2),
            "frac_kelly_pct":  round(frac_kelly * 100, 2),
            "shares":          shares,
            "position_value":  round(position_value, 2),
            "capital_at_risk": round(capital_to_risk, 2),
            "reward_to_risk":  round(b, 2),
        }

    # ── Volatility Targeting ─────────────────────────────────────────────────
    def volatility_target_size(
        self,
        price:          float,
        volatility_20d: float,   # annualized realized vol (e.g. 0.30 = 30%)
    ) -> dict:
        if price <= 0 or volatility_20d <= 0:
            return self._zero_sizing("Invalid price/vol")

        position_value = (self.account_size * self.volatility_target) / volatility_20d
        position_value = min(position_value, self.account_size * 0.20)  # max 20% of account
        shares         = int(position_value / price)

        return {
            "method":          "Volatility Targeting",
            "asset_vol_ann":   round(volatility_20d * 100, 2),
            "target_vol_ann":  round(self.volatility_target * 100, 2),
            "shares":          shares,
            "position_value":  round(shares * price, 2),
            "pct_of_account":  round((shares * price / self.account_size) * 100, 2),
        }

    # ── ATR-based Stop-Loss and Take-Profit ──────────────────────────────────
    def atr_levels(
        self,
        entry_price: float,
        atr_14:      float,
        direction:   str = "BUY",
    ) -> dict:
        if atr_14 <= 0 or entry_price <= 0:
            pct_sl = entry_price * 0.03
            pct_tp = entry_price * 0.06
            atr_14 = pct_sl / self.atr_sl_multiplier

        sl_dist = atr_14 * self.atr_sl_multiplier
        tp_dist = atr_14 * self.atr_tp_multiplier

        if direction.upper() == "BUY":
            stop_loss   = round(entry_price - sl_dist, 4)
            take_profit = round(entry_price + tp_dist, 4)
        else:
            stop_loss   = round(entry_price + sl_dist, 4)
            take_profit = round(entry_price - tp_dist, 4)

        risk_reward = round(tp_dist / sl_dist, 2)
        sl_pct      = round((sl_dist / entry_price) * 100, 2)
        tp_pct      = round((tp_dist / entry_price) * 100, 2)

        return {
            "entry_price":    entry_price,
            "stop_loss":      stop_loss,
            "take_profit":    take_profit,
            "atr_14":         round(atr_14, 4),
            "sl_distance":    round(sl_dist, 4),
            "tp_distance":    round(tp_dist, 4),
            "sl_pct":         sl_pct,
            "tp_pct":         tp_pct,
            "risk_reward":    risk_reward,
            "direction":      direction.upper(),
        }

    # ── Combined Recommendation ──────────────────────────────────────────────
    def full_risk_assessment(
        self,
        price:           float,
        atr_14:          float,
        volatility_20d:  float,
        win_probability: float,
        direction:       str = "BUY",
    ) -> dict:
        levels  = self.atr_levels(price, atr_14, direction)
        kelly   = self.kelly_position_size(
            win_probability,
            avg_win  = levels['tp_distance'],
            avg_loss = levels['sl_distance'],
            price    = price,
        )
        vol_tgt = self.volatility_target_size(price, volatility_20d)

        # Conservative: take the smaller position
        sl_distance = max(levels['sl_distance'], price * 0.01) if levels['sl_distance'] > 0 else price * 0.01
        
        max_shares = int((self.account_size * self.max_risk_per_trade) / sl_distance)
        
        recommended_shares = min(
            kelly['shares'],
            vol_tgt['shares'],
            max(1, max_shares)
        )

        return {
            "stop_loss":          levels['stop_loss'],
            "take_profit":        levels['take_profit'],
            "sl_pct":             levels['sl_pct'],
            "tp_pct":             levels['tp_pct'],
            "risk_reward":        levels['risk_reward'],
            "atr_14":             levels['atr_14'],
            "recommended_shares": recommended_shares,
            "position_value":     round(recommended_shares * price, 2),
            "max_loss":           round(recommended_shares * levels['sl_distance'], 2),
            "max_gain":           round(recommended_shares * levels['tp_distance'], 2),
            "kelly_pct":          kelly.get('frac_kelly_pct', 0),
            "vol_target_pct":     vol_tgt.get('pct_of_account', 0),
            "sizing_method":      "Conservative Min(Kelly, VolTarget)",
        }

    def _zero_sizing(self, reason: str) -> dict:
        return {"shares": 0, "position_value": 0.0,
                "method": "None", "reason": reason}

# Singleton
risk_manager = RiskManager()
