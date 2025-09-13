#!/usr/bin/env bash
set -euo pipefail

# ChemBERTa Environment Setup Script
# - Creates a Conda environment with RDKit/DuckDB/FastAPI
# - Installs Transformers + Torch via pip for ChemBERTa embeddings
#
# Prerequisites:
# - Conda (miniconda or Anaconda)
# - Internet connectivity to download packages/models

ENV_NAME="chemberta_api_env"
PY_VER="3.11"

echo "[1/6] Creating conda environment '${ENV_NAME}' (python=${PY_VER})..."
conda create -y -n "${ENV_NAME}" python="${PY_VER}"

echo "[2/6] Activating environment..."
# shellcheck disable=SC1091
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate "${ENV_NAME}"

echo "[3/6] Installing core packages from conda-forge (RDKit, DuckDB, FastAPI, etc.)..."
conda install -y -c conda-forge rdkit duckdb fastapi uvicorn pandas pydantic chembl_webresource_client

echo "[4/6] Installing pip extras (watchfiles, transformers, torch)..."
pip install --upgrade pip
pip install watchfiles transformers torch

cat <<EOT
[5/6] Environment setup complete.
Environment: ${ENV_NAME}

You can activate it later with:
  conda activate ${ENV_NAME}

[6/6] Optional next steps:
- Start API (from this folder):
    uvicorn main:app --reload
- Use ChemBERTa endpoints:
    POST /chemberta/embed
    POST /chemberta/generate
- If running on Apple Silicon, Torch may use CPU by default unless a metal-accelerated build is available.
EOT
