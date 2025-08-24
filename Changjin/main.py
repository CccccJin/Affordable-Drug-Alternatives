from fastapi import FastAPI, HTTPException
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

@app.post("/search", response_model=SearchResponse)
def search_similar_compounds(request: SearchRequest):
    """
    Search for compounds similar to the input SMILES, with optional property filters.
    """
    # 1. 生成输入分子的指纹
    input_fp = smiles_to_fingerprint(request.smiles)
    if not input_fp:
        raise HTTPException(status_code=400, detail="Invalid input SMILES string.")

    # 2. 构建 SQL 查询
    sql_query = "SELECT chembl_id, smiles, fingerprint_hex FROM compounds WHERE 1=1"
    params = []
    if request.filters:
        for prop, conditions in request.filters.items():
            for op, value in conditions.items():
                # 安全地构建查询
                # 支持的操作: 'gt' (>), 'lt' (<), 'gte' (>=), 'lte' (<=)
                op_map = {'gt': '>', 'lt': '<', 'gte': '>=', 'lte': '<='}
                if op in op_map:
                    sql_query += f" AND {prop} {op_map[op]} ?"
                    params.append(value)
    
    # 3. 从 DuckDB 获取候选分子
    con = get_db_connection()
    candidates = con.execute(sql_query, params).fetchall()
    con.close()

    # 4. 在内存中计算相似度
    results = []
    for chembl_id, smiles, fp_hex in candidates:
        similarity = calculate_similarity(input_fp, fp_hex)
        if similarity >= request.threshold:
            results.append(Compound(chembl_id=chembl_id, smiles=smiles, similarity=similarity))

    # 5. 排序并返回结果
    results.sort(key=lambda x: x.similarity, reverse=True)
    
    return SearchResponse(count=len(results), results=results)


@app.post("/resolve_name", response_model=ResolveResponse)
def resolve_chemical_name(request: ResolveRequest):
    """
    Resolves a chemical name or tradename to its SMILES representation using ChEMBL.
    """
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
            raise HTTPException(status_code=404, detail="Name not found in ChEMBL.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/properties", response_model=List[str])
def get_filterable_properties():
    """
    Returns a list of properties that can be used for filtering in the /search endpoint.
    """
    # 可以硬编码，也可以从数据库动态获取
    return ["mw", "logp", "hbd", "hba"]