"""
nlp_pipeline.py
───────────────
Steps 3-5: Run all NLP tasks on the generated descriptions.

  Step 3 — VADER sentiment scoring
  Step 4 — Rule-based habitability classification
  Step 5 — TF-IDF + K-Means text clustering

Outputs:
  • Returns an enriched DataFrame
  • Saves outputs/planet_profiles.csv  (full enriched dataset)
  • Saves outputs/planet_data.json     (aggregated stats for the dashboard)

Usage:
    python nlp_pipeline.py
"""

import json, os, math, random
from collections import defaultdict, Counter

import pandas as pd
from data_cleaner import load_and_clean
from text_generator import generate_description


# ── Config ────────────────────────────────────────────────────────────
OUTPUT_DIR  = "outputs"
CSV_OUT     = f"{OUTPUT_DIR}/planet_profiles.csv"
JSON_OUT    = f"{OUTPUT_DIR}/planet_data.json"
N_CLUSTERS  = 6
RANDOM_SEED = 42
BUBBLE_SAMPLE = 300


# ═══════════════════════════════════════════════════════════════════════
# STEP 3 — VADER SENTIMENT
# ═══════════════════════════════════════════════════════════════════════

# Lightweight VADER-style lexicon (covers words present in our templates)
_LEXICON = {
    "habitable": 2.5, "notably":  0.8, "estimated": 0.1, "known":    0.1,
    "circular":  0.5, "sun-like": 1.0, "promising": 2.0, "stable":   0.5,
    "warm":      0.3, "bright":   0.5, "cool":     -0.2, "cold":    -0.3,
    "dwarf":    -0.3, "elliptical":-0.2,"controversial":-1.5,"remains":-0.2,
    "super":     0.4, "giant":    0.3,  "massive":  0.2,  "hot":     0.4,
    "within":    0.2, "zone":     0.3,  "unstable": -0.5, "dim":    -0.2,
}

def _vader_score(text: str) -> float:
    """Return a compound-like score in [-1, +1]."""
    words = text.lower().replace(",", " ").replace(".", " ").split()
    raw = sum(_LEXICON.get(w, 0.0) for w in words)
    # Normalise to [-1, 1]
    if raw == 0:
        return 0.0
    return max(-1.0, min(1.0, raw / (1 + abs(raw) * 0.1)))


def _sentiment_label(score: float) -> str:
    if score >= 0.05:  return "Positive"
    if score <= -0.05: return "Negative"
    return "Neutral"


