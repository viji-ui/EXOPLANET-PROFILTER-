"""
data_cleaner.py
───────────────
Step 1: Load, clean, and perform EDA on the NASA Exoplanet Archive CSV.
Fills missing numeric values with per-discovery-method medians.
Outputs: cleaned DataFrame + EDA plots saved to /outputs/eda/
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use("Agg")          # headless backend
import os, math

# ── Config ────────────────────────────────────────────────────────────
CSV_PATH   = "Planets_list.csv"
OUTPUT_DIR = "outputs/eda"

COLS = [
    "pl_name", "pl_hostname", "pl_discmethod",
    "pl_orbper", "pl_orbsmax", "pl_orbeccen",
    "pl_bmassj", "pl_radj", "pl_dens",
    "pl_controvflag", "pl_kepflag", "pl_pnum",
    "st_dist", "st_teff", "st_mass", "st_rad",
    "pl_facility", "rowupdate",
]

NUM_COLS = [
    "pl_orbper", "pl_orbsmax", "pl_orbeccen",
    "pl_bmassj", "pl_radj", "pl_dens",
    "st_dist", "st_teff", "st_mass", "st_rad",
]

DARK = {
    "figure.facecolor": "#00000a",
    "axes.facecolor":   "#03031a",
    "axes.edgecolor":   "#00f5ff33",
    "axes.labelcolor":  "#8899cc",
    "xtick.color":      "#8899cc",
    "ytick.color":      "#8899cc",
    "text.color":       "#c8d8f0",
    "grid.color":       "#00f5ff11",
    "grid.linestyle":   "--",
}


# ── Helpers ───────────────────────────────────────────────────────────
def safe_float(v):
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except Exception:
        return None


def apply_dark():
    plt.rcParams.update(DARK)


# ── Main pipeline ─────────────────────────────────────────────────────
def load_and_clean(csv_path: str = CSV_PATH) -> pd.DataFrame:
    """Load CSV, select relevant columns, fill numeric NaNs per method group."""
    df = pd.read_csv(csv_path)
    df = df[[c for c in COLS if c in df.columns]].copy()

    # Fill missing numerics with group median (by discovery method)
    df[NUM_COLS] = df.groupby("pl_discmethod")[NUM_COLS].transform(
        lambda x: x.fillna(x.median())
    )
    # Any remaining NaNs → global median
    df[NUM_COLS] = df[NUM_COLS].fillna(df[NUM_COLS].median())

    df["pl_controvflag"] = df.get("pl_controvflag", pd.Series(0)).fillna(0).astype(int)
    df["pl_kepflag"]     = df.get("pl_kepflag",     pd.Series(0)).fillna(0).astype(int)
    df["pl_pnum"]        = df.get("pl_pnum",        pd.Series(1)).fillna(1).astype(int)

    print(f"[data_cleaner] Loaded {len(df):,} planets across "
          f"{df['pl_discmethod'].nunique()} discovery methods.")
    return df


def run_eda(df: pd.DataFrame, out_dir: str = OUTPUT_DIR):
    """Produce 5 EDA plots and save to out_dir."""
    os.makedirs(out_dir, exist_ok=True)
    apply_dark()

    ACCENT  = "#00f5ff"
    ACCENT2 = "#ff6b35"
    ACCENT3 = "#39ff14"

    # 1. Bar chart – planet count by discovery method
    fig, ax = plt.subplots(figsize=(10, 5))
    counts = df["pl_discmethod"].value_counts()
    bars = ax.barh(counts.index, counts.values,
                   color=[ACCENT, ACCENT2, ACCENT3, "#8b5cf6",
                           "#ffd700", "#ff4466", "#4fc3f7", "#b89af0",
                           "#aaffaa", "#ffaa44"][:len(counts)],
                   edgecolor="none")
    ax.set_xlabel("Number of Planets")
    ax.set_title("Planet Count by Discovery Method", fontsize=13, pad=12)
    ax.grid(axis="x")
    for bar in bars:
        ax.text(bar.get_width() + 5, bar.get_y() + bar.get_height() / 2,
                f"{int(bar.get_width()):,}", va="center", fontsize=8, color="#8899cc")
    fig.tight_layout()
    fig.savefig(f"{out_dir}/01_discovery_methods.png", dpi=150)
    plt.close(fig)
    print(f"[data_cleaner] Saved 01_discovery_methods.png")

    # 2. Histogram – orbital period distribution (log scale)
    fig, ax = plt.subplots(figsize=(10, 5))
    data = df["pl_orbper"].dropna()
    data = data[data > 0]
    ax.hist(data, bins=80, color=ACCENT, alpha=0.8, edgecolor="none",
            log=True)
    ax.set_xscale("log")
    ax.set_xlabel("Orbital Period (days) — log scale")
    ax.set_ylabel("Count (log)")
    ax.set_title("Distribution of Orbital Periods", fontsize=13, pad=12)
    ax.grid(True)
    fig.tight_layout()
    fig.savefig(f"{out_dir}/02_orbital_period_hist.png", dpi=150)
    plt.close(fig)
    print(f"[data_cleaner] Saved 02_orbital_period_hist.png")

    # 3. Scatter – planet mass vs radius, coloured by method
    fig, ax = plt.subplots(figsize=(10, 6))
    methods = df["pl_discmethod"].unique()
    colors  = plt.cm.plasma([i / max(len(methods) - 1, 1) for i in range(len(methods))])
    for method, color in zip(methods, colors):
        sub = df[df["pl_discmethod"] == method]
        ax.scatter(sub["pl_bmassj"], sub["pl_radj"],
                   s=10, alpha=0.5, color=color, label=method)
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("Planet Mass (Jupiter masses) — log scale")
    ax.set_ylabel("Planet Radius (Jupiter radii) — log scale")
    ax.set_title("Planet Mass vs Radius by Discovery Method", fontsize=13, pad=12)
    ax.legend(fontsize=7, framealpha=0.15, loc="upper left")
    ax.grid(True)
    fig.tight_layout()
    fig.savefig(f"{out_dir}/03_mass_vs_radius.png", dpi=150)
    plt.close(fig)
    print(f"[data_cleaner] Saved 03_mass_vs_radius.png")

    # 4. Pie – top 5 observatories
    fig, ax = plt.subplots(figsize=(8, 8))
    fac = df["pl_facility"].value_counts()
    top5   = fac.head(5)
    others = fac.iloc[5:].sum()
    labels = list(top5.index) + ["Others"]
    sizes  = list(top5.values) + [others]
    pie_colors = [ACCENT, ACCENT2, ACCENT3, "#8b5cf6", "#ffd700", "#888888"]
    wedges, texts, autotexts = ax.pie(
        sizes, labels=labels, colors=pie_colors,
        autopct="%1.1f%%", startangle=140,
        wedgeprops={"edgecolor": "#00000a", "linewidth": 2},
    )
    for t in texts + autotexts:
        t.set_color("#c8d8f0"); t.set_fontsize(9)
    ax.set_title("Top 5 Observatories by Planet Count", fontsize=13, pad=20)
    fig.tight_layout()
    fig.savefig(f"{out_dir}/04_top_observatories.png", dpi=150)
    plt.close(fig)
    print(f"[data_cleaner] Saved 04_top_observatories.png")

    # 5. Bar – controversial vs non-controversial count
    fig, ax = plt.subplots(figsize=(6, 4))
    labels_c = ["Non-Controversial", "Controversial"]
    values_c = [
        int((df["pl_controvflag"] == 0).sum()),
        int((df["pl_controvflag"] == 1).sum()),
    ]
    bar_c = ax.bar(labels_c, values_c, color=[ACCENT3, "#ff4466"], width=0.5, edgecolor="none")
    for bar in bar_c:
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 10,
                f"{bar.get_height():,}", ha="center", fontsize=10)
    ax.set_title("Controversial vs Non-Controversial Planets", fontsize=13, pad=12)
    ax.set_ylabel("Count")
    ax.grid(axis="y")
    fig.tight_layout()
    fig.savefig(f"{out_dir}/05_controversial.png", dpi=150)
    plt.close(fig)
    print(f"[data_cleaner] Saved 05_controversial.png")

    print(f"[data_cleaner] All EDA plots saved to: {out_dir}/")


# ── Entry point ───────────────────────────────────────────────────────
if __name__ == "__main__":
    df = load_and_clean()
    run_eda(df)
