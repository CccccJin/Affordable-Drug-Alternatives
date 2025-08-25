from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from chembl_webresource_client.new_client import new_client
from typing import List, AsyncIterator
from models import *
from db import get_db_connection
from chem import smiles_to_fingerprint, calculate_similarity

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

@app.post("/search", response_model=SearchResponse)
def search_similar_compounds(request: SearchRequest):
    """
    Search for compounds similar to the input SMILES, with optional property filters.
    """
    # 1. Generate a fingerprint for the input molecule.
    input_fp = smiles_to_fingerprint(request.smiles)
    if input_fp is None or input_fp.size == 0:
        raise HTTPException(status_code=400, detail="Invalid input SMILES string or could not generate fingerprint.")

    # 2. Get all compounds with their SMILES from the database
    con = get_db_connection()
    
    # First, get the total count of compounds for progress tracking
    total_compounds = con.execute("""
        SELECT COUNT(*) 
        FROM compound_structures cs
        JOIN molecule_dictionary md ON cs.molregno = md.molregno
        WHERE cs.canonical_smiles IS NOT NULL
    """).fetchone()[0]
    
    print(f"Found {total_compounds} total compounds in the database")
    
    # Fetch compounds in batches to handle large datasets
    batch_size = 1000
    results = []
    
    for offset in range(0, total_compounds, batch_size):
        # Get a batch of compounds with their properties
        candidates = con.execute("""
            SELECT 
                md.chembl_id,
                cs.canonical_smiles,
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
            WHERE cs.canonical_smiles IS NOT NULL
            LIMIT ? OFFSET ?
        """, (batch_size, offset)).fetchall()
        
        # Process each compound in the batch
        for row in candidates:
            chembl_id, smiles, mw, logp, hba, hbd, psa, rtb, heavy_atoms, aromatic_rings = row
            
            if not smiles:  # Skip if no SMILES
                continue
                
            # Calculate fingerprint and similarity
            fp = smiles_to_fingerprint(smiles)
            if fp is None or fp.size == 0:  # Skip if fingerprint generation fails
                continue
                
            similarity = calculate_similarity(input_fp, fp)
            if similarity >= request.threshold:
                # Create property dictionary for filtering
                prop_dict = {
                    'mw': mw,
                    'logp': logp,
                    'hba': hba,
                    'hbd': hbd,
                    'psa': psa,
                    'rtb': rtb,
                    'heavy_atoms': heavy_atoms,
                    'aromatic_rings': aromatic_rings
                }
                
                # Apply filters if any
                if request.filters:
                    match = True
                    for prop, conditions in request.filters.items():
                        if prop not in prop_dict or prop_dict[prop] is None:
                            match = False
                            break
                        for op, value in conditions.items():
                            prop_value = prop_dict[prop]
                            try:
                                if op == 'gt' and not (float(prop_value) > float(value)):
                                    match = False
                                    break
                                elif op == 'lt' and not (float(prop_value) < float(value)):
                                    match = False
                                    break
                                elif op == 'gte' and not (float(prop_value) >= float(value)):
                                    match = False
                                    break
                                elif op == 'lte' and not (float(prop_value) <= float(value)):
                                    match = False
                                    break
                            except (ValueError, TypeError):
                                match = False
                                break
                        if not match:
                            break
                    if not match:
                        continue
                
                results.append(Compound(chembl_id=chembl_id, smiles=smiles, similarity=float(similarity)))
        
        print(f"Processed {min(offset + len(candidates), total_compounds)}/{total_compounds} compounds...")
    
    con.close()

    # 5. Sort the results by similarity in descending order and return.
    results.sort(key=lambda x: x.similarity, reverse=True)
    
    return SearchResponse(count=len(results), results=results)


@app.post("/resolve_name", response_model=ResolveResponse)
def resolve_chemical_name(request: ResolveRequest):
    """
    Resolves a chemical name or trade name to its SMILES representation using the ChEMBL API.
    """
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
