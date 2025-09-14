#!/usr/bin/env python3
"""
Process ChEMBL database with RDKit (with resume support):
- Compute molecular descriptors (MW, cLogP, tPSA, HBD, HBA, RotBonds, CNS MPO)
- Store results into DuckDB (table rdkit_metrics)
- Resume from last completed batch
- Build a compound_full view joining compound_properties + rdkit_metrics
"""

import duckdb
import pandas as pd
from tqdm import tqdm
from joblib import Parallel, delayed
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen, rdMolDescriptors
import signal, sys

DB_PATH = "chembl_35/chembl_35.db"
BATCH_SIZE = 20000

# ---------------- CNS MPO (simplified rule) ----------------
def calc_cns_mpo(mw, clogp, tpsa, hbd):
    score = 0
    if mw is not None and mw < 360:
        score += 1
    if clogp is not None and 2 <= clogp <= 4:
        score += 1
    if tpsa is not None and tpsa < 70:
        score += 1
    if hbd is not None and hbd <= 1:
        score += 1
    return score


# ---------------- RDKit calculation per molecule ----------------
def process_molecule(molregno, smiles):
    try:
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None
        mw = Descriptors.MolWt(mol)
        clogp = Crippen.MolLogP(mol)
        tpsa = rdMolDescriptors.CalcTPSA(mol)
        hbd = rdMolDescriptors.CalcNumHBD(mol)
        hba = rdMolDescriptors.CalcNumHBA(mol)
        rotb = rdMolDescriptors.CalcNumRotatableBonds(mol)
        cns_mpo = calc_cns_mpo(mw, clogp, tpsa, hbd)

        return {
            "molregno": molregno,
            "molwt": mw,
            "clogp": clogp,
            "tpsa": tpsa,
            "hbd": hbd,
            "hba": hba,
            "rotatable_bonds": rotb,
            "cns_mpo": cns_mpo,
        }
    except Exception:
        return None


