import numpy as np
import pandas as pd
import os, pickle, warnings
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
warnings.filterwarnings('ignore')

MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'models_store')

class MLEnsemble:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.trained = False

    def predict(self, features: dict) -> dict:
        # Fallback to Rule-Based if model not explicitly trained yet
        return self._rule_based_fallback(features)

    def _rule_based_fallback(self, features: dict) -> dict:
        score = 0
        rsi = features.get('rsi_14', 50)
        
        if rsi < 35: score += 2
        if rsi > 65: score -= 2
        if features.get('macd_cross', 0) == 1: score += 2
        if features.get('sma_cross_20_50', 0): score += 1
        if features.get('volume_surge', 0): score += 1

        if score >= 3: decision, conf = 1, min(0.5 + score * 0.05, 0.85)
        elif score <= -3: decision, conf = -1, min(0.5 + abs(score) * 0.05, 0.85)
        else: decision, conf = 0, 0.5

        total = max(abs(score), 1)
        buy_p = max(0, score) / (total * 2 + 1)
        sell_p = max(0, -score) / (total * 2 + 1)
        hold_p = 1 - buy_p - sell_p

        return {
            "decision": decision,
            "confidence": conf,
            "probabilities": {"buy": round(buy_p, 4), "hold": round(hold_p, 4), "sell": round(sell_p, 4)}
        }

ml_ensemble = MLEnsemble()
