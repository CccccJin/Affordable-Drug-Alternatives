"""Bubble chart comparing originator vs. affordable alternatives.

Data are aligned with `background_research.md` and stored in
`disease_cost_comparison.xlsx` for reuse.
"""

from __future__ import annotations

import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

# Structured dataset derived from background_research.md (midpoint values).
DATA = [
    {
        "Condition": "Treatment-Resistant Depression",
        "ConditionAbbrev": "TRD",
        "Therapy": "Esketamine (Spravato)",
        "TherapyAbbrev": "Esketamine",
        "Type": "Originator",
        "EligiblePatients": 0.35 * 280_000_000,  # 30-40% of 280M global MDD
        "AnnualCostUSD": 25_000,
        "Notes": "Background: TRD affects ~35% of global 280M MDD population. Annual cost $20-30k.",
    },
    {
        "Condition": "Treatment-Resistant Depression",
        "ConditionAbbrev": "TRD",
        "Therapy": "Ketamine IV",
        "TherapyAbbrev": "Ketamine IV",
        "Type": "Alternative",
        "EligiblePatients": 0.35 * 280_000_000,
        "AnnualCostUSD": 10_800,  # midpoint of $5.6k-16k
        "Notes": "IV ketamine cash-pay protocols $5.6k-16k annually.",
    },
    {
        "Condition": "Multiple Sclerosis",
        "ConditionAbbrev": "MS",
        "Therapy": "Ocrelizumab (Ocrevus)",
        "TherapyAbbrev": "Ocrevus",
        "Type": "Originator",
        "EligiblePatients": 2_800_000,  # global prevalence
        "AnnualCostUSD": 69_949,  # US Medicare ASP
        "Notes": "RRMS/PPMS global prevalence ~2.8M; Ocrelizumab US ASP $69,949.",
    },
    {
        "Condition": "Multiple Sclerosis",
        "ConditionAbbrev": "MS",
        "Therapy": "Rituximab Biosimilar",
        "TherapyAbbrev": "Rituximab",
        "Type": "Alternative",
        "EligiblePatients": 2_800_000,
        "AnnualCostUSD": 11_759,  # US Medicare ASP
        "Notes": "Off-label rituximab ASP $11,759 annually in US Medicare data.",
    },
    {
        "Condition": "Non-Small Cell Lung Cancer",
        "ConditionAbbrev": "NSCLC",
        "Therapy": "Pembrolizumab Standard Dose",
        "TherapyAbbrev": "Pembro Std",
        "Type": "Originator",
        "EligiblePatients": 0.85 * 2_200_000,  # 80-87% of global lung cancer incidence
        "AnnualCostUSD": 198_000,  # midpoint of US $191k-$205k
        "Notes": "NSCLC ~85% of 2.2M global lung cancer cases; US list price ~$191-205k.",
    },
    {
        "Condition": "Non-Small Cell Lung Cancer",
        "ConditionAbbrev": "NSCLC",
        "Therapy": "Pembrolizumab Dose-Optimization",
        "TherapyAbbrev": "Pembro Low",
        "Type": "Alternative",
        "EligiblePatients": 0.85 * 2_200_000,
        "AnnualCostUSD": 99_000,  # midpoint of $95.5k-$102.5k
        "Notes": "Low-dose regimen halves drug usage (200 mg q6w).",
    },
    {
        "Condition": "Cushing's Disease",
        "ConditionAbbrev": "Cushing's",
        "Therapy": "Korlym",
        "TherapyAbbrev": "Korlym",
        "Type": "Originator",
        "EligiblePatients": 3_500,  # a few thousand treated annually in the US
        "AnnualCostUSD": 350_000,  # midpoint $200k-$500k
        "Notes": "Korlym priced ~$200k-$500k+ per year.",
    },
    {
        "Condition": "Cushing's Disease",
        "ConditionAbbrev": "Cushing's",
        "Therapy": "Generic Mifepristone",
        "TherapyAbbrev": "Mifepristone",
        "Type": "Alternative",
        "EligiblePatients": 3_500,
        "AnnualCostUSD": 6_500,  # midpoint $3k-$10k
        "Notes": "Daily generic mifepristone $3k-$10k annually.",
    },
    {
        "Condition": "Nephropathic Cystinosis",
        "ConditionAbbrev": "Cystinosis",
        "Therapy": "Procysbi",
        "TherapyAbbrev": "Procysbi",
        "Type": "Originator",
        "EligiblePatients": 2_500,  # 2k-3k global
        "AnnualCostUSD": 600_000,  # midpoint $300k-$900k
        "Notes": "Delayed-release cysteamine $300k-$900k.",
    },
    {
        "Condition": "Nephropathic Cystinosis",
        "ConditionAbbrev": "Cystinosis",
        "Therapy": "Cystagon",
        "TherapyAbbrev": "Cystagon",
        "Type": "Alternative",
        "EligiblePatients": 2_500,
        "AnnualCostUSD": 100_000,  # midpoint $50k-$150k
        "Notes": "Immediate-release cysteamine $50k-$150k.",
    },
    {
        "Condition": "Urea Cycle Disorders",
        "ConditionAbbrev": "UCD",
        "Therapy": "Ravicti",
        "TherapyAbbrev": "Ravicti",
        "Type": "Originator",
        "EligiblePatients": 15_000,  # midpoint 10k-20k global
        "AnnualCostUSD": 650_000,  # midpoint $500k-$800k
        "Notes": "Branded nitrogen scavenger $500k-$800k.",
    },
    {
        "Condition": "Urea Cycle Disorders",
        "ConditionAbbrev": "UCD",
        "Therapy": "Sodium Phenylbutyrate",
        "TherapyAbbrev": "NaPB",
        "Type": "Alternative",
        "EligiblePatients": 15_000,
        "AnnualCostUSD": 175_000,  # midpoint $100k-$250k
        "Notes": "Generic nitrogen scavenger $100k-$250k.",
    },
    {
        "Condition": "MS & Rheumatic Disorder Flares",
        "ConditionAbbrev": "MS Flares",
        "Therapy": "H.P. Acthar Gel",
        "TherapyAbbrev": "Acthar",
        "Type": "Originator",
        "EligiblePatients": 255_000,  # 850k RRMS * 0.3 relapse rate
        "AnnualCostUSD": 120_000,  # midpoint $45k-$200k per course
        "Notes": "US RRMS relapses (~255k courses) with Acthar $45k-$200k per course.",
    },
    {
        "Condition": "MS & Rheumatic Disorder Flares",
        "ConditionAbbrev": "MS Flares",
        "Therapy": "High-Dose Corticosteroids",
        "TherapyAbbrev": "Steroids",
        "Type": "Alternative",
        "EligiblePatients": 255_000,
        "AnnualCostUSD": 1_200,  # midpoint $500-$2,000
        "Notes": "Generic IV steroids $500-$2,000 per course for MS/rheumatic flares.",
    },
    {
        "Condition": "Aggressive Blood Cancers",
        "ConditionAbbrev": "CAR-T",
        "Therapy": "Standard CAR-T",
        "TherapyAbbrev": "Std CAR-T",
        "Type": "Originator",
        "EligiblePatients": 120_000,  # combined annual cases (MM, NHL, ALL) in major markets
        "AnnualCostUSD": 450_000,
        "Notes": "Commercial CAR-T list prices $370k-$530k+ per course.",
    },
    {
        "Condition": "Aggressive Blood Cancers",
        "ConditionAbbrev": "CAR-T",
        "Therapy": "In-House CAR-T",
        "TherapyAbbrev": "In-house",
        "Type": "Alternative",
        "EligiblePatients": 120_000,
        "AnnualCostUSD": 80_000,
        "Notes": "Point-of-care CAR-T programs report $30k-$120k production costs depending on region.",
    },
]

