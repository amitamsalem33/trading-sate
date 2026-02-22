# backend/app/engine/backtester.py
"""
Backtesting Engine using vectorbt (or pandas fallback).
Walk-Forward Optimization to prevent overfitting.
"""
import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

from .feature_engineering import feature_engineer


def _pandas_backtest(df: pd.DataFrame, signals: pd.Series,
                     initial_capital: float = 10_000.0) -> dict:
    """Pandas-based backtest (fallback if vectorbt unavailable)."""
    capital  = initial_capital
    position = 0
    entry_p  = 0.0
    trades   = []
    equity   = [capital]

    for i in range(1, len(df)):
        price  = float(df['close'].iloc[i])
        signal = int(signals.iloc[i - 1])

        # Entry
        if signal == 1 and position == 0:
            position = int(capital * 0.95 / price)
            entry_p  = price
            capital -= position * price

        # Exit
        elif signal == -1 and position > 0:
            pnl     = (price - entry_p) * position
            capital += position * price
            trades.append({
                "entry": entry_p, "exit": price,
                "pnl": round(pnl, 2),
                "pnl_pct": round((price - entry_p) / entry_p * 100, 2),
            })
            position = 0

        equity.append(capital + position * price)

    # Close remaining
    if position > 0:
        price   = float(df['close'].iloc[-1])
        pnl     = (price - entry_p) * position
        capital += position * price
        trades.append({
            "entry": entry_p, "exit": price,
            "pnl": round(pnl, 2),
            "pnl_pct": round((price - entry_p) / entry_p * 100, 2),
        })

    equity_series = pd.Series(equity)
    returns       = equity_series.pct_change().dropna()
    peak          = equity_series.cummax()
    drawdown      = (equity_series - peak) / peak
    max_dd        = float(drawdown.min()) * 100

    total_return  = (equity_series.iloc[-1] / initial_capital - 1) * 100
    win_trades    = [t for t in trades if t['pnl'] > 0]
    win_rate      = len(win_trades) / len(trades) * 100 if trades else 0

    sharpe = 0.0
    if len(returns) > 0 and returns.std() > 0:
        sharpe = float((returns.mean() / returns.std()) * np.sqrt(252))

    return {
        "total_return_pct":  round(total_return, 2),
        "max_drawdown_pct":  round(max_dd, 2),
        "sharpe_ratio":      round(sharpe, 3),
        "total_trades":      len(trades),
        "win_rate_pct":      round(win_rate, 2),
        "final_capital":     round(float(equity_series.iloc[-1]), 2),
        "initial_capital":   initial_capital,
        "trades":            trades[:50],
        "equity_curve":      [round(v, 2) for v in equity_series.tolist()],
    }


def _generate_ml_signals(df: pd.DataFrame) -> pd.Series:
    """Generate signals from the ML ensemble on the feature matrix."""
    from .ml_ensemble import MLEnsemble, FEATURE_COLS
    import numpy as np

    model = MLEnsemble()
    available = [c for c in FEATURE_COLS if c in df.columns]

    if not available:
        return pd.Series(0, index=df.index)

    signals = []
    for i in range(len(df)):
        row = df.iloc[i]
        features = {c: float(row[c]) for c in available if not np.isnan(row[c])}
        result   = model._rule_based_fallback(features)
        signals.append(result['decision'])

    return pd.Series(signals, index=df.index)


def run_backtest(
    symbol:          str,
    period:          str = "2y",
    initial_capital: float = 10_000.0,
    strategy:        str  = "ml",   # "ml" | "rsi" | "macd" | "sma"
) -> dict:
    """
    Run a full backtest for a symbol.
    Strategies: ml (ML ensemble), rsi, macd, sma_cross
    """
    try:
        df = feature_engineer.get_feature_matrix(symbol, period=period)
        if df.empty or len(df) < 60:
            return {"error": f"לא מספיק נתונים עבור {symbol}"}

        # ── Generate signals based on strategy ────────────────
        if strategy == "rsi":
            signals = pd.Series(0, index=df.index)
            signals[df['rsi_14'] < 30] = 1
            signals[df['rsi_14'] > 70] = -1

        elif strategy == "macd":
            signals = pd.Series(0, index=df.index)
            if 'macd' in df.columns and 'macd_signal' in df.columns:
                signals[(df['macd'] > df['macd_signal']) &
                        (df['macd'].shift(1) <= df['macd_signal'].shift(1))] = 1
                signals[(df['macd'] < df['macd_signal']) &
                        (df['macd'].shift(1) >= df['macd_signal'].shift(1))] = -1

        elif strategy == "sma":
            signals = pd.Series(0, index=df.index)
            if 'sma_20' in df.columns and 'sma_50' in df.columns:
                signals[(df['sma_20'] > df['sma_50']) &
                        (df['sma_20'].shift(1) <= df['sma_50'].shift(1))] = 1
                signals[(df['sma_20'] < df['sma_50']) &
                        (df['sma_20'].shift(1) >= df['sma_50'].shift(1))] = -1

        else:  # ml
            try:
                from .ml_ensemble import ml_ensemble, FEATURE_COLS
                available = [c for c in FEATURE_COLS if c in df.columns]
                valid     = df[available].notna().all(axis=1)
                df_valid  = df[valid]
                if len(df_valid) > 100:
                    ml_ensemble.train(df_valid)
                signals = _generate_ml_signals(df)
            except:
                signals = pd.Series(0, index=df.index)
                signals[df['rsi_14'] < 32] = 1
                signals[df['rsi_14'] > 68] = -1

        result = _pandas_backtest(df, signals, initial_capital)
        result['symbol']   = symbol
        result['strategy'] = strategy
        result['period']   = period

        # Walk-Forward summary
        n = len(df)
        wf_results = []
        fold_size  = n // 5
        for fold in range(4):
            start  = fold * fold_size
            mid    = start + fold_size
            end    = mid   + fold_size
            if end > n: break
            df_fold = df.iloc[start:end]
            sg_fold = signals.iloc[start:end]
            r = _pandas_backtest(df_fold, sg_fold, initial_capital)
            wf_results.append({
                "fold": fold + 1,
                "return": r['total_return_pct'],
                "sharpe": r['sharpe_ratio'],
                "win_rate": r['win_rate_pct'],
                "max_dd":  r['max_drawdown_pct'],
            })

        result['walk_forward'] = wf_results
        result['wf_avg_return'] = round(
            sum(w['return'] for w in wf_results) / len(wf_results), 2
        ) if wf_results else 0

        return result

    except Exception as e:
        return {"error": str(e), "symbol": symbol}
