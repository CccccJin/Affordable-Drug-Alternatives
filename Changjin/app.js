// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize RDKit
    window.rdkitModule = await window.RDKitModule();
    
    // DOM Elements
    const searchType = document.getElementById('searchType');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const toggleEditor = document.getElementById('toggleEditor');
    const ketcherContainer = document.getElementById('ketcher-container');
    const useDrawnMolecule = document.getElementById('useDrawnMolecule');
    const clearStructure = document.getElementById('clearStructure');
    const applyFilters = document.getElementById('applyFilters');
    const resetFilters = document.getElementById('resetFilters');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultCount = document.getElementById('resultCount');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const compoundModal = new bootstrap.Modal(document.getElementById('compoundModal'));
    const compoundDetails = document.getElementById('compoundDetails');

    // Mock data for demonstration
    const mockCompounds = [
        {
            id: 1,
            name: 'Aspirin',
            iupacName: '2-acetoxybenzoic acid',
            smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O',
            molecularWeight: 180.16,
            logP: 1.19,
            hBondDonors: 1,
            hBondAcceptors: 4,
            smilesCanonical: 'CC(=O)OC1=CC=CC=C1C(=O)O',
            formula: 'C9H8O4',
            synonyms: ['Acetylsalicylic acid', 'ASA', 'Aspirin']
        },
        {
            id: 2,
            name: 'Ibuprofen',
            iupacName: '2-[4-(2-methylpropyl)phenyl]propanoic acid',
            smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O',
            molecularWeight: 206.29,
            logP: 3.97,
            hBondDonors: 1,
            hBondAcceptors: 2,
            smilesCanonical: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O',
            formula: 'C13H18O2',
            synonyms: ['Brufen', 'Advil', 'Nurofen']
        },
        {
            id: 3,
            name: 'Paracetamol',
            iupacName: 'N-(4-hydroxyphenyl)acetamide',
            smiles: 'CC(=O)NC1=CC=C(C=C1)O',
            molecularWeight: 151.16,
            logP: 0.46,
            hBondDonors: 2,
            hBondAcceptors: 2,
            smilesCanonical: 'CC(=O)NC1=CC=C(C=C1)O',
            formula: 'C8H9NO2',
            synonyms: ['Acetaminophen', 'Tylenol', 'Panadol']
        }
    ];

    // Current filters
    let currentFilters = {
        molWeightMin: null,
        molWeightMax: null,
        logpMin: null,
        logpMax: null,
        hBondDonors: null,
        hBondAcceptors: null
    };

    // Toggle Ketcher editor
    toggleEditor.addEventListener('click', () => {
        ketcherContainer.classList.toggle('d-none');
        if (!ketcherContainer.classList.contains('d-none')) {
            initKetcher();
        }
    });

    // Use drawn molecule
    useDrawnMolecule.addEventListener('click', () => {
        // In a real app, this would get the SMILES from Ketcher
        alert('In a real implementation, this would get the SMILES from the Ketcher editor');
        // For demo purposes, we'll use a sample SMILES
        searchInput.value = 'CC(=O)OC1=CC=CC=C1C(=O)O';
        ketcherContainer.classList.add('d-none');
    });

    // Clear structure
    clearStructure.addEventListener('click', () => {
        // In a real app, this would clear the Ketcher canvas
        console.log('Clearing structure');
    });

    // Apply filters
    applyFilters.addEventListener('click', () => {
        currentFilters = {
            molWeightMin: document.getElementById('molWeightMin').value || null,
            molWeightMax: document.getElementById('molWeightMax').value || null,
            logpMin: document.getElementById('logpMin').value || null,
            logpMax: document.getElementById('logpMax').value || null,
            hBondDonors: document.getElementById('hBondDonors').value || null,
            hBondAcceptors: document.getElementById('hBondAcceptors').value || null
        };
        
        searchCompounds();
    });

    // Reset filters
    resetFilters.addEventListener('click', () => {
        document.getElementById('molWeightMin').value = '';
        document.getElementById('molWeightMax').value = '';
        document.getElementById('logpMin').value = '';
        document.getElementById('logpMax').value = '';
        document.getElementById('hBondDonors').value = '';
        document.getElementById('hBondAcceptors').value = '';
        
        currentFilters = {
            molWeightMin: null,
            molWeightMax: null,
            logpMin: null,
            logpMax: null,
            hBondDonors: null,
            hBondAcceptors: null
        };
        
        searchCompounds();
    });

    // Search when button is clicked
    searchButton.addEventListener('click', searchCompounds);

    // Also search when Enter is pressed in the search input
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchCompounds();
        }
    });

    // Toggle search input placeholder based on search type
    searchType.addEventListener('change', () => {
        searchInput.placeholder = searchType.value === 'smiles' 
            ? 'Enter SMILES string (e.g., C1=CC=CC=C1)' 
            : 'Enter compound name (e.g., Aspirin)';
    });

    // Main search function
    function searchCompounds() {
        const query = searchInput.value.trim();
        
        if (!query) {
            alert('Please enter a search term');
            return;
        }
        
        showLoading(true);
        
        // In a real app, this would be an API call to your backend
        // For now, we'll simulate a delay and use mock data
        setTimeout(() => {
            let results = [...mockCompounds];
            
            // Apply filters
            results = results.filter(compound => {
                if (currentFilters.molWeightMin && compound.molecularWeight < parseFloat(currentFilters.molWeightMin)) return false;
                if (currentFilters.molWeightMax && compound.molecularWeight > parseFloat(currentFilters.molWeightMax)) return false;
                if (currentFilters.logpMin && compound.logP < parseFloat(currentFilters.logpMin)) return false;
                if (currentFilters.logpMax && compound.logP > parseFloat(currentFilters.logpMax)) return false;
                if (currentFilters.hBondDonors && compound.hBondDonors > parseInt(currentFilters.hBondDonors)) return false;
                if (currentFilters.hBondAcceptors && compound.hBondAcceptors > parseInt(currentFilters.hBondAcceptors)) return false;
                
                // Simple search in name, IUPAC name, or synonyms
                if (searchType.value === 'name') {
                    const searchLower = query.toLowerCase();
                    return compound.name.toLowerCase().includes(searchLower) ||
                           compound.iupacName.toLowerCase().includes(searchLower) ||
                           compound.synonyms.some(s => s.toLowerCase().includes(searchLower));
                }
                
                return true;
            });
            
            displayResults(results);
            showLoading(false);
        }, 800);
    }

    // Display search results
    function displayResults(compounds) {
        resultsContainer.innerHTML = '';
        
        if (compounds.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-muted text-center py-5">
                    <i class="bi bi-exclamation-circle" style="font-size: 3rem;"></i>
                    <p class="mt-3">No compounds found matching your criteria</p>
                </div>
            `;
            resultCount.textContent = '0 compounds found';
            return;
        }
        
        resultCount.textContent = `${compounds.length} compound${compounds.length !== 1 ? 's' : ''} found`;
        
        // Sort by molecular weight for demonstration
        compounds.sort((a, b) => a.molecularWeight - b.molecularWeight);
        
        const row = document.createElement('div');
        row.className = 'row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4';
        
        compounds.forEach(compound => {
            const col = document.createElement('div');
            col.className = 'col';
            
            // Generate SVG for the structure
            const mol = window.rdkitModule.get_mol(compound.smilesCanonical || compound.smiles);
            const svg = mol.get_svg(250, 200);
            mol.delete();
            
            col.innerHTML = `
                <div class="card compound-card" data-id="${compound.id}">
                    <div class="card-body">
                        <h5 class="card-title">${compound.name}</h5>
                        <h6 class="card-subtitle mb-3 text-muted">${compound.formula}</h6>
                        <div class="structure-container mb-3">
                            ${svg}
                        </div>
                        <div class="compound-properties">
                            <div class="property">
                                <span class="property-name">MW:</span> 
                                <span>${compound.molecularWeight.toFixed(2)} g/mol</span>
                            </div>
                            <div class="property">
                                <span class="property-name">LogP:</span> 
                                <span>${compound.logP}</span>
                            </div>
                            <div class="property">
                                <span class="property-name">HBD/HBA:</span> 
                                <span>${compound.hBondDonors}/${compound.hBondAcceptors}</span>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-transparent border-top-0">
                        <button class="btn btn-sm btn-outline-primary view-details" data-id="${compound.id}">
                            View Details
                        </button>
                    </div>
                </div>
            `;
            
            row.appendChild(col);
        });
        
        resultsContainer.appendChild(row);
        
        // Add event listeners to the view details buttons
        document.querySelectorAll('.view-details').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const compoundId = parseInt(button.getAttribute('data-id'));
                showCompoundDetails(compoundId);
            });
        });
        
        // Make the whole card clickable
        document.querySelectorAll('.compound-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't trigger if a button was clicked
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                    return;
                }
                const compoundId = parseInt(card.getAttribute('data-id'));
                showCompoundDetails(compoundId);
            });
        });
    }

    // Show compound details in modal
    function showCompoundDetails(compoundId) {
        const compound = mockCompounds.find(c => c.id === compoundId);
        if (!compound) return;
        
        // Generate SVG for the structure
        const mol = window.rdkitModule.get_mol(compound.smilesCanonical || compound.smiles);
        const svg = mol.get_svg(400, 300);
        mol.delete();
        
        document.getElementById('compoundModalLabel').textContent = compound.name;
        
        compoundDetails.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <div class="structure-container">
                        ${svg}
                    </div>
                </div>
                <div class="col-md-6">
                    <h6>IUPAC Name</h6>
                    <p>${compound.iupacName}</p>
                    
                    <h6 class="mt-4">Properties</h6>
                    <div class="d-flex flex-wrap">
                        <span class="badge bg-primary property-badge">MW: ${compound.molecularWeight.toFixed(2)}</span>
                        <span class="badge bg-success property-badge">LogP: ${compound.logP}</span>
                        <span class="badge bg-info text-dark property-badge">HBD: ${compound.hBondDonors}</span>
                        <span class="badge bg-warning text-dark property-badge">HBA: ${compound.hBondAcceptors}</span>
                        <span class="badge bg-secondary property-badge">${compound.formula}</span>
                    </div>
                    
                    <h6 class="mt-4">SMILES</h6>
                    <div class="p-2 bg-light rounded">
                        <code>${compound.smiles}</code>
                    </div>
                    
                    <h6 class="mt-4">Synonyms</h6>
                    <div class="d-flex flex-wrap">
                        ${compound.synonyms.map(syn => 
                            `<span class="badge bg-light text-dark property-badge">${syn}</span>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `;
        
        compoundModal.show();
    }

    // Show/hide loading indicator
    function showLoading(show) {
        loadingIndicator.classList.toggle('d-none', !show);
    }

    // Initialize Ketcher (placeholder for actual implementation)
    function initKetcher() {
        console.log('Initializing Ketcher...');
        // In a real implementation, this would initialize the Ketcher editor
        // For example:
        // window.ketcher = Ketcher.init('#ketcher');
    }

    // Initialize the page
    function init() {
        // Set initial placeholder
        searchInput.placeholder = 'Enter SMILES string (e.g., C1=CC=CC=C1)';
        
        // Show welcome message
        console.log('Chemical Compound Search initialized');
    }

    // Start the application
    init();
});
