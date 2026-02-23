import numpy as np
import pandas as pd
import pandas_ta as ta
import yfinance as yf
import warnings
warnings.filterwarnings('ignore')

class FeatureEngineer:
    def get_raw_data(self, symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        if df.empty: raise ValueError(f"No data for {symbol}")
        df.columns = [c.lower() for c in df.columns]
        return df.dropna()

    def compute_all_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df['returns'] = df['close'].pct_change()
        
        for w in [20, 50, 200]:
            df[f'sma_{w}'] = ta.sma(df['close'], length=w)
            
        df['sma_cross_20_50'] = (df['sma_20'] > df['sma_50']).astype(int)
        df['rsi_14'] = ta.rsi(df['close'], length=14)
        df['rsi_os'] = (df['rsi_14'] < 30).astype(int)
        df['rsi_ob'] = (df['rsi_14'] > 70).astype(int)
        
        macd_df = ta.macd(df['close'], fast=12, slow=26, signal=9)
        if macd_df is not None and not macd_df.empty:
            df['macd'] = macd_df.iloc[:, 0]
            df['macd_signal'] = macd_df.iloc[:, 2]
            df['macd_cross'] = ((df['macd'] > df['macd_signal']) & (df['macd'].shift(1) <= df['macd_signal'].shift(1))).astype(int)
            
        bb = ta.bbands(df['close'], length=20, std=2)
        if bb is not None and not bb.empty:
            df['bb_pct'] = (df['close'] - bb.iloc[:, 2]) / (bb.iloc[:, 0] - bb.iloc[:, 2] + 1e-9)

        df['volume_sma20'] = df['volume'].rolling(20).mean()
        df['volume_surge'] = ((df['volume'] / (df['volume_sma20'] + 1e-9)) > 2.0).astype(int)

        df = df.replace([np.inf, -np.inf], np.nan).ffill().bfill()
        return df

    def get_feature_matrix(self, symbol: str, period: str = "1y") -> pd.DataFrame:
        return self.compute_all_features(self.get_raw_data(symbol, period))

    def get_latest_features(self, symbol: str) -> dict:
        df = self.get_feature_matrix(symbol, period="6mo")
        row = df.iloc[-1]

        price     = float(row.get('close', 0))
        sma_20    = float(row.get('sma_20', price))
        vol       = float(row.get('volume', 0))
        vol_sma20 = float(row.get('volume_sma20', vol or 1))

        # ATR approximation from high/low/close
        if 'high' in df.columns and 'low' in df.columns:
            tr = (df['high'] - df['low']).rolling(14).mean()
            atr_14 = float(tr.iloc[-1]) if not np.isnan(tr.iloc[-1]) else price * 0.02
        else:
            atr_14 = price * 0.02

        # 20-day return volatility
        volatility_20 = float(df['returns'].rolling(20).std().iloc[-1]) \
                        if 'returns' in df.columns else 0.02

        return {
            "price":            price,
            "returns_1d":       float(row.get('returns', 0)),
            "rsi_14":           float(row.get('rsi_14', 50)),
            "rsi_os":           int(row.get('rsi_os', 0)),
            "rsi_ob":           int(row.get('rsi_ob', 0)),
            "macd_cross":       int(row.get('macd_cross', 0)),
            "sma_cross_20_50":  int(row.get('sma_cross_20_50', 0)),
            "bb_pct":           float(row.get('bb_pct', 0.5)),
            "volume_surge":     int(row.get('volume_surge', 0)),
            "atr_14":           round(atr_14, 4),
            "atr_pct":          round(atr_14 / price, 4) if price else 0.02,
            "volatility_20":    round(volatility_20, 4),
            "volume_ratio":     round(vol / vol_sma20, 2) if vol_sma20 else 1.0,
            "price_vs_sma20":   round((price - sma_20) / sma_20, 4) if sma_20 else 0,
        }

feature_engineer = FeatureEngineer()
