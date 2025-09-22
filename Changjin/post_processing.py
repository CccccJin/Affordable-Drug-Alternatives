"""
Post-processing module for drug similarity search results.
Handles ranking, filtering, and clustering of candidate molecules.
"""

from typing import List, Dict, Tuple, Optional, Any
import numpy as np
from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem, rdMolDescriptors
from rdkit.ML.Cluster import Butina
from pydantic import BaseModel, Field, validator
from collections import defaultdict
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CandidateMolecule(BaseModel):
    """Data model for candidate molecules with computed properties."""
    smiles: str = Field(..., description="SMILES representation of the molecule")
    similarity_tanimoto: float = Field(..., ge=0.0, le=1.0, description="Tanimoto similarity score (0-1)")
    similarity_embedding: float = Field(..., ge=0.0, le=1.0, description="Embedding similarity score (0-1)")
    mw: float = Field(..., gt=0, description="Molecular weight (Da)")
    cns_mpo: float = Field(..., ge=0.0, le=6.0, description="CNS MPO score (0-6)")
    cost: float = Field(..., ge=0, description="Relative cost (lower is better)")
    toxicity_flag: bool = Field(..., description="Whether the molecule has known toxicity issues")
    indications: List[str] = Field(default_factory=list, description="List of therapeutic indications")
    name: Optional[str] = Field(None, description="Optional name of the molecule")
    
    # Optional properties that might be calculated later
    num_rotatable_bonds: Optional[int] = Field(None, description="Number of rotatable bonds")
    norm_tanimoto: Optional[float] = Field(None, description="Normalized Tanimoto score")
    norm_embedding: Optional[float] = Field(None, description="Normalized embedding score")
    norm_cns_mpo: Optional[float] = Field(None, description="Normalized CNS MPO score")
    norm_cost: Optional[float] = Field(None, description="Normalized cost score")
    combined_score: Optional[float] = Field(None, description="Combined weighted score")
    
    class Config:
        schema_extra = {
            "example": {
                "smiles": "CN[C@H]1CCCC[C@H]1C(=O)c2ccccc2",
                "similarity_tanimoto": 0.82,
                "similarity_embedding": 0.79,
                "mw": 298.4,
                "cns_mpo": 4.5,
                "cost": 50,
                "toxicity_flag": False,
                "indications": ["depression"],
                "name": "Example Drug"
            }
        }
    
    def calculate_additional_properties(self):
        """Calculate additional molecular properties if not provided."""
        mol = Chem.MolFromSmiles(self.smiles)
        if mol:
            if self.num_rotatable_bonds is None:
                self.num_rotatable_bonds = rdMolDescriptors.CalcNumRotatableBonds(mol)


class PostProcessingResult(BaseModel):
    """Container for post-processing results."""
    ranked_candidates: List[Dict[str, Any]] = Field(..., description="Ranked list of candidate molecules")
    filtered_out: List[Dict[str, Any]] = Field(..., description="Molecules filtered out with reasons")
    clusters: List[Dict[str, Any]] = Field(..., description="Clusters of similar molecules")
    recommendations: List[Dict[str, Any]] = Field(..., description="Top recommended candidates")
    
    class Config:
        json_encoders = {
            np.float32: float,
            np.float64: float,
            np.int32: int,
            np.int64: int,
        }


