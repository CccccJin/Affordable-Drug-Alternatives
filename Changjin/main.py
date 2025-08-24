from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from chembl_webresource_client.new_client import new_client
from typing import List
from models import *
from db import get_db_connection
from chem import smiles_to_fingerprint, calculate_similarity

app = FastAPI(
    title="Chemical Similarity Search API",
    description="An API to search for similar chemical compounds using RDKit and DuckDB.",
)

# --- Endpoints ---

# Root: serve the frontend page
@app.get("/", include_in_schema=False)
def root():
    return FileResponse("index.html")

@app.on_event("startup")
async def startup_event():
    """
    Prints a welcome message with useful links when the application starts.
    """
    print("---")
    print("🚀 FastAPI application has started successfully! 🚀")
    print("---")
    print("Your interactive API docs are available at:")
    print(">>> http://127.0.0.1:8000/docs <<<")
    print("---")

# --- Endpoints ---

@app.post("/search", response_model=SearchResponse)
def search_similar_compounds(request: SearchRequest):
    """
    Search for compounds similar to the input SMILES, with optional property filters.
    """
    # 1. Generate a fingerprint for the input molecule.
    input_fp = smiles_to_fingerprint(request.smiles)
    if not input_fp:
        raise HTTPException(status_code=400, detail="Invalid input SMILES string.")

    # 2. Build the base SQL query and prepare for filters.
    sql_query = "SELECT chembl_id, smiles, fingerprint_hex FROM compounds WHERE 1=1"
    params = []
    
    # Safely add property filters to the query if they exist.
    if request.filters:
        for prop, conditions in request.filters.items():
            for op, value in conditions.items():
                # Map API operators to SQL operators to prevent SQL injection.
                op_map = {'gt': '>', 'lt': '<', 'gte': '>=', 'lte': '<='}
                if op in op_map:
                    sql_query += f" AND {prop} {op_map[op]} ?"
                    params.append(value)
    
    # 3. Fetch candidate molecules from the DuckDB database.
    con = get_db_connection()
    candidates = con.execute(sql_query, params).fetchall()
    con.close()

    # 4. Compute similarity scores in memory against the candidates.
    results = []
    for chembl_id, smiles, fp_hex in candidates:
        similarity = calculate_similarity(input_fp, fp_hex)
        if similarity >= request.threshold:
            results.append(Compound(chembl_id=chembl_id, smiles=smiles, similarity=similarity))

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
