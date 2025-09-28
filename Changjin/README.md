# Chemical Similarity Search API

This project is a high-performance cheminformatics API built with FastAPI, RDKit, and DuckDB. It allows users to search for chemically similar molecules using a SMILES string and supports filtering based on molecular properties.

## Core Technology Stack

* **Web Framework**: [FastAPI](https://fastapi.tiangolo.com/) - For building high-performance, easy-to-use APIs.
* **Database**: [DuckDB](https://duckdb.org/) - A fast, in-process analytical database, perfect for handling and querying the data in this project.
* **Cheminformatics**: [RDKit](https://www.rdkit.org/) - The industry-standard open-source cheminformatics toolkit for processing molecules, calculating fingerprints, and similarity.
* **Embeddings (optional)**: [Transformers](https://huggingface.co/docs/transformers) + [PyTorch](https://pytorch.org/) using `seyonec/ChemBERTa-zinc-base-v1` to compute learned molecular embeddings. Embeddings are precomputed into DuckDB (`chemberta_embeddings` table) for fast AI search.
* **Data Validation**: [Pydantic](https://docs.pydantic.dev/) - Used to define clear, robust data models and handle data validation and documentation automatically.

## Project Structure

The project's code structure follows the principle of separation of concerns, organizing different functionalities into independent modules.

| File/Directory                 | Description                                                     |
|--------------------------------|-----------------------------------------------------------------|
| `main.py`                       | FastAPI app with all API routes                                 |
| `models.py`                     | Pydantic models (Search/Resolve/Properties/Embed)               |
| `chem.py`                        | RDKit utilities (fingerprints, properties)                       |
| `db.py`                          | DuckDB connection helper (`chembl_35/chembl_35.duckdb`)         |
| `post_processing.py`             | Advanced ranking/filtering/Butina clustering                     |
| `chemberta_service.py`           | ChemBERTa embeddings + AI similarity search (DuckDB-backed)     |
| `preprocess_database.py`         | Compute Morgan fingerprints and fill `fingerprint_hex`           |
| `preprocess_properties.py`       | Compute RDKit descriptors into `rdkit_metrics` + `compound_full` |
| `preprocess_chemberta.py`        | Precompute ChemBERTa embeddings into `chemberta_embeddings`      |
| `preprocess_inn.py`              | Extract INN synonyms to DuckDB `inn_list`                        |
| `database_schema.py`             | Export DB schema to `chembl35_schema_with_desc.xlsx`             |
| `index.html`, `app.js`, `styles.css` | Simple Bootstrap frontend + RDKit JS rendering                 |
| `chembl_35/chembl_35.duckdb`     | DuckDB database file (ChEMBL snapshot with augments)            |
| `requirements.txt`, `environment.yml` | Python deps (RDKit via Conda env)                           |

## Setup and Run

### Prerequisites
- Python 3.11 (recommended)
- Conda (recommended for RDKit installation)

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd /path/to/prj.internship_202507/Changjin/
   ```

2. Create and activate environment (recommended):
   ```bash
   conda create -n chem_api_env python=3.11
   conda activate chem_api_env
   ```

   Or use the provided setup script (includes ChemBERTa dependencies):
   ```bash
   bash setup_chemberta_env.sh
   conda activate chemberta_api_env
   ```

### Running the Application

1. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

2. Access the application:
   - Web Interface: http://127.0.0.1:8000/
   - Interactive API Docs: http://127.0.0.1:8000/docs
   - Alternative API Docs: http://127.0.0.1:8000/redoc

## Database: using and preparing data

Primary database file: `chembl_35/chembl_35.duckdb`.
Key tables/views expected by the app:
- `compound_structures` (must include `canonical_smiles`, and precomputed `fingerprint_hex`)
- `molecule_dictionary` (for `chembl_id`)
- `compound_properties` (for MW/logP/HBD/HBA/PSA/RTB, etc.)
- `rdkit_metrics` (optional, created by preprocessing) and view `compound_full`
- `chemberta_embeddings` (optional, for AI search)
- `inn_list` (optional, INN synonyms)

Prepare/augment database with provided scripts (resume-safe):
- Compute Morgan fingerprints (hex) into `compound_structures`:
  ```bash
  python preprocess_database.py
  ```
- Compute RDKit descriptors into `rdkit_metrics` and build view `compound_full`:
  ```bash
  python preprocess_properties.py
  ```
- Precompute ChemBERTa embeddings (into `chemberta_embeddings`):
  ```bash
  python preprocess_chemberta.py
  ```
- Import INN synonyms from ChEMBL SQLite into DuckDB:
  ```bash
  python preprocess_inn.py
  ```
- Export database schema to Excel for reference:
  ```bash
  python database_schema.py
  ```

## API Endpoints

All request/response models are defined in `models.py`. Below are concise specs and examples.

### GET `/` (UI)
- Serves the simple Bootstrap frontend (`index.html`).

### GET `/health`
- Health check. Returns `{ "status": "ok" }`.

### GET `/properties`
- Returns list of filterable property keys.
- Example response:
  ```json
  ["mw", "logp", "hbd", "hba", "psa", "rtb", "heavy_atoms", "aromatic_rings"]
  ```

### POST `/properties/calculate`
- Calculate properties for a SMILES using RDKit.
- Request (`PropertyCalculationRequest`):
  ```json
  { "smiles": "O=C(C)Oc1ccccc1C(=O)O" }
  ```
- Response (`CalculatedProperties`):
  ```json
  {
    "mw": 180.16,
    "logp": 1.19,
    "hbd": 1,
    "hba": 4,
    "psa": 63.6,
    "rtb": 3,
    "heavy_atoms": 13,
    "aromatic_rings": 1
  }
  ```
- Curl:
  ```bash
  curl -s -X POST http://127.0.0.1:8000/properties/calculate \
    -H 'Content-Type: application/json' \
    -d '{"smiles": "O=C(C)Oc1ccccc1C(=O)O"}'
  ```

### POST `/resolve_name`
- Resolve chemical/trade name to SMILES via ChEMBL webresource client.
- Request (`ResolveRequest`):
  ```json
  { "name": "aspirin" }
  ```
- Response (`ResolveResponse`):
  ```json
  {
    "name": "aspirin",
    "smiles": "CC(=O)OC1=CC=CC=C1C(=O)O",
    "chembl_id": "CHEMBL25"
  }
  ```

### POST `/search` (Structural similarity)
- Compute RDKit fingerprint for input SMILES and Tanimoto (or cosine over bit vectors) vs precomputed `fingerprint_hex` in DuckDB, with optional post-processing.
- Request (`SearchRequest`):
  ```json
  {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "threshold": 0.7,
    "metric": "tanimoto",
    "enable_post_processing": true,
    "filters": { "mw": { "lt": 500 }, "logp": { "gt": 0.5 } },
    "max_results": 50
  }
  ```
- Response (`SearchResponse`):
  ```json
  {
    "count": 123,
    "results": [ { "chembl_id": "CHEMBL25", "smiles": "...", "similarity": 0.91 } ],
    "post_processed": {
      "ranked_candidates": [ { "smiles": "...", "combined_score": 0.82, "mw": 298.4, "cns_mpo": 4.5, "toxicity_flag": false } ],
      "filtered_out": [ { "smiles": "...", "removal_reasons": ["High molecular weight"] } ],
      "clusters": [ { "size": 10, "avg_similarity": 0.75, "representative": { "smiles": "..." } } ],
      "recommendations": [ { "smiles": "..." } ]
    }
  }
  ```
- Curl:
  ```bash
  curl -s -X POST http://127.0.0.1:8000/search \
    -H 'Content-Type: application/json' \
    -d '{"smiles":"CC(=O)Oc1ccccc1C(=O)O","threshold":0.7,"metric":"tanimoto","enable_post_processing":true,"max_results":20}'
  ```

### POST `/search_ai` (AI Search — ChemBERTa)
- Compute ChemBERTa embedding for input SMILES and cosine similarity vs precomputed embeddings from `chemberta_embeddings`.
- Uses same `SearchRequest` / `SearchResponse` models (only `results` are returned, no post-processing in current implementation).
- Curl:
  ```bash
  curl -s -X POST http://127.0.0.1:8000/search_ai \
    -H 'Content-Type: application/json' \
    -d '{"smiles":"CCO","max_results":10}'
  ```

### GET `/visualize`
- Returns an SVG image for the provided SMILES (`image/svg+xml`).
- Example:
  ```
  http://127.0.0.1:8000/visualize?smiles=CCO
  ```

## Troubleshooting

- **RDKit Installation**
  - Use Conda (`environment.yml`) to install RDKit. Activate the env before running.
- **Torch/Transformers for ChemBERTa**
  - Required for `preprocess_chemberta.py` and `/search_ai`.
- **Database not found / missing columns**
  - Ensure `chembl_35/chembl_35.duckdb` exists and run preprocessing scripts to populate `fingerprint_hex`, `chemberta_embeddings`, etc.
- **ChEMBL client not installed**
  - `/resolve_name` will return 501 if `chembl_webresource_client` is unavailable.

For additional help, please check the project's issue tracker or contact the maintainers.

## License

See `LICENSE`.