class DrugPostProcessor:
    """
    Post-processor for drug similarity search results.
    Handles ranking, filtering, and clustering of candidate molecules.
    """
    
    def __init__(
        self, 
        min_similarity: float = 0.6, 
        max_mw: float = 600.0, 
        max_rotatable_bonds: int = 10,
        weights: Optional[Dict[str, float]] = None
    ):
        """
        Initialize the post-processor with filtering thresholds and scoring weights.
        
        Args:
            min_similarity: Minimum similarity score to keep (0-1)
            max_mw: Maximum molecular weight (Da)
            max_rotatable_bonds: Maximum number of rotatable bonds
            weights: Dictionary of weights for scoring (default: {
                'similarity': 0.4,
                'embedding': 0.2,
                'cns_mpo': 0.2,
                'cost': 0.2
            })
        """
        self.min_similarity = min_similarity
        self.max_mw = max_mw
        self.max_rotatable_bonds = max_rotatable_bonds
        
        # Default weights if not provided
        self.weights = weights or {
            'similarity': 0.4,
            'embedding': 0.2,
            'cns_mpo': 0.2,
            'cost': 0.2
        }
        
        # Validate weights sum to 1.0
        if not np.isclose(sum(self.weights.values()), 1.0):
            logger.warning("Weights do not sum to 1.0, normalizing...")
            total = sum(self.weights.values())
            self.weights = {k: v/total for k, v in self.weights.items()}
    
    def normalize_scores(self, candidates: List[CandidateMolecule]) -> List[CandidateMolecule]:
        """
        Normalize all scores to 0-1 range and calculate combined score.
        
        Args:
            candidates: List of CandidateMolecule objects
            
        Returns:
            List of updated CandidateMolecule objects with normalized scores
        """
        if not candidates:
            return []
            
        # Calculate additional properties if needed
        for candidate in candidates:
            candidate.calculate_additional_properties()
        
        # Normalize each metric
        for candidate in candidates:
            # Similarity scores are already 0-1
            candidate.norm_tanimoto = candidate.similarity_tanimoto
            candidate.norm_embedding = candidate.similarity_embedding
            
            # CNS MPO is 0-6, normalize to 0-1
            candidate.norm_cns_mpo = candidate.cns_mpo / 6.0
            
            # Cost: lower is better, so we normalize by max cost
            costs = [c.cost for c in candidates if c.cost > 0]
            max_cost = max(costs) if costs else 1.0
            candidate.norm_cost = 1.0 - min(candidate.cost / max_cost, 1.0)
            
            # Calculate combined score using weights
            candidate.combined_score = (
                self.weights['similarity'] * candidate.norm_tanimoto +
                self.weights['embedding'] * candidate.norm_embedding +
                self.weights['cns_mpo'] * candidate.norm_cns_mpo +
                self.weights['cost'] * candidate.norm_cost
            )
            
        return candidates
    
    def filter_molecules(
        self, 
        candidates: List[CandidateMolecule]
    ) -> Tuple[List[CandidateMolecule], List[Dict]]:
        """
        Filter molecules based on similarity and drug-like properties.
        
        Args:
            candidates: List of CandidateMolecule objects
            
        Returns:
            Tuple of (filtered_candidates, removed_candidates_with_reasons)
        """
        filtered = []
        removed = []
        
        for candidate in candidates:
            reasons = []
            
            # Check similarity threshold
            if candidate.similarity_tanimoto < self.min_similarity:
                reasons.append(f"Low similarity ({candidate.similarity_tanimoto:.2f} < {self.min_similarity})")
            
            # Check molecular weight
            if candidate.mw > self.max_mw:
                reasons.append(f"High molecular weight ({candidate.mw:.1f} > {self.max_mw} Da)")
            
            # Check toxicity
            if candidate.toxicity_flag:
                reasons.append("Toxicity flag set")
            
            # Check rotatable bonds
            if candidate.num_rotatable_bonds is not None and candidate.num_rotatable_bonds > self.max_rotatable_bonds:
                reasons.append(
                    f"Too many rotatable bonds ({candidate.num_rotatable_bonds} > {self.max_rotatable_bonds})"
                )
            
            if reasons:
                removed_candidate = candidate.dict()
                removed_candidate['removal_reasons'] = reasons
                removed.append(removed_candidate)
            else:
                filtered.append(candidate)
                
        return filtered, removed
    
    def cluster_molecules(
        self, 
        molecules: List[CandidateMolecule], 
        cutoff: float = 0.4
    ) -> List[List[Dict]]:
        """
        Cluster molecules by structural similarity using Butina clustering.
        
        Args:
            molecules: List of CandidateMolecule objects
            cutoff: Similarity cutoff for clustering (higher = more clusters)
            
        Returns:
            List of clusters, where each cluster is a list of molecule dicts
        """
        if not molecules:
            return []
            
        # Generate fingerprints
        fps = []
        valid_mols = []
        for mol in molecules:
            rdmol = Chem.MolFromSmiles(mol.smiles)
            if rdmol:
                fp = AllChem.GetMorganFingerprintAsBitVect(rdmol, 2, 1024)
                fps.append(fp)
                valid_mols.append(mol)
        
        if not fps:
            return []
        
        # Calculate distance matrix (1 - Tanimoto similarity)
        dists = []
        nfps = len(fps)
        for i in range(1, nfps):
            sims = DataStructs.BulkTanimotoSimilarity(fps[i], fps[:i])
            dists.extend([1-x for x in sims])
        
        # Cluster using Butina algorithm
        clusters = Butina.ClusterData(dists, nfps, cutoff, isDistData=True)
        
        # Convert to list of molecule groups
        clustered_results = []
        for cluster in clusters:
            cluster_mols = [valid_mols[i].dict() for i in cluster]
            # Add cluster statistics
            cluster_data = {
                'molecules': cluster_mols,
                'size': len(cluster_mols),
                'avg_similarity': np.mean([m['similarity_tanimoto'] for m in cluster_mols]),
                'representative': max(cluster_mols, key=lambda x: x['combined_score'])
            }
            clustered_results.append(cluster_data)
            
        # Sort clusters by average similarity (descending)
        return sorted(clustered_results, key=lambda x: x['avg_similarity'], reverse=True)
    
    def process_results(
        self, 
        query_drug: str, 
        candidates: List[Dict],
        top_n: int = 10
    ) -> Dict:
        """
        Main method to process and rank candidate molecules.
        
        Args:
            query_drug: Name of the query drug
            candidates: List of candidate molecule dictionaries
            top_n: Number of top candidates to return in recommendations
            
        Returns:
            Dictionary containing processed results
        """
        if not candidates:
            return {"error": "No candidate molecules provided"}
        
        try:
            # Convert input dictionaries to CandidateMolecule objects
            candidate_objs = [CandidateMolecule(**c) for c in candidates]
            
            # Normalize scores and calculate combined score
            candidate_objs = self.normalize_scores(candidate_objs)
            
            # Filter molecules
            filtered_candidates, removed_candidates = self.filter_molecules(candidate_objs)
            
            # Sort by combined score (descending)
            filtered_candidates.sort(key=lambda x: x.combined_score, reverse=True)
            
            # Cluster remaining molecules
            clusters = self.cluster_molecules(filtered_candidates)
            
            # Prepare results
            result = {
                "ranked_candidates": [c.dict() for c in filtered_candidates],
                "filtered_out": removed_candidates,
                "clusters": clusters,
                "recommendations": [c.dict() for c in filtered_candidates[:top_n]]
            }
            
            return PostProcessingResult(**result).dict()
            
        except Exception as e:
            logger.error(f"Error processing results: {str(e)}", exc_info=True)
            return {"error": f"Error processing results: {str(e)}"}


