"""
text_generator.py
─────────────────
Step 2: Convert each planet row into a rich natural-language description
using a deterministic template engine — no external model required.

Usage (standalone):
    python text_generator.py

Usage (as module):
    from text_generator import generate_description
    df["description"] = df.apply(generate_description, axis=1)
"""

import pandas as pd
from data_cleaner import load_and_clean


# ── Classification helpers ────────────────────────────────────────────
def _orbit_type(eccen: float) -> str:
    if eccen < 0.1:  return "nearly circular"
    if eccen < 0.4:  return "moderately elliptical"
    return "highly elliptical"


def _mass_desc(mass: float) -> str:
    if mass < 0.1:  return "a super-Earth or Neptune-sized"
    if mass < 0.5:  return "a Saturn-sized"
    if mass < 2.0:  return "a Jupiter-sized"
    return "a super-Jupiter"


def _star_type(teff: float) -> str:
    if teff < 4000:  return "a cool red dwarf"
    if teff < 5200:  return "a K-type orange star"
    if teff < 6000:  return "a Sun-like G-type star"
    return "a hot blue-white star"


# ── Core generator ────────────────────────────────────────────────────
def generate_description(row: pd.Series) -> str:
    """
    Build a human-readable paragraph for a single planet row.
    All numeric fields are expected to already be filled (no NaNs).
    """
    name     = row["pl_name"]
    method   = row["pl_discmethod"]
    period   = row["pl_orbper"]
    mass     = row["pl_bmassj"]
    orbsmax  = row["pl_orbsmax"]
    eccen    = row["pl_orbeccen"]
    teff     = row["st_teff"]
    dist     = row["st_dist"]
    pnum     = int(row["pl_pnum"])
    facility = row["pl_facility"]
    hostname = row["pl_hostname"]
    controv  = int(row.get("pl_controvflag", 0))

    orbit_type = _orbit_type(eccen)
    mass_d     = _mass_desc(mass)
    star_t     = _star_type(teff)

    # Rough habitable-zone hint
    hab_hint = (
        " Notably, this planet orbits within the estimated habitable zone of its star."
        if (0.5 <= orbsmax <= 1.5 and 4500 <= teff <= 6500)
        else ""
    )

    controv_note = (
        " Its planetary status remains controversial among astronomers."
        if controv == 1 else ""
    )

    plural = "s" if pnum > 1 else ""

    return (
        f"{name} is {mass_d} exoplanet discovered using the {method} technique "
        f"by the {facility}. It orbits its host star {hostname}, "
        f"which is {star_t} with a surface temperature of {int(teff)}K, "
        f"located approximately {round(dist, 1)} parsecs from Earth. "
        f"The planet completes one orbit every {round(period, 2)} days "
        f"following a {orbit_type} path. "
        f"This system contains {pnum} known planet{plural}."
        f"{hab_hint}{controv_note}"
    )


# ── Entry point ───────────────────────────────────────────────────────
if __name__ == "__main__":
    df = load_and_clean()
    df["description"] = df.apply(generate_description, axis=1)

    # Preview 3 samples
    for _, row in df.sample(3, random_state=7).iterrows():
        print("─" * 70)
        print(row["description"])
    print("─" * 70)
    print(f"[text_generator] Generated {len(df):,} descriptions.")
