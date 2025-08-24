from pydantic import BaseModel, Field
from typing import List, Dict, Optional

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