#!/usr/bin/env bash
set -euo pipefail

# ChemBERTa Environment Setup Script (Conda-based)
# - Installs RDKit, DuckDB, FastAPI, etc. via conda-forge
# - Installs Transformers and Torch via pip (for ChemBERTa)

ENV_NAME="chem_api_env"
PY_VER="3.11"

echo "[1/6] Creating conda environment '${ENV_NAME}' (python=${PY_VER}) if missing..."
if conda env list | grep -q "^${ENV_NAME} "; then
  echo "Environment already exists. Skipping creation."
else
  conda create -y -n "${ENV_NAME}" python="${PY_VER}"
fi

echo "[2/6] Activating environment..."
# shellcheck disable=SC1091
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate "${ENV_NAME}"

echo "[3/6] Installing core packages from conda-forge..."
conda install -y -c conda-forge rdkit duckdb fastapi uvicorn pandas pydantic chembl_webresource_client

echo "[4/6] Installing pip packages (transformers, torch, watchfiles)..."
pip install --upgrade pip
pip install transformers torch watchfiles

cat <<EOT
[5/6] Environment setup complete.
Environment: ${ENV_NAME}

Activation:
  conda activate ${ENV_NAME}

[6/6] Start the API (from this folder):
  uvicorn main:app --reload

ChemBERTa endpoints:
  POST /chemberta/embed
  POST /chemberta/generate

Notes:
- On Apple Silicon, Torch may run on CPU unless a metal-accelerated build is present.
- This script replaces prior CDDD/TF1 setup; CDDD is no longer required.
EOT
