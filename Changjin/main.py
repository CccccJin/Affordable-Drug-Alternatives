from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from typing import List, AsyncIterator

# Optional ChEMBL client import; app should still run if not installed
try:
    from chembl_webresource_client.new_client import new_client
except ImportError:
    new_client = None
from models import *
from db import get_db_connection
from chem import smiles_to_fingerprint, calculate_similarity
from rdkit import DataStructs

def print_startup_message():
    print("---")
    print("🚀 FastAPI application has started successfully! 🚀")
    print("---")
    print("Your interactive API docs are available at:")
    print(">>> http://127.0.0.1:8000/docs <<<")

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Code to run on startup
    print_startup_message()
    yield
    # Code to run on shutdown (if any)

app = FastAPI(
    title="Chemical Similarity Search API",
    description="An API to search for similar chemical compounds using RDKit and DuckDB.",
    lifespan=lifespan,
)

# --- Endpoints ---

# Root: serve the frontend page
@app.get("/", include_in_schema=False)
def root():
    return FileResponse("index.html")

# The startup message is now handled by the lifespan context manager

@app.get("/health", tags=["system"], summary="Health check", include_in_schema=True)
def health_check():
    """Lightweight health check endpoint."""
    return {"status": "ok"}

# --- Endpoints ---

# Copy this complete function and replace the existing one in main.py

@app.post("/search", response_model=SearchResponse)
def search_similar_compounds(request: SearchRequest):
    """
    Search for compounds similar to the input SMILES, using pre-calculated fingerprints.
    """
    # 1. Generate fingerprint for the user's input molecule
    input_fp = smiles_to_fingerprint(request.smiles)
    if input_fp is None or len(input_fp) == 0:
        raise HTTPException(status_code=400, detail="Invalid input SMILES string or could not generate fingerprint.")

    # 2. Connect to the database
    con = get_db_connection()
    
    # 3. Prepare the SQL query
    sql_query = """
        SELECT 
            md.chembl_id,
            cs.canonical_smiles,
            cs.fingerprint_hex,
            CAST(COALESCE(cp.mw_freebase, '0') AS FLOAT) as mw,
            CAST(COALESCE(cp.alogp, '0') AS FLOAT) as logp,
            COALESCE(cp.hba, 0) as hba,
            COALESCE(cp.hbd, 0) as hbd,
            CAST(COALESCE(cp.psa, '0') AS FLOAT) as psa,
            COALESCE(cp.rtb, 0) as rtb,
            COALESCE(cp.heavy_atoms, 0) as heavy_atoms,
            COALESCE(cp.aromatic_rings, 0) as aromatic_rings
        FROM compound_structures cs
        JOIN molecule_dictionary md ON cs.molregno = md.molregno
        LEFT JOIN compound_properties cp ON cs.molregno = cp.molregno
        WHERE cs.fingerprint_hex IS NOT NULL
    """
    
    print("Executing database query...")
    # Prepare the query for execution
    cursor = con.execute(sql_query)
    
    print("Starting similarity calculation in batches...")
    results = []
    batch_size = 50000 # Process 50,000 rows at a time

    # 4. *** This is the corrected fetching logic ***
    while True:
        # Fetch a manageable chunk of rows
        chunk = cursor.fetchmany(batch_size)
        if not chunk:
            # No more rows to fetch, exit the loop
            break

        # Process each row in the current chunk
        for row in chunk:
            chembl_id, smiles, fingerprint_hex, mw, logp, hba, hbd, psa, rtb, heavy_atoms, aromatic_rings = row
            
            db_fp = DataStructs.CreateFromBitString(bytes.fromhex(fingerprint_hex).decode('utf-8'))
            similarity = DataStructs.TanimotoSimilarity(input_fp, db_fp)
            
            if similarity >= request.threshold:
                # Property filtering logic remains the same
                prop_dict = {'mw': mw, 'logp': logp, 'hba': hba, 'hbd': hbd, 'psa': psa, 'rtb': rtb, 'heavy_atoms': heavy_atoms, 'aromatic_rings': aromatic_rings}
                if request.filters:
                    match = True
                    for prop, conditions in request.filters.items():
                        if prop not in prop_dict or prop_dict[prop] is None: match = False; break
                        for op, value in conditions.items():
                            prop_value = prop_dict[prop]
                            try:
                                if op == 'gt' and not (float(prop_value) > float(value)): match = False; break
                                elif op == 'lt' and not (float(prop_value) < float(value)): match = False; break
                                elif op == 'gte' and not (float(prop_value) >= float(value)): match = False; break
                                elif op == 'lte' and not (float(prop_value) <= float(value)): match = False; break
                            except (ValueError, TypeError): match = False; break
                        if not match: break
                    if not match: continue
                
                results.append(Compound(chembl_id=chembl_id, smiles=smiles, similarity=float(similarity)))

    con.close()
    print(f"Calculation complete. Found {len(results)} similar compounds.")

    # 5. Sort and return the results
    results.sort(key=lambda x: x.similarity, reverse=True)
    return SearchResponse(count=len(results), results=results)


@app.post("/resolve_name", response_model=ResolveResponse)
def resolve_chemical_name(request: ResolveRequest):
    """
    Resolves a chemical name or trade name to its SMILES representation using the ChEMBL API.
    """
    if new_client is None:
        # ChEMBL client not available; inform the caller
        raise HTTPException(status_code=501, detail="ChEMBL client not installed. Cannot resolve name.")
    try:
        # Search for the molecule by name using the ChEMBL client.
        res = new_client.molecule.search(request.name)
        if res:
            first_hit = res[0]
            return ResolveResponse(
                name=request.name, 
                smiles=first_hit['molecule_structures']['canonical_smiles'],
                chembl_id=first_hit['molecule_chembl_id']
            )
        else:
            raise HTTPException(status_code=404, detail="Chemical name not found in ChEMBL.")
    except Exception as e:
        # Catch potential network errors or other issues from the client.
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/properties", response_model=List[str])
def get_filterable_properties():
    """
    Returns a list of molecular properties that can be used for filtering in the /search endpoint.
    """
    # This list can be hard-coded or retrieved dynamically from the database schema.
    return ["mw", "logp", "hbd", "hba"]



# chek conda environment list:
# conda env list