def add_sentiment(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["sentiment_compound"] = df["description"].apply(_vader_score).round(4)
    df["sentiment_label"]    = df["sentiment_compound"].apply(_sentiment_label)
    print(f"[nlp_pipeline] Sentiment done. Distribution:\n"
          f"  {df['sentiment_label'].value_counts().to_dict()}")
    return df


# ═══════════════════════════════════════════════════════════════════════
# STEP 4 — HABITABILITY CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════

def _hab_score(row: pd.Series) -> int:
    """9-point habitability rubric."""
    score = 0
    if 0.5  <= row["pl_orbsmax"] <= 1.5:  score += 3   # habitable zone
    if 4500 <= row["st_teff"]    <= 6500:  score += 2   # sun-like star
    if row["pl_bmassj"]   < 0.1:          score += 2   # small planet
    if row["pl_orbeccen"] < 0.2:          score += 1   # stable orbit
    if row["st_mass"]     < 1.5:          score += 1   # stable star
    return score


def _hab_label(score: int) -> str:
    if score >= 6: return "Potentially Habitable"
    if score >= 3: return "Marginally Interesting"
    return "Uninhabitable"


def add_habitability(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["hab_score"] = df.apply(_hab_score, axis=1)
    df["hab_label"] = df["hab_score"].apply(_hab_label)
    print(f"[nlp_pipeline] Habitability done. Distribution:\n"
          f"  {df['hab_label'].value_counts().to_dict()}")
    return df


# ═══════════════════════════════════════════════════════════════════════
# STEP 5 — TF-IDF + K-MEANS CLUSTERING
# ═══════════════════════════════════════════════════════════════════════

def add_clusters(df: pd.DataFrame, n_clusters: int = N_CLUSTERS) -> pd.DataFrame:
    """Attempt sklearn clustering; gracefully skip if not installed."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.cluster import KMeans

        vectorizer = TfidfVectorizer(max_features=500, stop_words="english")
        X = vectorizer.fit_transform(df["description"])

        km = KMeans(n_clusters=n_clusters, random_state=RANDOM_SEED, n_init=10)
        df = df.copy()
        df["cluster"] = km.fit_predict(X)

        # Label each cluster by its top TF-IDF term
        terms = vectorizer.get_feature_names_out()
        cluster_labels = {}
        for cid in range(n_clusters):
            center = km.cluster_centers_[cid]
            top_term = terms[center.argsort()[-1]]
            cluster_labels[cid] = f"C{cid}:{top_term}"
        df["cluster_label"] = df["cluster"].map(cluster_labels)

        print(f"[nlp_pipeline] Clustering done. Cluster sizes:\n"
              f"  {df['cluster_label'].value_counts().to_dict()}")
    except ImportError:
        print("[nlp_pipeline] WARNING: sklearn not installed — skipping clustering.")
        df["cluster"] = -1
        df["cluster_label"] = "unclustered"

    return df


# ═══════════════════════════════════════════════════════════════════════
# COMBINED SCORE + AGGREGATION FOR DASHBOARD
# ═══════════════════════════════════════════════════════════════════════

_STOP = {
    "exoplanet","discovered","earth","system","planet","star","orbit","parsecs",
    "surface","temperature","estimated","using","technique","contains","following",
    "located","completes","host","days","known","approximately","orbits","path",
}

def _word_freq(df: pd.DataFrame, label: str, top_n: int = 25) -> list:
    counter = Counter()
    for desc in df[df["sentiment_label"] == label]["description"]:
        words = [
            w.lower().strip(".,!?;:")
            for w in desc.split()
            if len(w) > 3 and w.lower().strip(".,!?;:") not in _STOP
        ]
        counter.update(words)
    return counter.most_common(top_n)


def build_dashboard_json(df: pd.DataFrame) -> dict:
    """Aggregate all stats needed by index.html and save to JSON."""

    # Combined ranking score
    df["combined_score"] = (
        df["sentiment_compound"] * 0.4 + (df["hab_score"] / 9) * 0.6
    ).round(4)

    top10 = (
        df.sort_values("combined_score", ascending=False)
        .head(10)
        [[
            "pl_name","pl_hostname","pl_discmethod","pl_facility",
            "pl_orbper","pl_bmassj","pl_radj","st_dist","st_teff",
            "pl_orbeccen","pl_orbsmax","pl_pnum","pl_controvflag","pl_kepflag",
            "description","sentiment_compound","sentiment_label",
            "hab_score","hab_label","combined_score",
        ]]
        .rename(columns={
            "pl_name":"name","pl_hostname":"hostname","pl_discmethod":"method",
            "pl_facility":"facility","pl_orbper":"period","pl_bmassj":"mass",
            "pl_radj":"radius","st_dist":"dist","st_teff":"teff",
            "pl_orbeccen":"eccen","pl_orbsmax":"orbsmax","pl_pnum":"pnum",
            "pl_controvflag":"controv","pl_kepflag":"kepflag",
            "sentiment_compound":"sentiment","sentiment_label":"sentiment_label",
        })
        .to_dict(orient="records")
    )

    # Sentiment by discovery method
    method_avg_sent = (
        df.groupby("pl_discmethod")["sentiment_compound"]
        .mean().round(4).to_dict()
    )

    # Discovery method counts
    disc_counts = df["pl_discmethod"].value_counts().to_dict()

    # Top facilities by avg sentiment (min 5 planets)
    fac_sent = (
        df.groupby("pl_facility")["sentiment_compound"]
        .agg(["mean", "count"])
        .query("count >= 5")
        .sort_values("mean", ascending=False)
        .head(8)
    )
    top_fac = [[row.name, round(row["mean"], 4)] for _, row in fac_sent.iterrows()]

    # Habitability & sentiment counts
    hab_counts  = df["hab_label"].value_counts().to_dict()
    sent_counts = df["sentiment_label"].value_counts().to_dict()

    # Word frequencies
    top_pos_words = _word_freq(df, "Positive")
    top_neg_words = _word_freq(df, "Negative")

    # Bubble chart sample
    random.seed(RANDOM_SEED)
    sample = df.sample(min(BUBBLE_SAMPLE, len(df)), random_state=RANDOM_SEED)
    bubble_data = [
        {
            "name":   r["pl_name"],
            "mass":   round(r["pl_bmassj"], 3),
            "period": round(min(r["pl_orbper"], 20000), 2),
            "sent":   round(r["sentiment_compound"], 4),
            "hab":    r["hab_label"],
            "method": r["pl_discmethod"],
        }
        for _, r in sample.iterrows()
        if r["pl_bmassj"] > 0 and r["pl_orbper"] > 0
    ]

    # Full search index (all planets, minimal fields)
    search_index = df[[
        "pl_name","pl_discmethod","pl_facility",
        "sentiment_compound","sentiment_label",
        "hab_label","hab_score","description","combined_score",
        "st_teff","st_dist","pl_orbper","pl_bmassj",
    ]].rename(columns={
        "pl_name":"name","pl_discmethod":"method","pl_facility":"facility",
        "sentiment_compound":"sentiment",
    }).round(4).to_dict(orient="records")

    return {
        "total":           len(df),
        "method_avg_sent": method_avg_sent,
        "disc_counts":     disc_counts,
        "top_fac":         top_fac,
        "hab_counts":      hab_counts,
        "sent_counts":     sent_counts,
        "top10":           top10,
        "bubble_data":     bubble_data,
        "top_pos_words":   top_pos_words,
        "top_neg_words":   top_neg_words,
        "search_index":    search_index,
    }


# ═══════════════════════════════════════════════════════════════════════
# FULL PIPELINE RUNNER
# ═══════════════════════════════════════════════════════════════════════

def run_pipeline(csv_path: str = "Planets_list.csv") -> pd.DataFrame:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Load & clean
    df = load_and_clean(csv_path)

    # 2. Generate descriptions
    print("[nlp_pipeline] Generating descriptions…")
    df["description"] = df.apply(generate_description, axis=1)

    # 3. Sentiment
    df = add_sentiment(df)

    # 4. Habitability
    df = add_habitability(df)

    # 5. Clustering
    df = add_clusters(df)

    # 6. Save enriched CSV
    df.to_csv(CSV_OUT, index=False)
    print(f"[nlp_pipeline] Saved enriched CSV → {CSV_OUT}")

    # 7. Build & save dashboard JSON
    dashboard = build_dashboard_json(df)
    with open(JSON_OUT, "w") as f:
        json.dump(dashboard, f)
    print(f"[nlp_pipeline] Saved dashboard JSON → {JSON_OUT}  "
          f"({os.path.getsize(JSON_OUT)//1024} KB)")

    return df


if __name__ == "__main__":
    df = run_pipeline()
    print(f"\n[nlp_pipeline] Pipeline complete. {len(df):,} planets enriched.")
    print(df[["pl_name","sentiment_label","hab_label","cluster_label"]].head(8).to_string())
