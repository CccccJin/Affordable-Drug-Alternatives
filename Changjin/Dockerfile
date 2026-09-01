# Chemical Similarity Search API.
#
# RDKit is installed from PyPI rather than Conda: the `rdkit` wheel covers
# manylinux x86_64, which is what this image is, and pulling in a Conda
# distribution for one package would roughly triple the image.
#
# The database is *not* baked in. chembl_35.duckdb is several GB and changes on
# a different cadence from the code, so it mounts at runtime:
#
#   docker build -t chemsearch Changjin/
#   docker run -p 8000:8000 \
#     -v /path/to/chembl_35:/data:ro \
#     -e CHEMBL_DUCKDB_PATH=/data/chembl_35.duckdb \
#     chemsearch
#
# First request builds the in-memory fingerprint index and is slow in
# proportion to the corpus — roughly 15 s for ChEMBL 35, then ~0.6 s per query.
# The healthcheck below deliberately probes /health, which does not touch the
# index, so a container is reported healthy while it is still warming.
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# libxrender/libxext are RDKit's drawing dependencies, needed by /visualize.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libxrender1 libxext6 curl \
 && rm -rf /var/lib/apt/lists/*

# Dependencies first, so a source change does not reinstall them.
COPY requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt

COPY chem.py db.py models.py main.py post_processing.py fingerprint_index.py ./
COPY chemberta_service.py ./

# Run unprivileged; nothing here needs to write to the image.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

# One worker by default: each would hold its own copy of the index (~0.31 GB of
# fingerprints for ChEMBL 35), so raise this only with the memory to match.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
