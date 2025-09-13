from pydantic import BaseModel, Field
from typing import List, Dict, Optional
try:
    # Python 3.8+ provides Literal in typing
    from typing import Literal  # type: ignore
except ImportError:  # Python 3.6 fallback
    from typing_extensions import Literal

class SearchRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES string for similarity search.")
    # Similarity threshold now applies to the selected metric (Tanimoto or Cosine)
    threshold: float = Field(0.7, gt=0, le=1, description="Similarity threshold (applies to selected metric).")
    # filters: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Property filters, e.g., {'mw': {'lt': 500}}")
    # New: allow clients to choose the similarity metric. Limited to 'tanimoto' or 'cosine'.
    # Using typing.Literal ensures only the specified values are accepted.
    metric: Literal['tanimoto', 'cosine'] = Field('tanimoto', description="Similarity metric to use: 'tanimoto' (default) or 'cosine'.")

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