# ---------------- Main pipeline ----------------
def main():
    con = duckdb.connect(DB_PATH)

    # Create metrics table if not exists
    con.execute("""
        CREATE TABLE IF NOT EXISTS rdkit_metrics (
            molregno BIGINT,
            molwt DOUBLE,
            clogp DOUBLE,
            tpsa DOUBLE,
            hbd INTEGER,
            hba INTEGER,
            rotatable_bonds INTEGER,
            cns_mpo DOUBLE
        )
    """)

    # Count total molecules
    total = con.execute("SELECT COUNT(*) FROM compound_structures").fetchone()[0]
    print(f"Total molecules: {total}")

    # Figure out how many already processed
    processed = con.execute("SELECT COUNT(*) FROM rdkit_metrics").fetchone()[0]
    start_offset = processed
    print(f"Already processed: {processed}, resuming from offset {start_offset}")

    # Ctrl+C handler
    stop_flag = {"stop": False}
    def signal_handler(sig, frame):
        print("\n⛔ Interrupted by user, stopping gracefully...")
        stop_flag["stop"] = True
    signal.signal(signal.SIGINT, signal_handler)

    # Process in batches (only if not all processed)
    if start_offset < total:
        print("🚀 Starting RDKit calculations...")
        for offset in range(start_offset, total, BATCH_SIZE):
            if stop_flag["stop"]:
                break

            query = f"""
                SELECT molregno, canonical_smiles
                FROM compound_structures
                LIMIT {BATCH_SIZE} OFFSET {offset}
            """
            batch = con.execute(query).fetch_arrow_table().to_pandas()

            # Parallel processing
            results = Parallel(n_jobs=-1)(
                delayed(process_molecule)(row.molregno, row.canonical_smiles)
                for row in tqdm(batch.itertuples(index=False), total=len(batch),
                                desc=f"Batch {offset//BATCH_SIZE+1}")
            )

            # Filter out None
            clean_results = [r for r in results if r is not None]
            if clean_results:
                df = pd.DataFrame(clean_results)
                con.execute("INSERT INTO rdkit_metrics SELECT * FROM df")

            print(f"✅ Finished batch offset {offset}, inserted {len(clean_results)} rows")
    else:
        print("✅ All molecules already processed, skipping to view creation...")

    # --------------------------------
    # Build improved view with proper handling
    # --------------------------------
    print("\n🔧 Creating/updating compound_full view...")
    
    con.execute("DROP VIEW IF EXISTS compound_full")
    
    # Check table structure first
    try:
        columns_info = con.execute("DESCRIBE compound_properties").fetchdf()
        print(f"\n📋 Found {len(columns_info)} columns in compound_properties")
        
        # Get column names to verify what's available
        available_columns = columns_info['column_name'].tolist()
        print(f"📋 Key columns available: {[col for col in ['molregno', 'mw_freebase', 'alogp', 'hbd', 'hba', 'psa', 'rtb'] if col in available_columns]}")
        
    except Exception as e:
        print(f"⚠️ Error checking table structure: {e}")
        available_columns = []

    # Create robust view with proper empty string handling
    try:
        con.execute("""
            CREATE VIEW compound_full AS
            SELECT
                p.molregno,
                
                -- Handle ChEMBL properties with empty string checks
                CASE 
                    WHEN p.mw_freebase IS NULL OR p.mw_freebase = '' THEN NULL 
                    ELSE p.mw_freebase 
                END AS molecular_weight,
                CASE 
                    WHEN p.alogp IS NULL OR p.alogp = '' THEN NULL 
                    ELSE p.alogp 
                END AS logP,
                p.hbd,
                p.hba,
                CASE 
                    WHEN p.psa IS NULL OR p.psa = '' THEN NULL 
                    ELSE p.psa 
                END AS psa,
                p.rtb AS rotatable_bonds,
                
                -- Additional ChEMBL properties
                p.aromatic_rings,
                p.heavy_atoms,
                p.qed_weighted,
                p.full_mwt,
                p.np_likeness_score,
                
                -- RDKit computed properties
                r.molwt AS rdkit_molwt,
                r.clogp AS rdkit_clogp,
                r.tpsa AS rdkit_tpsa,
                r.hbd AS rdkit_hbd,
                r.hba AS rdkit_hba,
                r.rotatable_bonds AS rdkit_rotatable_bonds,
                r.cns_mpo,
                
                -- Add useful flags for data analysis
                CASE WHEN r.molregno IS NOT NULL THEN 1 ELSE 0 END AS has_rdkit_data,
                CASE WHEN p.mw_freebase IS NOT NULL AND p.mw_freebase != '' THEN 1 ELSE 0 END AS has_chembl_mw,
                CASE WHEN p.alogp IS NOT NULL AND p.alogp != '' THEN 1 ELSE 0 END AS has_chembl_logp
                
            FROM compound_properties p
            LEFT JOIN rdkit_metrics r USING(molregno)
        """)
        print("✅ Successfully created compound_full view with robust empty string handling")
        
    except Exception as e:
        print(f"⚠️ Error creating robust view: {e}")
        print("🔄 Trying simplified fallback approach...")
        
        # Fallback: simpler approach without additional columns
        try:
            con.execute("""
                CREATE VIEW compound_full AS
                SELECT
                    p.molregno,
                    p.mw_freebase AS molecular_weight,
                    p.alogp AS logP,
                    p.hbd,
                    p.hba,
                    p.psa,
                    p.rtb AS rotatable_bonds,
                    r.molwt AS rdkit_molwt,
                    r.clogp AS rdkit_clogp,
                    r.tpsa AS rdkit_tpsa,
                    r.hbd AS rdkit_hbd,
                    r.hba AS rdkit_hba,
                    r.rotatable_bonds AS rdkit_rotatable_bonds,
                    r.cns_mpo,
                    CASE WHEN r.molregno IS NOT NULL THEN 1 ELSE 0 END AS has_rdkit_data
                FROM compound_properties p
                LEFT JOIN rdkit_metrics r USING(molregno)
            """)
            print("✅ Created compound_full view with fallback approach")
            
        except Exception as e2:
            print(f"❌ Failed to create view: {e2}")
            con.close()
            return

    # Test and summarize the view - using only RDKit data to avoid empty string issues
    try:
        print("\n📊 Testing compound_full view...")
        
        # Get basic count
        count = con.execute("SELECT COUNT(*) FROM compound_full").fetchone()[0]
        print(f"📊 compound_full view contains {count:,} rows")
        
        # Safe statistics using only RDKit computed data
        summary = con.execute("""
            SELECT 
                COUNT(*) as total_rows,
                SUM(has_rdkit_data) as with_rdkit_data,
                COUNT(cns_mpo) as with_cns_mpo
            FROM compound_full
        """).fetchone()
        
        rdkit_stats = con.execute("""
            SELECT 
                AVG(rdkit_molwt) as avg_rdkit_mw,
                AVG(cns_mpo) as avg_cns_mpo
            FROM compound_full
            WHERE has_rdkit_data = 1
        """).fetchone()
        
        print(f"\n📈 Summary Statistics:")
        print(f"  📊 Total compounds: {summary[0]:,}")
        print(f"  🧪 With RDKit data: {summary[1]:,} ({summary[1]/summary[0]*100:.1f}%)")
        print(f"  🎯 With CNS MPO scores: {summary[2]:,} ({summary[2]/summary[0]*100:.1f}%)")
        if rdkit_stats[0]:
            print(f"  ⚖️  Average RDKit MW: {rdkit_stats[0]:.2f} Da")
        if rdkit_stats[1]:
            print(f"  🧠 Average CNS MPO: {rdkit_stats[1]:.2f}/4.0")
        
        # Safe preview using only RDKit data
        print("\n🔍 Data Preview (compounds with RDKit data):")
        df_preview = con.execute("""
            SELECT 
                molregno,
                rdkit_molwt,
                rdkit_clogp,
                rdkit_tpsa,
                cns_mpo,
                has_rdkit_data
            FROM compound_full 
            WHERE has_rdkit_data = 1
            LIMIT 5
        """).fetchdf()
        
        if not df_preview.empty:
            print(df_preview.to_string(index=False))
        else:
            print("  No preview available")
            
        # Show top CNS MPO compounds
        print("\n🌟 Top 5 CNS MPO compounds:")
        top_cns = con.execute("""
            SELECT 
                molregno,
                rdkit_molwt,
                rdkit_clogp,
                rdkit_tpsa,
                rdkit_hbd,
                cns_mpo
            FROM compound_full 
            WHERE cns_mpo IS NOT NULL 
            ORDER BY cns_mpo DESC, rdkit_molwt ASC
            LIMIT 5
        """).fetchdf()
        
        if not top_cns.empty:
            print(top_cns.to_string(index=False))
        
    except Exception as e:
        print(f"⚠️ Error during view testing: {str(e)}")
        print("The view was created but there might be data access issues.")
        print("You can try querying it manually with simple SELECT statements.")

    con.close()
    print("\n🎉 Processing complete!")
    print("\n💡 Next steps:")
    print("  1. Query compound_full view for your analysis")
    print("  2. Use has_rdkit_data = 1 to filter compounds with computed properties")
    print("  3. Use cns_mpo column to identify CNS-like compounds")
    print("\n📚 Example queries:")
    print("  SELECT * FROM compound_full WHERE has_rdkit_data = 1 AND cns_mpo >= 3 LIMIT 10;")
    print("  SELECT COUNT(*) FROM compound_full WHERE rdkit_molwt < 500 AND cns_mpo >= 2;")


if __name__ == "__main__":
    main()