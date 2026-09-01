# main.py (更新后)

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import logging
from rdkit import DataStructs
import duckdb

# 从 models.py 统一导入所有数据模型
from models import (
    SearchRequest,
    SearchResponse,
    ResolveRequest,
    ResolveResponse,
    Compound,
    PropertyCalculationRequest,
    CalculatedProperties,
    EmbedRequest,
    EmbedResponse
)
# Optional: ChemBERTa search needs torch, transformers and pandas, none of
# which the API container installs — the model alone is ~315 MB for an endpoint
# that cannot run without it. Absent the module, /search_ai reports 501 rather
# than the whole service failing to import.
try:
    from chemberta_service import search_similar_chemberta
except ImportError as _chemberta_error:  # pragma: no cover - depends on install
    search_similar_chemberta = None
    _CHEMBERTA_IMPORT_ERROR = str(_chemberta_error)
from post_processing import DrugPostProcessor
from chem import smiles_to_fingerprint
from db import get_db_connection
from fingerprint_index import get_index

# Optional ChEMBL client import
try:
    from chembl_webresource_client.new_client import new_client
except ImportError:
    new_client = None

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

# CORS settings to allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the post-processor
post_processor = DrugPostProcessor(
    min_similarity=0.6,
    max_mw=600.0,
    max_rotatable_bonds=10
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("startup")
def on_startup():
    print_startup_message()

# --- Helper(s): map ChEMBL IDs to preferred names ---
def get_pref_name(chembl_id: str) -> str:
    """Lookup preferred drug name from local DuckDB; fallback to chembl_id if not found."""
    try:
        con = get_db_connection()
        id_norm = (chembl_id or "").strip().upper()
        row = con.execute(
            "SELECT pref_name FROM molecule_dictionary WHERE chembl_id = ?",
            [id_norm],
        ).fetchone()
        con.close()
        if row and row[0]:
            return row[0]
    except Exception as e:
        # Non-fatal: if lookup fails, just return the original ID
        logger.warning(f"get_pref_name lookup failed for {chembl_id}: {e}")
    return chembl_id


def get_pref_name_map(chembl_ids: List[str]) -> dict:
    """Batch lookup for a list of ChEMBL IDs. Returns mapping {UPPER_ID: pref_or_id}."""
    mapping: dict = {}
    unique_ids = [cid for cid in dict.fromkeys(chembl_ids) if cid]
    if not unique_ids:
        return mapping
    try:
        con = get_db_connection()
        # Normalize inputs to uppercase trimmed keys
        norm_ids = [(cid or "").strip().upper() for cid in unique_ids]
        placeholders = ",".join(["?"] * len(norm_ids))
        query = f"""
            SELECT chembl_id, pref_name
            FROM molecule_dictionary
            WHERE chembl_id IN ({placeholders})
        """
        rows = con.execute(query, norm_ids).fetchall()
        con.close()
        # Default fallback maps to itself (normalized key -> original or normalized?)
        for nid in norm_ids:
            mapping[nid] = nid
        for cid, pref in rows:
            key = (cid or "").strip().upper()
            if pref:
                mapping[key] = pref
    except Exception as e:
        logger.warning(f"get_pref_name_map batch lookup failed: {e}")
        for cid in unique_ids:
            nid = (cid or "").strip().upper()
            mapping[nid] = get_pref_name(cid)
    return mapping

# --- Endpoints ---

@app.get("/", include_in_schema=False)
def root():
    return FileResponse("index.html")

@app.get("/health", tags=["system"], summary="Health check")
def health_check():
    """Lightweight health check endpoint."""
    return {"status": "ok"}

@app.post("/search", response_model=SearchResponse, tags=["Search"])
def search_similar_compounds(request: SearchRequest):
    """
    Search for compounds similar to the input SMILES, using pre-calculated fingerprints.
    Returns both basic and post-processed results with advanced filtering and ranking.
    """
    try:
        from db import get_db_connection
    except Exception as e:
        raise HTTPException(status_code=501, detail="DuckDB backend is not available: " + str(e))
    
    input_fp = smiles_to_fingerprint(request.smiles)
    if input_fp is None or len(input_fp) == 0:
        raise HTTPException(status_code=400, detail="Invalid input SMILES or could not generate fingerprint.")

    # Scored against an index built once per process rather than a fresh scan
    # of the whole table. The vectors do not change between requests; rebuilding
    # 2.4M of them per query was the dominant cost at ChEMBL scale and made
    # concurrency pay it several times over.
    index = get_index(get_db_connection)

    logger.info("Scoring against %s compounds (%s)...", f"{len(index):,}", index.column)
    results = []
    candidate_dicts = []

    for row, similarity in zip(index.rows, index.similarities(input_fp, request.metric)):
        if similarity < request.threshold:
            continue
        (chembl_id, smiles, mw, logp, hba, hbd, psa, rtb,
         heavy_atoms, aromatic_rings) = row
        candidate_dicts.append({
            'smiles': smiles, 'similarity_tanimoto': similarity, 'similarity_embedding': similarity,
            'mw': mw, 'cns_mpo': 4.5, 'cost': 100.0, 'toxicity_flag': False, 'indications': [],
            'name': chembl_id, 'num_rotatable_bonds': rtb, 'logp': logp, 'hba': hba, 'hbd': hbd,
            'psa': psa, 'aromatic_rings': aromatic_rings
        })
        results.append(Compound(chembl_id=chembl_id, smiles=smiles, similarity=float(similarity)))

    logger.info(f"Found {len(results)} similar compounds before post-processing.")

    results.sort(key=lambda x: x.similarity, reverse=True)
    
    try:
        # Map ChEMBL IDs to preferred names before post-processing/response
        id_map = get_pref_name_map([r.chembl_id for r in results])
        for r in results:
            nid = (r.chembl_id or "").strip().upper()
            r.chembl_id = id_map.get(nid, r.chembl_id)

        # The request field existed, was documented, and was never read: every
        # search paid for post-processing whether or not it asked for it.
        post_processed = post_processor.process_results(
            query_drug=request.smiles,
            candidates=candidate_dicts,
            top_n=min(50, len(candidate_dicts))
        ) if request.enable_post_processing else None
        response_content = {
            'count': len(results),
            'results': [r.dict() for r in results[:request.max_results]], # Apply max_results
            'post_processed': post_processed
        }
        return JSONResponse(content=response_content)
    except Exception as e:
        logger.error(f"Error in post-processing: {str(e)}", exc_info=True)
        return SearchResponse(
            count=len(results),
            results=results[:request.max_results],
            post_processed={'error': f"Post-processing failed: {str(e)}"}
        )

@app.post("/resolve_name", response_model=ResolveResponse, tags=["Utilities"])
def resolve_chemical_name(request: ResolveRequest):
    """Resolves a chemical name to its SMILES representation using the ChEMBL API."""
    if new_client is None:
        raise HTTPException(status_code=501, detail="ChEMBL client not installed.")
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
            raise HTTPException(status_code=404, detail="Chemical name not found in ChEMBL.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/properties", response_model=List[str], tags=["Properties"])
def get_filterable_properties():
    """Returns a list of molecular properties that can be used for filtering."""
    return ["mw", "logp", "hbd", "hba", "psa", "rtb", "heavy_atoms", "aromatic_rings"]

@app.post("/properties/calculate", response_model=CalculatedProperties, tags=["Properties"])
def calculate_molecule_properties(request: PropertyCalculationRequest):
    """Calculate key molecular properties for a given SMILES string."""
    try:
        from rdkit import Chem
        from rdkit.Chem import Descriptors, Lipinski
    except ImportError:
        raise HTTPException(status_code=501, detail="RDKit is not available.")
    mol = Chem.MolFromSmiles(request.smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Invalid SMILES string provided.")
    properties = {
        "mw": Descriptors.MolWt(mol), "logp": Descriptors.MolLogP(mol),
        "hbd": Lipinski.NumHDonors(mol), "hba": Lipinski.NumHAcceptors(mol),
        "psa": Descriptors.TPSA(mol), "rtb": Lipinski.NumRotatableBonds(mol),
        "heavy_atoms": Lipinski.HeavyAtomCount(mol), "aromatic_rings": Lipinski.NumAromaticRings(mol),
    }
    return CalculatedProperties(**properties)

@app.get("/visualize", tags=["Utilities"], summary="Generate 2D molecule image (SVG)")
def visualize_molecule(smiles: str):
    """Generates a 2D SVG image of a molecule from a SMILES string."""
    try:
        from rdkit import Chem
        from rdkit.Chem import rdDepictor
        from rdkit.Chem.Draw import rdMolDraw2D
        from fastapi.responses import Response
    except ImportError:
        raise HTTPException(status_code=501, detail="RDKit is not available.")
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Invalid SMILES string provided.")
    try:
        # Ensure 2D coordinates exist to avoid 'Bad Conformer Id'
        rdDepictor.Compute2DCoords(mol)
        drawer = rdMolDraw2D.MolDraw2DSVG(300, 240)  # width x height
        drawer.DrawMolecule(mol)
        drawer.FinishDrawing()
        svg_content = drawer.GetDrawingText()
        return Response(content=svg_content, media_type="image/svg+xml")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to render molecule: {str(e)}")

# --- ChemBERTa Endpoints ---

@app.post("/search_ai", response_model=SearchResponse, tags=["AI Search (ChemBERTa)"])
def search_ai_demo(request: SearchRequest):
    """Performs AI-powered similarity search using a small, pre-calculated demo dataset."""
    if search_similar_chemberta is None:
        raise HTTPException(
            status_code=501,
            detail=("ChemBERTa search is unavailable in this deployment: "
                    f"{_CHEMBERTA_IMPORT_ERROR}. It needs torch, transformers "
                    "and precomputed embeddings."))
    try:
        results = search_similar_chemberta(request.smiles, top_k=request.max_results)
        response_results = [Compound(**res) for res in results]
        # Map ChEMBL IDs to preferred names before returning (normalize keys)
        id_map = get_pref_name_map([r.chembl_id for r in response_results])
        for r in response_results:
            nid = (r.chembl_id or "").strip().upper()
            r.chembl_id = id_map.get(nid, r.chembl_id)
        return SearchResponse(count=len(response_results), results=response_results)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not process SMILES: {str(e)}")
