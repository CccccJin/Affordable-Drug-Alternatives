# prj.internship_202507

# Summary: Technical Requirements for Internship Project

## Title: Chemical Similarity Search Web App  
**Stack**: DuckDB + Flask or FastAPI + ChEMBL

---

## 1. Project Goal  
Build a web application that allows users to enter a chemical compound (SMILES string, molecule name, or drug tradename), then find and rank similar compounds using structural similarity and property filters, leveraging ChEMBL data.

---

## 2. Frontend Requirements  

### Input Options  
- SMILES string input  
- Common name or tradename lookup (resolves to structure using backend)  

### Property Filters  
- Options for molecular weight, logP, H-bond donors, etc.  

### Results Display  
- Ranked list of similar compounds  
- Display of compound names, structures (image or SVG), and properties  

### Technology  
- Use a modern framework (React, Vue, or plain HTML plus JavaScript)  
- Responsive layout for desktop and mobile  
- Use of a chemical editor like Ketcher or ChemDoodle (optional)  

---

## 3. Backend Requirements  

### Framework  
- Flask or FastAPI (interns may use either based on skill level)  

### Chemical Input Handling  
- Convert names/tradenames to SMILES using ChEMBL lookup  
- Validate and parse SMILES  

### Similarity Computation  
- Use RDKit to generate fingerprints  
- Compute Tanimoto similarity  

### Property Filtering  
- Apply user-defined constraints using DuckDB SQL filters  

### Database  
Use DuckDB to store preprocessed ChEMBL compound data including:  
- ChEMBL ID  
- Canonical SMILES  
- Computed molecular descriptors (MW, logP, etc.)  
- Synonyms and tradenames  

### Endpoints  
- `/search` → returns similar compounds based on input and filters  
- `/resolve_name` → resolves names to SMILES  
- `/properties` → returns supported filter options  

---

## 4. Database Requirements (DuckDB)  
- Store a preprocessed snapshot of ChEMBL compound records  
- Create indexes or materialized views for fast similarity queries  
- Use a compact schema:
  - `compound_id`, `smiles`, `name`, `tradenames`, `mol_weight`, `logp`, `num_h_donors`, `fingerprint`  

---

## 5. Additional Components  

### Data Preprocessing Script  
- Extract and clean ChEMBL data  
- Calculate molecular fingerprints and descriptors using RDKit  
- Populate DuckDB database  

### Testing and Validation  
- Unit tests for input handling and similarity logic  
- Integration tests for API routes  

### Documentation  
- Setup and deployment instructions  
- API specification  
- Intern onboarding guide  

---

## 6. Optional Features (Stretch Goals)  
- Visual similarity map (e.g. UMAP or t-SNE)  
- Save user sessions or search history  
- Export results as CSV or PDF  
