from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from models import SearchRequest, SearchResponse 
from chemberta_service import get_molecular_embedding, generate_new_molecules, search_similar_chemberta
from post_processing import DrugPostProcessor, CandidateMolecule
import logging

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
    description="An API to search for similar chemical compounds using RDKit and DuckDB with advanced post-processing.",
    version="1.1.0"
)

# Initialize the post-processor with default settings
post_processor = DrugPostProcessor(
    min_similarity=0.6,
    max_mw=600.0,
    max_rotatable_bonds=10
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    Returns both basic and post-processed results with advanced filtering and ranking.
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
    
    logger.info("Executing database query...")
    # Prepare the query for execution
    cursor = con.execute(sql_query)
    
    # Choose similarity function based on the requested metric
    similarity_fn = DataStructs.CosineSimilarity if getattr(request, 'metric', 'tanimoto') == 'cosine' else DataStructs.TanimotoSimilarity
    
    logger.info("Starting similarity calculation in batches...")
    results = []
    candidate_dicts = []  # For post-processing
    batch_size = 50000  # Process 50,000 rows at a time

    # 4. Process database results in batches
    while True:
        chunk = cursor.fetchmany(batch_size)
        if not chunk:
            break

        for row in chunk:
            chembl_id, smiles, fingerprint_hex, mw, logp, hba, hbd, psa, rtb, heavy_atoms, aromatic_rings = row
            
            try:
                db_fp = DataStructs.CreateFromBitString(bytes.fromhex(fingerprint_hex).decode('utf-8'))
                similarity = similarity_fn(input_fp, db_fp)
                
                if similarity >= request.threshold:
                    # Create a candidate dictionary for post-processing
                    candidate = {
                        'smiles': smiles,
                        'similarity_tanimoto': similarity,
                        'similarity_embedding': similarity,  # Using same as tanimoto for now
                        'mw': mw,
                        'cns_mpo': 4.5,  # Placeholder - would come from DB or calculation
                        'cost': 100.0,   # Placeholder - would come from DB
                        'toxicity_flag': False,  # Placeholder
                        'indications': [],  # Would come from DB
                        'name': chembl_id,
                        'num_rotatable_bonds': rtb,
                        'logp': logp,
                        'hba': hba,
                        'hbd': hbd,
                        'psa': psa,
                        'aromatic_rings': aromatic_rings
                    }
                    candidate_dicts.append(candidate)
                    
                    # Add to basic results
                    results.append(Compound(chembl_id=chembl_id, smiles=smiles, similarity=float(similarity)))
                    
            except Exception as e:
                logger.warning(f"Error processing molecule {chembl_id}: {str(e)}")
                continue

    con.close()
    logger.info(f"Found {len(results)} similar compounds before post-processing.")

    # 5. Sort basic results
    results.sort(key=lambda x: x.similarity, reverse=True)
    
    # 6. Apply advanced post-processing
    try:
        # Process with the post-processor
        post_processed = post_processor.process_results(
            query_drug=request.smiles,
            candidates=candidate_dicts,
            top_n=min(50, len(candidate_dicts))  # Top 50 or all if fewer
        )
        
        # Add post-processed results to the response
        response = {
            'count': len(results),
            'results': [r.dict() for r in results],
            'post_processed': post_processed
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        logger.error(f"Error in post-processing: {str(e)}", exc_info=True)
        # Return basic results if post-processing fails
        return {
            'count': len(results),
            'results': [r.dict() for r in results],
            'post_processed': {
                'error': f"Post-processing failed: {str(e)}",
                'ranked_candidates': [],
                'filtered_out': [],
                'clusters': [],
                'recommendations': []
            }
        }
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

class PropertyCalculationRequest(BaseModel):
    """Request model for calculating properties."""
    smiles: str = Field(..., example="O=C(C)Oc1ccccc1C(=O)O", description="SMILES string of the molecule to analyze.")

class CalculatedProperties(BaseModel):
    """Response model for calculated molecular properties."""
    mw: float = Field(..., description="Molecular Weight (e.g., g/mol)")
    logp: float = Field(..., description="Octanol-water partition coefficient (ALOGP)")
    hbd: int = Field(..., description="Number of Hydrogen Bond Donors")
    hba: int = Field(..., description="Number of Hydrogen Bond Acceptors")
    psa: float = Field(..., description="Topological Polar Surface Area (TPSA)")
    rtb: int = Field(..., description="Number of Rotatable Bonds")
    heavy_atoms: int = Field(..., description="Number of Heavy (non-hydrogen) Atoms")
    aromatic_rings: int = Field(..., description="Number of Aromatic Rings")


@app.post("/properties/calculate", response_model=CalculatedProperties, tags=["Properties"])
def calculate_molecule_properties(request: PropertyCalculationRequest):
    """
    Calculate key molecular properties for a given SMILES string.
    
    This endpoint takes a SMILES string and uses RDKit to compute
    a standard set of physicochemical properties, which are essential
    for drug discovery and molecular analysis.
    """
    try:
        # Lazy import RDKit modules inside the function
        from rdkit import Chem
        from rdkit.Chem import Descriptors, Lipinski
    except ImportError:
        raise HTTPException(status_code=501, detail="RDKit is not available in this environment.")

    mol = Chem.MolFromSmiles(request.smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Invalid SMILES string provided. Could not parse molecule.")

    # Calculate all properties and create a dictionary
    properties = {
        "mw": Descriptors.MolWt(mol),
        "logp": Descriptors.MolLogP(mol),
        "hbd": Lipinski.NumHDonors(mol),
        "hba": Lipinski.NumHAcceptors(mol),
        "psa": Descriptors.TPSA(mol),
        "rtb": Lipinski.NumRotatableBonds(mol),
        "heavy_atoms": Lipinski.HeavyAtomCount(mol),
        "aromatic_rings": Lipinski.NumAromaticRings(mol),
    }
    # Return the Pydantic model populated with the calculated values
    return CalculatedProperties(**properties)


@app.get("/visualize", tags=["Utilities"], summary="Generate 2D molecule image (SVG)")
def visualize_molecule(smiles: str):
    """
    Generates a 2D SVG image of a molecule from a SMILES string.
    
    Provide a SMILES via a query parameter, and this endpoint will return
    a scalable vector graphic (SVG) of the molecule's structure.
    This is perfect for rendering chemical structures in a web frontend.
    """
    try:
        from rdkit import Chem
        from rdkit.Chem.Draw import MolToSVG
        from fastapi.responses import Response # Import here
    except ImportError:
        raise HTTPException(status_code=501, detail="RDKit is not available in this environment.")

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Invalid SMILES string provided.")
    
    # Generate the SVG content for the molecule
    svg_content = MolToSVG(mol)
    
    # Return the SVG as a proper HTTP response with the correct media type
    return Response(content=svg_content, media_type="image/svg+xml")



# ---------------- ChemBERTa Endpoints (fallback-friendly) ----------------

class EmbedRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES to embed")

class SearchRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES string for similarity search.")
    threshold: float = Field(0.7, gt=0, le=1, description="Similarity threshold (applies to selected metric).")
    metric: Literal['tanimoto', 'cosine'] = Field('tanimoto', description="Similarity metric to use: 'tanimoto' (default) or 'cosine'.")
    enable_post_processing: bool = Field(True, description="Whether to enable advanced post-processing of results.")
    filters: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Property filters, e.g., {'mw': {'lt': 500}, 'logp': {'gt': 1.0}}")
    max_results: int = Field(100, ge=1, le=1000, description="Maximum number of results to return.")

class SearchResponse(BaseModel):
    count: int
    results: List[Compound]
    post_processed: Optional[Dict[str, Any]] = Field(
        None,
        description="Advanced post-processing results including ranked candidates, clusters, and recommendations."
    )

class EmbedResponse(BaseModel):
    length: int
    nonzeros: int
    embedding: List[float]

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




# chek conda environment list:
# conda env list