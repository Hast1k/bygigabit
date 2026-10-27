import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # 1. SMA 14 та SMA 50
    df['sma14'] = df['close'].rolling(window=14).mean()
    df['sma50'] = df['close'].rolling(window=50).mean()
    
    # Відхилення від SMA (%)
    df['sma14_dist'] = (df['close'] - df['sma14']) / (df['sma14'] + 1e-9) * 100
    df['sma50_dist'] = (df['close'] - df['sma50']) / (df['sma50'] + 1e-9) * 100
    
    # 2. RSI (14 періодів)
    delta = df['close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()
    
    rs = avg_gain / (avg_loss + 1e-9)
    df['rsi14'] = 100 - (100 / (1 + rs))
    
    # 3. Динаміка об'єму та дохідність
    df['vol_change'] = df['volume'].pct_change() * 100
    df['ret1'] = df['close'].pct_change() * 100
    df['ret3'] = df['close'].pct_change(3) * 100
    
    # 4. Target для навчання: 1 якщо наступна свічка закрилась вище, 0 якщо нижче
    df['target'] = (df['close'].shift(-1) > df['close']).astype(int)
    
    return df

def analyze_and_predict(candles: list) -> dict:
    if not candles or len(candles) < 60:
        return {
            "ok": False,
            "error": "Недостатньо свічок для навчання (потрібно мінімум 60)"
        }
    
    raw = []
    for c in candles:
        raw.append({
            "time": float(c.get("time", 0)),
            "open": float(c.get("open", 0)),
            "high": float(c.get("high", 0)),
            "low": float(c.get("low", 0)),
            "close": float(c.get("close", 0)),
            "volume": float(c.get("volume", 0)),
        })
    
    df = pd.DataFrame(raw).sort_values("time").reset_index(drop=True)
    df = compute_indicators(df)
    
    # Останні розраховані індикатори
    last_row = df.iloc[-1]
    last_rsi = round(float(last_row['rsi14']), 1) if not np.isnan(last_row['rsi14']) else 50.0
    last_sma14 = round(float(last_row['sma14']), 2) if not np.isnan(last_row['sma14']) else float(last_row['close'])
    last_sma50 = round(float(last_row['sma50']), 2) if not np.isnan(last_row['sma50']) else float(last_row['close'])
    curr_price = float(last_row['close'])
    
    # Формування тренду за технічним аналізом (Рівень 1)
    if curr_price > last_sma14 > last_sma50:
        ta_trend = "BULLISH (UPTREND)"
        ta_color = "var(--green)"
    elif curr_price < last_sma14 < last_sma50:
        ta_trend = "BEARISH (DOWNTREND)"
        ta_color = "var(--red)"
    else:
        ta_trend = "CONSOLIDATION / NEUTRAL"
        ta_color = "var(--cyan)"
        
    # Формування фіч для ML (Рівень 3)
    feature_cols = ['rsi14', 'sma14_dist', 'sma50_dist', 'vol_change', 'ret1', 'ret3']
    
    clean_df = df.dropna(subset=feature_cols + ['target']).copy()
    
    # Якщо після dropna свічок достатньо — навчаємо RandomForest
    if len(clean_df) >= 30:
        X_train = clean_df.iloc[:-1][feature_cols]
        y_train = clean_df.iloc[:-1]['target']
        
        # Навчаємо модель класифікації
        clf = RandomForestClassifier(n_estimators=70, max_depth=4, random_state=42)
        clf.fit(X_train, y_train)
        
        # Ознаки найостаннішої поточної свічки
        current_features = clean_df.iloc[[-1]][feature_cols]
        probs = clf.predict_proba(current_features)[0]
        
        prob_down = round(float(probs[0]) * 100, 1)
        prob_up = round(float(probs[1]) * 100, 1)
        
        # Визначаємо сигнал
        if prob_up >= 55.0:
            ml_signal = "BUY / LONG"
            ml_confidence = prob_up
            ml_color = "var(--green)"
        elif prob_down >= 55.0:
            ml_signal = "SELL / SHORT"
            ml_confidence = prob_down
            ml_color = "var(--red)"
        else:
            ml_signal = "NEUTRAL / WAIT"
            ml_confidence = max(prob_up, prob_down)
            ml_color = "var(--cyan)"
            
        model_name = "RandomForest (n=70)"
    else:
        # Fallback якщо даних замало
        prob_up = 50.0
        prob_down = 50.0
        ml_signal = "HOLD"
        ml_confidence = 50.0
        ml_color = "var(--text-muted)"
        model_name = "Heuristic Engine"
        
    # Коротке обґрунтування сигналу
    reasons = []
    if last_rsi < 35:
        reasons.append("RSI в зоні перепроданості (сигнал на відскік)")
    elif last_rsi > 65:
        reasons.append("RSI в зоні перекупленості (ризик корекції)")
        
    if curr_price > last_sma14:
        reasons.append("Ціна тримається вище SMA-14")
    else:
        reasons.append("Ціна опустилась нижче SMA-14")
        
    return {
        "ok": True,
        "price": curr_price,
        "indicators": {
            "rsi": last_rsi,
            "sma14": last_sma14,
            "sma50": last_sma50,
            "trend": ta_trend,
            "trendColor": ta_color
        },
        "ml": {
            "model": model_name,
            "signal": ml_signal,
            "confidence": ml_confidence,
            "probUp": prob_up,
            "probDown": prob_down,
            "signalColor": ml_color
        },
        "reason": " • ".join(reasons) if reasons else "Ціна рухається в межах середніх значень"
    }
