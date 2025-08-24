# Chemical Similarity Search API

This project is a high-performance cheminformatics API built with FastAPI, RDKit, and DuckDB. It allows users to search for chemically similar molecules using a SMILES string and supports filtering based on molecular properties.

## Core Technology Stack

* **Web Framework**: [FastAPI](https://fastapi.tiangolo.com/) - For building high-performance, easy-to-use APIs.
* **Database**: [DuckDB](https://duckdb.org/) - A fast, in-process analytical database, perfect for handling and querying the data in this project.
* **Cheminformatics**: [RDKit](https://www.rdkit.org/) - The industry-standard open-source cheminformatics toolkit for processing molecules, calculating fingerprints, and similarity.
* **Data Validation**: [Pydantic](https://docs.pydantic.dev/) - Used to define clear, robust data models and handle data validation and documentation automatically.

## Project Structure

The project's code structure follows the principle of separation of concerns, organizing different functionalities into independent modules.

| File/Directory       | Description                                                      |
|----------------------|------------------------------------------------------------------|
| `main.py`           | FastAPI application entry point with all API routes              |
| `models.py`         | Pydantic models for API request/response validation             |
| `chem.py`           | Core chemical calculations using RDKit                           |
| `db.py`             | Database connection and query utilities                          |
| `import_chembl.py`  | Script for initial data import and database setup                |
| `index.html`        | Simple frontend interface                                        |
| `requirements.txt`  | Python dependencies (use with Conda for RDKit)                   |
| `*.duckdb`          | Database file (generated after first run)                        |

## Setup and Run

### Prerequisites
- Python 3.11+
- Conda (recommended for RDKit installation)

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd /path/to/prj.internship_202507/Changjin/
   ```

2. Create and activate environment (recommended):
   ```bash
   python3 -m venv venv
   source venv/bin/activate
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

## Database: creating or using data

The API queries a DuckDB file `chembl_data.duckdb` with a table `compounds` containing:
`chembl_id, smiles, fingerprint_hex, mw, logp, hbd, hba`.

- If the DB file already exists, you can directly start the API.
- To (re)create the DB with sample data, either:
  - Run the preprocessing script:
    ```bash
    python import_chembl.py
    ```
  - Or use the initialization function in `app.py`:
    ```bash
    python -c "from app import setup_database; setup_database()"
    ```

## API Endpoints

### Chemical Search
- `POST /search` - Search for similar compounds
  ```json
  {
    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "threshold": 0.7,
    "filters": {
      "mw": {"lt": 500},
      "logp": {"gt": 0.5}
    }
  }
  ```

### Chemical Resolution
- `POST /resolve` - Resolve chemical name to SMILES
  ```json
  { "name": "Aspirin" }
  ```

### System
- `GET /` - Serve web interface
- `GET /health` - Health check endpoint
- `GET /filterable-properties` - List available filterable properties

## Troubleshooting

- **RDKit Installation Issues**:
  - Ensure you're using Conda for RDKit installation
  - Verify the Conda environment is activated before running the application

- **Database Issues**:
  - Run `python import_chembl.py` to initialize the database if you see database-related errors
  - Ensure the application has write permissions in the project directory

- **Common Errors**:
  - `ModuleNotFoundError: rdkit`: Check Conda environment activation
  - Database connection errors: Verify database file permissions
  - 404 Errors: Make sure all required files are in place

For additional help, please check the project's issue tracker or contact the maintainers.

## License

See `LICENSE`.
