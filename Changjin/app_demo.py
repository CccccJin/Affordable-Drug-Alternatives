import os
import duckdb
import pandas as pd
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, AsyncIterator

# --- RDKit Imports ---
# Add a check in case RDKit is not installed
try:
    from rdkit import Chem, DataStructs
    from rdkit.Chem import Descriptors, AllChem
except ImportError:
    raise ImportError("RDKit is not installed. Please install it, preferably with Conda: `conda install -c conda-forge rdkit`")

# --- ChEMBL Client ---
# Optional, only used for the /resolve_name endpoint
try:
    from chembl_webresource_client.new_client import new_client
except ImportError:
    new_client = None # Handle case where it's not installed

# ==============================================================================
# 1. CONFIGURATION
# ==============================================================================
DB_FILE = "chembl_data.duckdb"
CSV_FILE = "sample_chembl.csv"
SAMPLE_CSV_DATA = """molecule_chembl_id,canonical_smiles,molecule_synonyms
CHEMBL25,CC(=O)Oc1ccccc1C(=O)O,"Aspirin;Acetylsalicylic acid"
CHEMBL67,CC(C)CC1=CC=C(C=C1)C(C)C(=O)O,"Ibuprofen"
CHEMBL112,CC(=O)NC1=CC=C(C=C1)O,"Paracetamol;Acetaminophen"
CHEMBL53,COC1=C(C=C(C=C1)C(=O)N[C@H]([C@H](C2=CC=CC=C2)O)CO)S(=O)(=O)C,"Thiamphenicol"
CHEMBL1478,C1=CC=C(C=C1)C(C2=CC=C(C=C2)O)C3=C(C(=O)C4=C(C3=O)C=C(C=C4)O)O,"Phenolphthalein"
CHEMBL85,CN1C=NC2=C1C(=O)N(C(=O)N2C)C,"Caffeine"
"""

# ==============================================================================
# 2. DATA PREPROCESSING LOGIC
# ==============================================================================
def setup_database():
    """Creates the DuckDB database from the CSV file if it doesn't exist."""
    if os.path.exists(DB_FILE):
        print(f"Database '{DB_FILE}' already exists. Skipping creation.")
        return

    # Create the sample CSV if it's missing
    if not os.path.exists(CSV_FILE):
        print(f"'{CSV_FILE}' not found. Creating it with sample data.")
        with open(CSV_FILE, "w") as f:
            f.write(SAMPLE_CSV_DATA)

    print(f"Reading data from '{CSV_FILE}' to build database...")
    df = pd.read_csv(CSV_FILE)
    df.dropna(subset=['canonical_smiles'], inplace=True)

    processed_data = []
    for _, row in df.iterrows():
        mol = Chem.MolFromSmiles(row['canonical_smiles'])
        if not mol:
            continue
        
        fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=1024)
        processed_data.append({
            'chembl_id': row['molecule_chembl_id'],
            'smiles': row['canonical_smiles'],
            'mw': Descriptors.MolWt(mol),
            'logp': Descriptors.MolLogP(mol),
            'hbd': Descriptors.NumHDonors(mol),
            'hba': Descriptors.NumHAcceptors(mol),
            'fingerprint_hex': fp.ToBitString().encode('utf-8').hex(),
            'synonyms': row.get('molecule_synonyms', '')
        })

    processed_df = pd.DataFrame(processed_data)
    con = duckdb.connect(DB_FILE)
    con.execute("CREATE OR REPLACE TABLE compounds AS SELECT * FROM processed_df")
    con.close()
    print(f"Database '{DB_FILE}' created successfully with {len(processed_df)} molecules.")

# ==============================================================================
# 3. Pydantic Models (API Data Structures)
# ==============================================================================
class SearchRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES string for similarity search.")
    threshold: float = Field(0.7, gt=0, le=1, description="Tanimoto similarity threshold.")
    filters: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Property filters, e.g., {'mw': {'lt': 500}}")

class Compound(BaseModel):
    chembl_id: str
    smiles: str
    similarity: float

class SearchResponse(BaseModel):
    count: int
    results: List[Compound]

class ResolveRequest(BaseModel):
    name: str

class ResolveResponse(BaseModel):
    name: str
    smiles: Optional[str] = None
    chembl_id: Optional[str] = None

# ==============================================================================
# 4. FastAPI Application
# ==============================================================================

def print_startup_message():
    """Print a clear startup message."""
    print("\n---")
    print("🚀 FastAPI application has started successfully! 🚀")
    print("---")
    print("Your interactive API docs are available at:")
    print(">>> http://127.0.0.1:8000/docs <<<\n")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Manages the application's startup and shutdown events.
    """
    # --- Code to run on startup ---
    setup_database()         # 1. Set up database
    print_startup_message()  # 2. Print startup message
    
    yield
    
    # --- Code to run on shutdown (if any) ---
    # print("Application is shutting down...")

app = FastAPI(
    title="Chemical Similarity Search API",
    description="An API to search for similar chemical compounds using RDKit and DuckDB.",
    lifespan=lifespan,
)

# --- Helper Functions ---
def smiles_to_fingerprint(smiles: str, n_bits: int = 1024):
    mol = Chem.MolFromSmiles(smiles)
    if not mol: return None
    return AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=n_bits)

def calculate_similarity(fp1, fp2_hex: str):
    fp2 = DataStructs.CreateFromBitString(bytes.fromhex(fp2_hex).decode('utf-8'))
    return DataStructs.TanimotoSimilarity(fp1, fp2)


# --- API Endpoints ---
@app.post("/search", response_model=SearchResponse)
def search_similar_compounds(request: SearchRequest):
    """Search for compounds similar to the input SMILES, with optional property filters."""
    input_fp = smiles_to_fingerprint(request.smiles)
    if not input_fp:
        raise HTTPException(status_code=400, detail="Invalid input SMILES string.")

    sql_query = "SELECT chembl_id, smiles, fingerprint_hex FROM compounds WHERE 1=1"
    params = []
    if request.filters:
        for prop, conditions in request.filters.items():
            for op, value in conditions.items():
                op_map = {'gt': '>', 'lt': '<', 'gte': '>=', 'lte': '<='}
                if op in op_map:
                    sql_query += f" AND {prop} {op_map[op]} ?"
                    params.append(value)
    
    with duckdb.connect(DB_FILE, read_only=True) as con:
        candidates = con.execute(sql_query, params).fetchall()

    results = [
        Compound(chembl_id=cid, smiles=s, similarity=calculate_similarity(input_fp, fp_hex))
        for cid, s, fp_hex in candidates
        if calculate_similarity(input_fp, fp_hex) >= request.threshold
    ]
    
    results.sort(key=lambda x: x.similarity, reverse=True)
    return SearchResponse(count=len(results), results=results)


@app.post("/resolve_name", response_model=ResolveResponse)
def resolve_chemical_name(request: ResolveRequest):
    """Resolves a chemical name to its SMILES representation using ChEMBL."""
    if not new_client:
        raise HTTPException(status_code=501, detail="ChEMBL client not installed. Cannot resolve name.")
    try:
        res = new_client.molecule.search(request.name)
        if res:
            first_hit = res[0]
            return ResolveResponse(
                name=request.name, 
                smiles=first_hit['molecule_structures']['canonical_smiles'],
                chembl_id=first_hit['molecule_chembl_id']
            )
        else:
            raise HTTPException(status_code=404, detail="Name not found in ChEMBL.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/properties", response_model=List[str])
def get_filterable_properties():
    """Returns a list of properties that can be used for filtering."""
    return ["mw", "logp", "hbd", "hba"]