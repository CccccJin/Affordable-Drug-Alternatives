from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from typing import List
from pydantic import BaseModel, Field
from models import SearchRequest, SearchResponse 
from chemberta_service import get_molecular_embedding, generate_new_molecules, search_similar_chemberta

# Optional ChEMBL client import; app should still run if not installed
try:
    from chembl_webresource_client.new_client import new_client
except ImportError:
    new_client = None
from models import *
from chem import smiles_to_fingerprint, calculate_similarity
from rdkit import DataStructs

def print_startup_message():
    print("---")
    print("🚀 FastAPI application has started successfully! 🚀")
    print("---")
    print("Your interactive API docs are available at:")
    print(">>> http://127.0.0.1:8000/docs <<<")

app = FastAPI(
    title="Chemical Similarity Search API",
    description="An API to search for similar chemical compounds using RDKit and DuckDB.",
)

# Python 3.6-compatible startup hook (no asynccontextmanager support in 3.6)
@app.on_event("startup")
def on_startup():
    # Code to run on startup
    print_startup_message()

# --- Endpoints ---

# Root: serve the frontend page
@app.get("/", include_in_schema=False)
def root():
    return FileResponse("index.html")

# The startup message is handled by the startup event

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
    # Lazy import to avoid import error at startup on Python 3.6 (duckdb not available)
    try:
        from db import get_db_connection  # type: ignore
    except Exception as e:
        raise HTTPException(status_code=501, detail="DuckDB backend is not available in this environment: " + str(e))
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
    
    # Choose similarity function once based on the requested metric to avoid per-row branching.
    # Default remains Tanimoto if not provided.
    # We rely on RDKit's built-in implementations for ExplicitBitVect fingerprints.
    if getattr(request, 'metric', 'tanimoto') == 'cosine':
        similarity_fn = DataStructs.CosineSimilarity
    else:
        similarity_fn = DataStructs.TanimotoSimilarity
    
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
            # Compute similarity using the selected metric (Tanimoto or Cosine)
            similarity = similarity_fn(input_fp, db_fp)
            
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

# ---------------- ChemBERTa Endpoints (fallback-friendly) ----------------

class EmbedRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES to embed")

class EmbedResponse(BaseModel):
    length: int
    nonzeros: int
    embedding: List[float]

@app.post("/chemberta/embed", response_model=EmbedResponse, tags=["chemberta"], summary="Get molecular embedding")
def cddd_embed(req: EmbedRequest):
    vec = get_molecular_embedding(req.smiles)
    # vec is a numpy array; convert to list for JSON
    arr = vec.tolist()
    nonzeros = int(sum(1 for x in arr if x != 0))
    return EmbedResponse(length=len(arr), nonzeros=nonzeros, embedding=arr)

class GenerateRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES to use as seed")
    num_samples: int = Field(5, gt=0, description="How many molecules to generate")
    temp: float = Field(1.0, gt=0, description="Diversity temperature (used by CDDD; ignored for fallback tautomer/randomization)")

class GenerateResponse(BaseModel):
    count: int
    molecules: List[str]

@app.post("/chemberta/generate", response_model=GenerateResponse, tags=["chemberta"], summary="Generate molecules similar to input")
def cddd_generate(req: GenerateRequest):
    mols = generate_new_molecules(req.smiles, num_samples=req.num_samples, temp=req.temp)
    return GenerateResponse(count=len(mols), molecules=mols)

@app.post("/search_ai", response_model=SearchResponse, tags=["AI Search_ChemBERTa"])
def search_ai_demo(request: SearchRequest):
    """
    Performs AI-powered similarity search using a small, pre-calculated demo dataset.
    """
    try:
        # Call the function we created in the service
        results = search_similar_chemberta(request.smiles, top_k=50) # top_k can be customized
        
        # The `Compound` model might need conversion from the results dictionary
        # For simplicity, we directly construct SearchResponse
        from models import Compound # Ensure import
        response_results = [Compound(**res) for res in results]

        return SearchResponse(count=len(response_results), results=response_results)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not process SMILES: {str(e)}")