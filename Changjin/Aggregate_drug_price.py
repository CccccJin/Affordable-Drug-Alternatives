#!/usr/bin/env python3
"""
Aggregate drug price data from WHO GPRM / NHS SCMD / GoodRx
Priority: WHO > NHS > GoodRx
"""

import urllib.request
import pandas as pd
from io import StringIO, BytesIO
from bs4 import BeautifulSoup
import requests
import re
from typing import List, Dict, Optional, Any, Tuple
import time
import random
import duckdb
from datetime import datetime
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from pathlib import Path
import zipfile
import hashlib
from difflib import SequenceMatcher

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Unified schema definition
UNIFIED_SCHEMA = {
    "chembl_id": str,
    "INN": str,
    "Price": float,
    "Currency": str,
    "Source": str,
    "MatchedName": str,
    "Country": str,
    "Year": int,
    "DosageForm": str,
    "Unit": str,
    "URL": str,
    "LastUpdated": str
}

# Performance configuration
CONFIG = {
    'BATCH_SIZE': 1000,
    'MAX_WORKERS': 5,
    'GOODRX_CACHE_DAYS': 30,
    'MIN_SIMILARITY_SCORE': 0.6,
    'MAX_RETRIES': 3,
    'RETRY_DELAY': 2.0
}

# =====================
# Configuration
# =====================
REQUEST_DELAY = 1  # Delay between requests to avoid rate limiting
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
]

# Thread-safe lock for database operations
db_lock = threading.Lock()

