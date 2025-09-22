from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Union
try:
    # Python 3.8+ provides Literal in typing
    from typing import Literal  # type: ignore
except ImportError:  # Python 3.6 fallback
    from typing_extensions import Literal

class SearchRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES string for similarity search.")
    threshold: float = Field(0.7, gt=0, le=1, description="Similarity threshold (applies to selected metric).")
    metric: Literal['tanimoto', 'cosine'] = Field('tanimoto', description="Similarity metric to use: 'tanimoto' (default) or 'cosine'.")
    enable_post_processing: bool = Field(True, description="Whether to enable advanced post-processing of results.")
    filters: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Property filters, e.g., {'mw': {'lt': 500}, 'logp': {'gt': 1.0}}")
    max_results: int = Field(100, ge=1, le=1000, description="Maximum number of results to return.")

class Compound(BaseModel):
    chembl_id: str
    smiles: str
    similarity: float

class SearchResponse(BaseModel):
    count: int
    results: List[Compound]
    post_processed: Optional[Dict[str, Any]] = Field(
        None,
        description="Advanced post-processing results including ranked candidates, clusters, and recommendations."
    )

class ResolveRequest(BaseModel):
    name: str

class ResolveResponse(BaseModel):
    name: str
    smiles: Optional[str] = None
    chembl_id: Optional[str] = None