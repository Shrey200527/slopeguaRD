from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
)
from xgboost import XGBClassifier


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[1]

DATA_PATH = (
    BASE_DIR
    / "data"
    / "processed"
    / "landslide_terrain_dataset.csv"
)

MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODEL_DIR / "landslide_xgb_model.joblib"


# ============================================================
# LOAD DATA
# ============================================================

print("\n[1/5] Loading dataset...")

df = pd.read_csv(DATA_PATH)

print(f"Dataset shape: {df.shape}")

# IMPORTANT:
# We intentionally exclude latitude/longitude from the first
# terrain model. They are used for spatial mapping, not as
# predictive terrain features.

FEATURES = [
    "elevation",
    "slope",
]

TARGET = "landslide"

X = df[FEATURES]
y = df[TARGET]

print("\nFeatures:")
print(FEATURES)

print("\nClass distribution:")
print(y.value_counts())


# ============================================================
# TRAIN / TEST SPLIT
# ============================================================

print("\n[2/5] Creating train/test split...")

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y,
)

print(f"Training samples: {len(X_train)}")
print(f"Testing samples:  {len(X_test)}")


# ============================================================
# TRAIN XGBOOST
# ============================================================

print("\n[3/5] Training XGBoost model...")

model = XGBClassifier(
    n_estimators=250,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    objective="binary:logistic",
    eval_metric="logloss",
    random_state=42,
    n_jobs=-1,
)

model.fit(X_train, y_train)

print("Training complete.")


# ============================================================
# EVALUATION
# ============================================================

print("\n[4/5] Evaluating model...")

y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:, 1]

accuracy = accuracy_score(y_test, y_pred)
precision = precision_score(y_test, y_pred, zero_division=0)
recall = recall_score(y_test, y_pred, zero_division=0)
f1 = f1_score(y_test, y_pred, zero_division=0)
auc = roc_auc_score(y_test, y_prob)

cm = confusion_matrix(y_test, y_pred)

print("\n========================================")
print("MODEL PERFORMANCE")
print("========================================")

print(f"Accuracy : {accuracy:.4f}")
print(f"Precision: {precision:.4f}")
print(f"Recall   : {recall:.4f}")
print(f"F1 Score : {f1:.4f}")
print(f"ROC-AUC  : {auc:.4f}")

print("\nConfusion Matrix:")
print(cm)

print("\nClassification Report:")
print(
    classification_report(
        y_test,
        y_pred,
        target_names=["Background", "Landslide"],
        zero_division=0,
    )
)


# ============================================================
# FEATURE IMPORTANCE
# ============================================================

print("\nFeature importance:")

importance = pd.Series(
    model.feature_importances_,
    index=FEATURES
).sort_values(ascending=False)

print(importance)


# ============================================================
# SAVE MODEL
# ============================================================

print("\n[5/5] Saving model...")

joblib.dump(
    model,
    MODEL_PATH
)

print(f"\nModel saved to:")
print(MODEL_PATH)

print("\n========================================")
print("TRAINING COMPLETE")
print("========================================")