# =====================
# Database Functions
# =====================
def init_database(db_path: str = "chembl_35/chembl_35.duckdb") -> duckdb.DuckDBPyConnection:
    """Initialize the DuckDB database and create tables if they don't exist."""
    try:
        conn = duckdb.connect(database=db_path, read_only=False)
        
        # Create drug_prices table if it doesn't exist
        conn.execute("""
        CREATE TABLE IF NOT EXISTS drug_prices (
            chembl_id VARCHAR,
            INN VARCHAR,
            Price DOUBLE,
            Currency VARCHAR,
            Source VARCHAR,
            MatchedName VARCHAR,
            Country VARCHAR,
            Year INTEGER,
            DosageForm VARCHAR,
            Unit VARCHAR,
            URL VARCHAR,
            LastUpdated TIMESTAMP,
            UNIQUE(chembl_id, Source, Country, Year, MatchedName)
        )
        """)
        
        # Create GoodRx cache table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS goodrx_cache (
            INN VARCHAR PRIMARY KEY,
            Price DOUBLE,
            Currency VARCHAR,
            URL VARCHAR,
            LastUpdated TIMESTAMP,
            IsValid BOOLEAN
        )
        """)
        
        # Create indexes for better performance
        conn.execute("CREATE INDEX IF NOT EXISTS idx_drug_prices_inn ON drug_prices(INN)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_drug_prices_chembl ON drug_prices(chembl_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_drug_prices_country ON drug_prices(Country)")
        
        return conn
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise

def extract_inn_list_from_chembl(db_path: str = "chembl_35/chembl_35.duckdb") -> pd.DataFrame:
    """Extract INN list from ChEMBL_35 database."""
    try:
        conn = duckdb.connect(database=db_path, read_only=True)
        
        query = """
        SELECT DISTINCT m.chembl_id, s.synonyms AS INN
        FROM molecule_dictionary m
        JOIN molecule_synonyms s ON m.molregno = s.molregno
        WHERE s.syn_type = 'INN'
        AND s.synonyms IS NOT NULL
        AND LENGTH(TRIM(s.synonyms)) > 0
        ORDER BY s.synonyms
        """
        
        df = conn.execute(query).fetch_df()
        logger.info(f"Extracted {len(df)} unique INNs from ChEMBL_35")
        
        # Clean up INN names
        df['INN'] = df['INN'].str.strip()
        df = df[df['INN'].str.len() > 1]  # Remove single character INNs
        
        conn.close()
        return df
        
    except Exception as e:
        logger.error(f"Error extracting INN list from ChEMBL: {e}")
        return pd.DataFrame()

def save_to_database(conn: duckdb.DuckDBPyConnection, df: pd.DataFrame) -> int:
    """Save DataFrame to database with strict column projection and validation."""
    if df.empty:
        return 0

    # 1) Ensure all required columns exist; drop extras later by projection
    for col in UNIFIED_SCHEMA.keys():
        if col not in df.columns:
            df[col] = None

    # 2) Convert to proper types
    for col, dtype in UNIFIED_SCHEMA.items():
        if col in df.columns:
            if dtype == int:
                df[col] = pd.to_numeric(df[col], errors='coerce').astype('Int64')
            elif dtype == float:
                df[col] = pd.to_numeric(df[col], errors='coerce')

    # 3) Filter invalid rows
    df_clean = df[(df['INN'].notna()) & (df['INN'].astype(str).str.len() > 0)]
    if 'Price' in df_clean.columns:
        df_clean = df_clean[(df_clean['Price'].notna()) & (df_clean['Price'] > 0)]
    if df_clean.empty:
        logger.warning("No valid records to save after cleaning")
        return 0

    # 4) Add LastUpdated
    df_clean = df_clean.copy()
    df_clean['LastUpdated'] = datetime.now().isoformat()

    # 5) Project to exact column order to match table schema
    cols = [
        'chembl_id','INN','Price','Currency','Source','MatchedName',
        'Country','Year','DosageForm','Unit','URL','LastUpdated'
    ]
    df_proj = df_clean[cols]

    # 6) Register and insert using explicit column list
    try:
        conn.register('temp_df', df_proj)
        conn.execute(
            """
            INSERT OR REPLACE INTO drug_prices (
                chembl_id, INN, Price, Currency, Source, MatchedName,
                Country, Year, DosageForm, Unit, URL, LastUpdated
            )
            SELECT chembl_id, INN, Price, Currency, Source, MatchedName,
                   Country, Year, DosageForm, Unit, URL, LastUpdated
            FROM temp_df
            """
        )
        conn.unregister('temp_df')
        return len(df_proj)
    except Exception as e:
        logger.error(f"Error saving to database: {e}")
        return 0

def query_min_price(inn: str, country: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Query the lowest price for a given INN, optionally filtered by country.
    Returns the row with the lowest price.
    """
    conn = init_database()
    try:
        # First try with country filter if provided
        query = """
            SELECT * FROM drug_prices 
            WHERE LOWER(INN) = LOWER(?) 
            {country_filter}
            ORDER BY Price ASC 
            LIMIT 1
        """
        
        params = [inn]
        country_filter = "AND LOWER(Country) = LOWER(?)" if country else ""
        
        if country:
            params.append(country)
            
        result = conn.execute(
            query.format(country_filter=country_filter),
            params
        ).fetch_df()
        
        # If no results with country filter, try without it
        if result.empty and country:
            result = conn.execute("""
                SELECT * FROM drug_prices 
                WHERE LOWER(INN) = LOWER(?) 
                ORDER BY Price ASC 
                LIMIT 1
            """, [inn]).fetch_df()
            
        return result.to_dict('records')[0] if not result.empty else None
        
    except Exception as e:
        logger.error(f"Error querying min price: {e}")
        return None
    finally:
        conn.close()

# =====================
# Helper Functions
# =====================
def get_random_user_agent() -> str:
    """Return a random user agent string to avoid blocking"""
    return random.choice(USER_AGENTS)