df = pd.DataFrame(DATA)

# Persist numeric dataset for transparency/reference.
output_table = Path(__file__).with_name("disease_cost_comparison.xlsx")
df.sort_values(["Condition", "Type"]).to_excel(output_table, index=False)

# Bubble size scaled by relative patient population.
max_patients = df["EligiblePatients"].max()
df["BubbleSize"] = df["EligiblePatients"].apply(
    lambda count: 600 + 9000 * math.sqrt(count / max_patients)
)

palette = {"Originator": "#1F77B4", "Alternative": "#4DA6FF"}

fig, ax = plt.subplots(figsize=(11, 7))

for therapy_type, group in df.groupby("Type", sort=False):
    ax.scatter(
        group["EligiblePatients"],
        group["AnnualCostUSD"],
        s=group["BubbleSize"],
        alpha=0.7,
        color=palette.get(therapy_type, "#607D8B"),
        label=therapy_type,
        edgecolor="white",
        linewidth=0.6,
    )

for _, row in df.iterrows():
    therapy_short = row.get("TherapyAbbrev", row["Therapy"])
    condition_short = row.get("ConditionAbbrev", row["Condition"])
    label = f"{therapy_short}\n{condition_short}"
    ax.annotate(
        label,
        (row["EligiblePatients"], row["AnnualCostUSD"]),
        textcoords="offset points",
        xytext=(0, 6),
        ha="center",
        fontsize=9,
    )

# Draw cost deltas between paired originator and alternative therapies.
connector_color = "#455A64"
for condition, group in df.groupby("Condition"):
    origin = group[group["Type"] == "Originator"]
    alt = group[group["Type"] == "Alternative"]
    if origin.empty or alt.empty:
        continue

    origin_row = origin.iloc[0]
    alt_row = alt.iloc[0]

    x_coords = [origin_row["EligiblePatients"], alt_row["EligiblePatients"]]
    y_coords = [origin_row["AnnualCostUSD"], alt_row["AnnualCostUSD"]]

    ax.plot(
        x_coords,
        y_coords,
        color=connector_color,
        linestyle="--",
        linewidth=1.1,
        alpha=0.6,
    )

    cost_delta = origin_row["AnnualCostUSD"] - alt_row["AnnualCostUSD"]
    if cost_delta <= 0:
        continue

    delta_text = f"Δ≈${cost_delta/1000:.0f}k"
    midpoint_x = x_coords[0]
    midpoint_y = math.sqrt(y_coords[0] * y_coords[1])

    ax.annotate(
        delta_text,
        (midpoint_x, midpoint_y),
        textcoords="offset points",
        xytext=(8, -2),
        ha="left",
        va="center",
        fontsize=8,
        color="#263238",
        bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="none", alpha=0.7),
    )

ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlabel("Eligible patient population (log scale)")
ax.set_ylabel("Annual therapy cost (USD, log scale)")
# Title intentionally omitted for poster layout; subtitle handled externally.
ax.grid(True, which="both", linestyle="--", linewidth=0.4, alpha=0.4)
# --- 这是修改后的代码 ---
handles, labels = ax.get_legend_handles_labels()
order = []
for label in ("Originator", "Alternative"):
    if label in labels:
        order.append(labels.index(label))
if order:
    handles = [handles[idx] for idx in order]
    labels = [labels[idx] for idx in order]
legend = ax.legend(handles, labels, title="Therapy Type", loc="upper right", markerscale=0.2)

figure_path = Path(__file__).with_suffix(".svg")
fig.tight_layout()
fig.savefig(figure_path, dpi=300)
plt.close(fig)
