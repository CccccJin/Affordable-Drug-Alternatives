# models.py (更新后)

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Union

try:
    # Python 3.8+
    from typing import Literal
except ImportError:
    # Python 3.6 fallback
    from typing_extensions import Literal

# --- 核心搜索模型 ---

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

# --- 名称解析模型 ---

class ResolveRequest(BaseModel):
    name: str

class ResolveResponse(BaseModel):
    name: str
    smiles: Optional[str] = None
    chembl_id: Optional[str] = None

# --- 属性计算模型 (从 main.py 移动过来) ---

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

# --- ChemBERTa AI 模型 (从 main.py 移动过来) ---

class EmbedRequest(BaseModel):
    smiles: str = Field(..., description="Input SMILES to embed")

class EmbedResponse(BaseModel):
    length: int
    nonzeros: int
    embedding: List[float]