def process_example():
    """Example usage of the DrugPostProcessor."""
    example_data = {
        "query_drug": "Esketamine",
        "candidates": [
            {
                "smiles": "CN[C@H]1CCCC[C@H]1C(=O)c2ccccc2",
                "similarity_tanimoto": 0.82,
                "similarity_embedding": 0.79,
                "mw": 298.4,
                "cns_mpo": 4.5,
                "cost": 50,
                "toxicity_flag": False,
                "indications": ["depression"],
                "name": "Ketamine"
            },
            {
                "smiles": "CN[C@H]1CCCC[C@H]1C(=O)c2ccccc2F",
                "similarity_tanimoto": 0.78,
                "similarity_embedding": 0.72,
                "mw": 316.4,
                "cns_mpo": 4.2,
                "cost": 65,
                "toxicity_flag": False,
                "indications": ["depression"],
                "name": "Fluoroketamine"
            },
            {
                "smiles": "CN1CCCC1C(=O)c2ccccc2",
                "similarity_tanimoto": 0.85,
                "similarity_embedding": 0.81,
                "mw": 298.4,
                "cns_mpo": 4.6,
                "cost": 45,
                "toxicity_flag": True,
                "indications": ["depression"],
                "name": "Racemic Ketamine"
            },
            {
                "smiles": "CCN(CC)C(=O)c1ccccc1",
                "similarity_tanimoto": 0.45,
                "similarity_embedding": 0.38,
                "mw": 177.2,
                "cns_mpo": 3.8,
                "cost": 30,
                "toxicity_flag": False,
                "indications": ["anesthesia"],
                "name": "Lidocaine"
            }
        ]
    }
    
    # Initialize processor
    processor = DrugPostProcessor()
    
    # Process results
    results = processor.process_results(
        query_drug=example_data["query_drug"],
        candidates=example_data["candidates"]
    )
    
    return results


if __name__ == "__main__":
    # Example usage
    results = process_example()
    print("Top recommendations:")
    for i, rec in enumerate(results.get("recommendations", [])[:3], 1):
        print(f"{i}. {rec.get('name', 'Unnamed')} (Score: {rec.get('combined_score', 0):.3f})")
        print(f"   SMILES: {rec.get('smiles')}")
        print(f"   Indications: {', '.join(rec.get('indications', []))}")
        print(f"   MW: {rec.get('mw')} Da, Cost: {rec.get('cost')}, Toxicity: {'Yes' if rec.get('toxicity_flag') else 'No'}")
        print()