def make_request(url: str, max_retries: int = 3) -> Optional[requests.Response]:
    """Make HTTP request with retries and random delays"""
    headers = {
        'User-Agent': get_random_user_agent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            print(f"Attempt {attempt + 1} failed: {e}")
            if attempt == max_retries - 1:
                return None
            time.sleep((2 ** attempt) + random.random())  # Exponential backoff
    
    return None

# =====================
# Data Source: WHO GPRM
# =====================
def fetch_who_prices(country: Optional[str] = None) -> pd.DataFrame:
    """Fetch WHO GPRM data and return in unified schema."""
    try:
        who_url = "https://apps.who.int/hiv/amds/price/hdd/Export.aspx?gc=RDT"
        if country:
            who_url += f"&country={country}"
            
        logger.info(f"Fetching WHO GPRM data from {who_url}")
        response = make_request(who_url)
        if not response:
            logger.warning("Failed to fetch WHO GPRM data")
            return pd.DataFrame()
            
        # Try to read as Excel first, then CSV if that fails
        try:
            df = pd.read_excel(BytesIO(response.content))
        except:
            try:
                df = pd.read_csv(BytesIO(response.content))
            except:
                logger.error("Could not parse WHO GPRM data as Excel or CSV")
                return pd.DataFrame()
            
        # Map WHO columns to unified schema
        column_mapping = {
            'GenericName': 'INN',
            'UnitPrice': 'Price',
            'CountryName': 'Country',
            'DosageForm': 'DosageForm',
            'Year': 'Year',
            'Currency': 'Currency'
        }
        
        # Apply column mapping
        df = df.rename(columns={k: v for k, v in column_mapping.items() if k in df.columns})
        
        # Add missing columns with default values
        for col in UNIFIED_SCHEMA:
            if col not in df.columns:
                df[col] = None
                
        # Set source and ensure required columns
        df['Source'] = 'WHO GPRM'
        df['MatchedName'] = df['INN']  # Use INN as MatchedName by default
        df['Unit'] = df.get('Unit', 'USD')  # Default to USD if not specified
        df['Year'] = pd.to_numeric(df['Year'], errors='coerce').fillna(datetime.now().year)
        
        # Filter and return only unified schema columns
        result_df = df[list(UNIFIED_SCHEMA.keys())].dropna(subset=['INN', 'Price'])
        logger.info(f"Successfully loaded {len(result_df)} records from WHO GPRM")
        return result_df
        
    except Exception as e:
        logger.error(f"Error fetching WHO GPRM data: {e}")
        return pd.DataFrame()

# =====================
# Data Source: NHS SCMD
# =====================
def fetch_nhs_prices() -> pd.DataFrame:
    """Fetch NHS SCMD prices and return in unified schema."""
    try:
        package_url = "https://opendata.nhsbsa.net/api/3/action/package_show?id=secondary-care-medicines-data-indicative-price"
        response = make_request(package_url)
        if not response:
            logger.warning("Failed to fetch NHS SCMD package information")
            return pd.DataFrame()
        package_info = response.json()
        resources = package_info.get('result', {}).get('resources', [])
        csv_resource = next((r for r in resources if r.get('format', '').lower() == 'csv'), None)
        if not csv_resource:
            logger.error("No CSV resource found in NHS SCMD package")
            return pd.DataFrame()
        csv_url = csv_resource.get('url')
        logger.info(f"Downloading NHS SCMD data from: {csv_url}")
        response = make_request(csv_url)
        if not response:
            return pd.DataFrame()
        df = pd.read_csv(BytesIO(response.content))
        # Map to unified schema
        df = df.rename(columns={
            "VMP_PRODUCT_NAME": "MatchedName",
            "VMP_SNOMED_CODE": "chembl_id",
            "INDICATIVE_COST": "Price"
        })
        # Filter out invalid prices
        if 'Price' in df.columns:
            df = df[(df['Price'].notna()) & (df['Price'] > 0)]
        # Extract INN from product name (keep light)
        df['INN'] = df['MatchedName'].astype(str).str.extract(r'^([A-Za-z][A-Za-z\s-]+?)')[0].str.strip()
        # Add missing columns
        df['Source'] = 'NHS SCMD'
        df['Country'] = 'United Kingdom'
        df['Currency'] = 'GBP'
        df['Year'] = datetime.now().year
        df['Unit'] = 'GBP'
        df['URL'] = csv_url
        for col in UNIFIED_SCHEMA:
            if col not in df.columns:
                df[col] = None
        result_df = df[list(UNIFIED_SCHEMA.keys())].dropna(subset=['INN', 'Price'])
        logger.info(f"Successfully loaded {len(result_df)} records from NHS SCMD")
        return result_df
    except Exception as e:
        logger.error(f"Error fetching NHS SCMD data: {e}")
        return pd.DataFrame()

def ensure_nhs_loaded_into_duckdb(conn: duckdb.DuckDBPyConnection) -> None:
    """Load NHS SCMD unified data into DuckDB table nhs_prices with lowercase index for matching."""
    try:
        # Check if table exists and non-empty
        exists = conn.execute("SELECT count(*) FROM information_schema.tables WHERE table_name='nhs_prices'").fetchone()[0]
        if exists:
            cnt = conn.execute("SELECT COUNT(*) FROM nhs_prices").fetchone()[0]
            if cnt > 0:
                logger.info(f"nhs_prices already loaded with {cnt} rows")
                return
        # Fetch and load
        df = fetch_nhs_prices()
        if df.empty:
            logger.warning("NHS SCMD fetch returned empty; nhs_prices not created")
            return
        # Prepare lowercase column for LIKE
        df['MatchedName_lc'] = df['MatchedName'].astype(str).str.lower()
        conn.register('nhs_tmp_df', df)
        conn.execute(
            """
            CREATE TABLE nhs_prices AS SELECT * FROM nhs_tmp_df
            """
        )
        # Indexes for performance
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nhs_matchedname_lc ON nhs_prices(MatchedName_lc)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nhs_inn ON nhs_prices(INN)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_nhs_price ON nhs_prices(Price)")
        logger.info("nhs_prices loaded into DuckDB with indexes")
        # Free temp
        conn.unregister('nhs_tmp_df')
    except Exception as e:
        logger.error(f"Error loading NHS into DuckDB: {e}")

def get_already_processed_inns(conn: duckdb.DuckDBPyConnection) -> set:
    """Return a set of INNs already present in drug_prices."""
    try:
        df = conn.execute("SELECT DISTINCT LOWER(INN) AS inn FROM drug_prices").fetch_df()
        return set(df['inn'].tolist()) if not df.empty else set()
    except Exception:
        return set()

def match_inns_to_nhs_duckdb(conn: duckdb.DuckDBPyConnection, inn_batch: List[Dict[str, str]]) -> pd.DataFrame:
    """Match a batch of INNs to NHS using DuckDB prefilter + SequenceMatcher refinement."""
    results: List[Dict[str, Any]] = []
    for rec in inn_batch:
        chembl_id = rec['chembl_id']
        inn = rec['INN']
        inn_lc = inn.lower()
        try:
            # 1) Exact INN match on INN column first -> pick lowest price
            exact_df = conn.execute(
                """
                SELECT * FROM nhs_prices
                WHERE LOWER(INN) = ?
                ORDER BY Price ASC
                LIMIT 1
                """,
                [inn_lc]
            ).fetch_df()
            if not exact_df.empty:
                row = exact_df.iloc[0].to_dict()
                row['chembl_id'] = chembl_id
                results.append(row)
                continue
            # 2) Prefilter candidates via LIKE on MatchedName_lc
            like_pattern = f"%{inn_lc}%"
            cand_df = conn.execute(
                """
                SELECT * FROM nhs_prices
                WHERE MatchedName_lc LIKE ?
                """,
                [like_pattern]
            ).fetch_df()
            if cand_df.empty:
                continue
            # 3) Refine with SequenceMatcher (prefer highest similarity, then lowest price)
            best_row_series = None
            best_sim = -1.0
            best_price = float('inf')
            for _, r in cand_df.iterrows():
                sim = SequenceMatcher(None, inn_lc, str(r['MatchedName_lc'])).ratio()
                price_val = float(r['Price']) if pd.notna(r['Price']) else float('inf')
                if (sim > best_sim) or (abs(sim - best_sim) < 1e-9 and price_val < best_price):
                    best_row_series = r
                    best_sim = sim
                    best_price = price_val
            if best_row_series is not None and best_sim >= 0.6:
                best_row = best_row_series.to_dict()
                best_row['chembl_id'] = chembl_id
                results.append(best_row)
        except Exception as e:
            logger.warning(f"Matching error for INN={inn}: {e}")
            continue
    return pd.DataFrame(results)

# =====================
# Data Source: GoodRx
# =====================
def fetch_goodrx_prices(drug_list: List[str]) -> pd.DataFrame:
    """Fetch GoodRx prices and return in unified schema."""
    results = []
    
    for inn in drug_list:
        url = f"https://www.goodrx.com/{urllib.parse.quote(inn.lower().replace(' ', '-'))}"
        
        try:
            response = make_request(url)
            if not response:
                continue
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Look for price in the page
            price_element = soup.find('span', class_='drug-price-banner__price')
            if not price_element:
                price_element = soup.find('span', {'data-testid': 'drug-amount'})
                
            if price_element:
                price_text = price_element.get_text(strip=True)
                price_match = re.search(r'[\d.]+', price_text.replace(',', ''))
                if price_match:
                    price = float(price_match.group())
                    
                    # Create record in unified schema
                    record = {col: None for col in UNIFIED_SCHEMA}
                    record.update({
                        'INN': inn,
                        'MatchedName': inn,
                        'Price': price,
                        'Currency': 'USD',
                        'Source': 'GoodRx',
                        'Country': 'United States',
                        'Year': datetime.now().year,
                        'Unit': 'USD',
                        'URL': url
                    })
                    results.append(record)
                    
        except Exception as e:
            logger.error(f"Error fetching GoodRx price for {inn}: {e}")
        
        # Be nice to the servers
        time.sleep(REQUEST_DELAY + random.random())
    
    return pd.DataFrame(results)

# =====================
# Main Aggregation
# =====================
def fetch_nhs_prices_bulk() -> pd.DataFrame:
    """批量获取 NHS SCMD 数据，实际上就是一次全量抓取"""
    return fetch_nhs_prices()

def aggregate_prices(drug_list: List[Dict[str, str]], country: Optional[str] = None) -> pd.DataFrame:
    """
    Aggregate prices from multiple sources and save to database.
    Priority: WHO > NHS > GoodRx
    Returns a DataFrame with all aggregated prices.
    """
    conn = init_database()
    all_results = []
    
    try:
        # 1. Try WHO GPRM first (highest priority)
        logger.info("Fetching WHO GPRM data...")
        who_df = fetch_who_prices(country)
        if not who_df.empty:
            saved_count = save_to_database(conn, who_df)
            logger.info(f"Saved {saved_count} WHO GPRM records to database")
            all_results.append(who_df)
        
        # 2. Try NHS SCMD (only for UK or if no country specified)
        if not country or country.lower() in ['uk', 'united kingdom', 'great britain']:
            logger.info("Fetching NHS SCMD data...")
            nhs_df = fetch_nhs_prices()
            if not nhs_df.empty:
                saved_count = save_to_database(conn, nhs_df)
                logger.info(f"Saved {saved_count} NHS SCMD records to database")
                all_results.append(nhs_df)
        
        # 3. Fall back to GoodRx for specific drugs not found in other sources
        drug_names = [drug["INN"] for drug in drug_list]
        logger.info("Fetching GoodRx data for specific drugs...")
        goodrx_df = fetch_goodrx_prices(drug_names)
        if not goodrx_df.empty:
            saved_count = save_to_database(conn, goodrx_df)
            logger.info(f"Saved {saved_count} GoodRx records to database")
            all_results.append(goodrx_df)
        
        # Combine all results
        final_df = pd.concat(all_results, ignore_index=True) if all_results else pd.DataFrame()
        
        # Remove duplicates, keeping the highest priority source
        if not final_df.empty:
            # Define priority order
            source_priority = {'WHO GPRM': 1, 'NHS SCMD': 2, 'GoodRx': 3}
            final_df['priority'] = final_df['Source'].map(source_priority)
            final_df = final_df.sort_values(['INN', 'priority']).drop_duplicates(subset=['INN'], keep='first')
            final_df = final_df.drop('priority', axis=1)
        
        return final_df
        
    except Exception as e:
        logger.error(f"Error in aggregate_prices: {e}")
        return pd.DataFrame()
    finally:
        conn.close()

# =====================
# Example Usage
# =====================
def fetch_who_prices_bulk(countries: Optional[List[str]] = None) -> pd.DataFrame:
    """
    批量获取 WHO GPRM 数据，可以指定多个国家。
    如果 countries=None，则默认取全量。
    """
    if not countries:
        return fetch_who_prices()  # 默认全量

    all_dfs = []
    for country in countries:
        df = fetch_who_prices(country)
        if not df.empty:
            all_dfs.append(df)

    if all_dfs:
        return pd.concat(all_dfs, ignore_index=True)
    else:
        return pd.DataFrame()


def aggregate_prices_full_scale(
    countries: Optional[List[str]] = None,
    test_mode: bool = False,
    batch_size: int = 500,
    use_goodrx: bool = False
) -> pd.DataFrame:
    """
    Full-scale aggregation for ChEMBL_35 dataset with resume and DuckDB-backed matching.
    Priority: NHS (WHO skipped) > GoodRx (optional)
    Returns a DataFrame with all aggregated results.
    """
    logger.info("Starting full-scale drug price aggregation for ChEMBL_35")
    # 1) Load INN list
    inn_df = extract_inn_list_from_chembl()
    if inn_df.empty:
        logger.error("No INNs found in ChEMBL_35")
        return pd.DataFrame()
    if test_mode:
        inn_df = inn_df.head(100)
        logger.info(f"Test mode: limiting to {len(inn_df)} INNs")
    inn_list = inn_df.to_dict('records')
    total_inns = len(inn_list)

    conn = init_database()
    try:
        # 2) Resume info: skip already processed INNs
        processed = get_already_processed_inns(conn)
        if processed:
            logger.info(f"Already processed INNs: {len(processed)}")
        remaining = [r for r in inn_list if r['INN'].lower() not in processed]
        logger.info(f"Remaining INNs to process: {len(remaining)} / {total_inns}")

        # 3) WHO skipped in full-scale
        logger.warning("Skipping WHO GPRM in full-scale run (endpoint unstable).")

        # 4) Ensure NHS is loaded into DuckDB once
        ensure_nhs_loaded_into_duckdb(conn)

        if not remaining:
            logger.info("Nothing to process; exiting.")
            return pd.DataFrame()

        # 5) Batch processing
        batches = [remaining[i:i+batch_size] for i in range(0, len(remaining), batch_size)]
        all_saved = 0
        all_results = []   # 👈 用来收集所有匹配结果

        for bi, batch in enumerate(batches, start=1):
            start_idx = (bi-1)*batch_size + 1
            end_idx = start_idx + len(batch) - 1
            logger.info(f"Batch {bi}/{len(batches)} (INNs {start_idx}-{end_idx})")

            # NHS matching in DuckDB
            nhs_matched_df = match_inns_to_nhs_duckdb(conn, batch)
            saved = 0
            if not nhs_matched_df.empty:
                saved += save_to_database(conn, nhs_matched_df)
                all_results.append(nhs_matched_df)

            # Optional GoodRx fallback
            if use_goodrx:
                matched_set = set(nhs_matched_df['INN'].str.lower().tolist()) if not nhs_matched_df.empty else set()
                missing_for_goodrx = [r for r in batch if r['INN'].lower() not in matched_set]
                if missing_for_goodrx:
                    grx_df = fetch_goodrx_prices_batch(missing_for_goodrx)
                    if not grx_df.empty:
                        saved += save_to_database(conn, grx_df)
                        all_results.append(grx_df)

            all_saved += saved
            logger.info(f"Batch {bi} saved {saved} new records (cumulative {all_saved}).")

        logger.info(f"All batches complete. Total new records saved: {all_saved}")

        # 👇 返回实际结果
        if all_results:
            final_df = pd.concat(all_results, ignore_index=True)
            return final_df
        else:
            return pd.DataFrame()

    finally:
        conn.close()


def match_inns_to_nhs(inn_list: List[Dict[str, str]], nhs_df: pd.DataFrame) -> pd.DataFrame:
    """Match INNs to NHS data using exact and fuzzy matching."""
    if nhs_df.empty:
        return pd.DataFrame()
    
    matched_results = []
    
    for inn_record in inn_list:
        chembl_id = inn_record['chembl_id']
        inn = inn_record['INN'].lower()
        
        # Try exact match first
        exact_matches = nhs_df[nhs_df['INN'].str.lower() == inn]
        
        if not exact_matches.empty:
            # Keep lowest price for exact matches
            best_match = exact_matches.loc[exact_matches['Price'].idxmin()].copy()
            best_match['chembl_id'] = chembl_id
            matched_results.append(best_match)
            continue
        
        # Try fuzzy/substring match
        fuzzy_matches = nhs_df[nhs_df['MatchedName'].str.lower().str.contains(inn, na=False, regex=False)]
        
        if not fuzzy_matches.empty:
            # Find best similarity match
            similarities = []
            for _, row in fuzzy_matches.iterrows():
                similarity = SequenceMatcher(None, inn, row['MatchedName'].lower()).ratio()
                similarities.append((similarity, row))
            
            # Keep matches above threshold
            good_matches = [(sim, row) for sim, row in similarities if sim >= CONFIG['MIN_SIMILARITY_SCORE']]
            
            if good_matches:
                # Sort by similarity, then by price
                good_matches.sort(key=lambda x: (-x[0], x[1]['Price']))
                best_match = good_matches[0][1].copy()
                best_match['chembl_id'] = chembl_id
                matched_results.append(best_match)
    
    if matched_results:
        result_df = pd.DataFrame(matched_results)
        logger.info(f"Matched {len(result_df)} INNs to NHS data")
        return result_df
    
    return pd.DataFrame()

def fetch_goodrx_prices_batch(inn_list: List[Dict[str, str]]) -> pd.DataFrame:
    """Fetch GoodRx prices in batch with basic caching."""
    results = []
    
    for inn_record in inn_list[:50]:  # Limit for demo
        inn = inn_record['INN']
        chembl_id = inn_record['chembl_id']
        
        # Add delay to avoid rate limiting
        time.sleep(REQUEST_DELAY + random.uniform(0, 2))
        
        price = fetch_goodrx_price_single(inn)
        
        if price is not None:
            record = {col: None for col in UNIFIED_SCHEMA}
            record.update({
                'chembl_id': chembl_id,
                'INN': inn,
                'MatchedName': inn,
                'Price': price,
                'Currency': 'USD',
                'Source': 'GoodRx',
                'Country': 'United States',
                'Year': datetime.now().year,
                'Unit': 'USD',
                'URL': f"https://www.goodrx.com/{urllib.parse.quote(inn.lower().replace(' ', '-'))}"
            })
            results.append(record)
    
    return pd.DataFrame(results)

def fetch_goodrx_price_single(inn: str) -> Optional[float]:
    """Fetch single GoodRx price."""
    url = f"https://www.goodrx.com/{urllib.parse.quote(inn.lower().replace(' ', '-'))}"
    
    try:
        response = make_request(url)
        if not response:
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Multiple selectors to try
        price_selectors = [
            'span.drug-price-banner__price',
            'span[data-testid="drug-amount"]',
            '.price-display',
            '.lowest-price'
        ]
        
        for selector in price_selectors:
            price_element = soup.select_one(selector)
            if price_element:
                price_text = price_element.get_text(strip=True)
                price_match = re.search(r'[\d.]+', price_text.replace(',', ''))
                if price_match:
                    return float(price_match.group())
                    
    except Exception as e:
        logger.error(f"Error fetching GoodRx price for {inn}: {e}")
    
    return None

if __name__ == "__main__":
    import sys
    
    # Check if test mode is requested
    test_mode = "--test" in sys.argv
    
    if test_mode:
        print("Running in TEST MODE (limited to 100 INNs)")
    else:
        print("Running in FULL MODE (all ChEMBL_35 INNs)")
        print("Add --test flag for testing with limited dataset")
    
    print("Starting full-scale drug price aggregation...")
    
    # Run full-scale aggregation
    df = aggregate_prices_full_scale(test_mode=test_mode)
    
    if not df.empty:
        print(f"\nAggregation Results: {len(df)} total records")
        print(df[['INN', 'Price', 'Currency', 'Source', 'Country']].head(10))
        
        # Save to CSV
        output_file = "drug_prices_chembl35_full.csv"
        df.to_csv(output_file, index=False)
        print(f"\nResults saved to {output_file}")
        
        # Show statistics
        print(f"\nSource breakdown:")
        print(df['Source'].value_counts())
        print(f"\nCountry breakdown:")
        print(df['Country'].value_counts().head(10))
        
        # Example queries
        print("\n" + "="*50)
        print("QUERY EXAMPLES:")
        print("="*50)
        
        # Query lowest price for specific drugs
        for drug in ["paracetamol", "ibuprofen", "metformin"]:
            print(f"\nLowest price for {drug}:")
            result = query_min_price(drug)
            if result:
                print(f"  Price: {result['Price']} {result['Currency']}")
                print(f"  Source: {result['Source']}")
                print(f"  Country: {result['Country']}")
                print(f"  Matched Name: {result['MatchedName']}")
            else:
                print(f"  No price found for {drug}")
        
        # Query with country filter
        print(f"\nLowest price for paracetamol in United Kingdom:")
        result = query_min_price("paracetamol", country="United Kingdom")
        if result:
            print(f"  Price: {result['Price']} {result['Currency']}")
            print(f"  Source: {result['Source']}")
            print(f"  Matched Name: {result['MatchedName']}")
        else:
            print(f"  No price found for paracetamol in United Kingdom")
            
    else:
        print("No results found.")