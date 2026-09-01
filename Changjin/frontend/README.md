# 🧪 Chemical Similarity Search Platform

**A modern, enterprise-grade web application for chemical compound similarity searching and analysis.**

![React](https://img.shields.io/badge/React-19.1.1-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)
![Material-UI](https://img.shields.io/badge/Material--UI-7.3.2-blue.svg)
![RDKit](https://img.shields.io/badge/RDKit-2025.3.4-green.svg)
![Build Status](https://img.shields.io/badge/Build-Success-brightgreen.svg)
![ESLint](https://img.shields.io/badge/ESLint-0%20errors-brightgreen.svg)

---

## 🚀 **Project Overview**

This is a **modern, functional chemical similarity search application** built with React 19, TypeScript, and Material-UI. The application provides essential tools for:

- **🔍 Molecular Similarity Search** - SMILES-based and name-based compound searching with history
- **🎛️ Advanced Property Filtering** - Visual range sliders for molecular properties
- **📱 Responsive Design** - Mobile-optimized interface that works on all devices
- **💾 Search History** - Persistent search history with one-click rerun functionality

**Note**: Advanced analytics, clustering, and multi-format export features are planned for future releases.

---

## ✨ **Key Features**

### **🔍 Core Features (Fully Implemented)**
- **SMILES & Name Search** - Direct molecular structure and compound name searching
- **Advanced Property Filters** - Visual range sliders with individual clear controls
- **Search History** - Persistent history with one-click search rerun functionality
- **Molecular Visualization** - Professional RDKit-powered structure rendering
- **Responsive Design** - Mobile-optimized interface that works on all devices

### **📊 Coming Soon**
- **Analytics Dashboard** - Interactive charts and data visualization
- **Clustering Analysis** - Compound clustering and similarity analysis
- **Settings & Help** - User preferences and documentation pages
- **Advanced Export Options** - Multiple format export integration

---

## 🛠 **Technology Stack**

### **Frontend Framework**
- **React 19** - Latest React with concurrent features and automatic batching
- **TypeScript 5.8** - Complete type safety and enhanced developer experience
- **Vite** - Lightning-fast build tool with HMR and optimized production builds

### **State Management & Data**
- **Redux Toolkit** - Modern Redux with simplified patterns and excellent TypeScript support
- **React Query** - Powerful data fetching, caching, and synchronization
- **In-browser search** - Real ECFP4 fingerprints scored against a packed binary corpus, no server

### **UI & Visualization**
- **Material-UI v7** - Modern component library with custom chemical science theming
- **RDKit WebAssembly** - Industry-standard molecular structure rendering

### **Development & Quality**
- **ESLint + Prettier** - Zero-error code quality with automated formatting
- **TypeScript** - Complete type safety throughout the application
- **Production Build** - Optimized bundle with CDN loading strategies

---

## 📋 **Installation & Setup**

### **Prerequisites**
```bash
Node.js 18+ and npm (or yarn/pnpm)
```

### **Quick Start**
```bash
# 1. Navigate to project directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Build for production
npm run build

# 5. Preview production build
npm run preview
```

### **Available Scripts**
```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # Run ESLint (0 errors guaranteed)
npm run test       # Run Jest tests
```

---

## 🎯 **Usage Guide**

### **Basic Search**
1. **Enter SMILES string** or **compound name** in the search bar
2. **Select search type** (SMILES or Name)
3. **Enable AI search** for enhanced results (optional)
4. **View results** with similarity scores and compound details

### **Advanced Filtering**
1. **Click "Property Filters"** to expand filtering options
2. **Use range sliders** to filter by molecular weight, LogP, etc.
3. **Combine multiple filters** for precise compound selection
4. **Clear individual filters** using the × buttons or "Clear All"

### **Search History**
1. **Click "History"** in the header to view recent searches
2. **Click any search** to rerun it with fresh results
3. **Copy queries** using the copy icon for reuse
4. **Clear history** using the "Clear History" button

---

## 🏗 **Architecture Overview**

### **Component Structure**
```
src/
├── components/
│   ├── layout/           # Header, MainLayout
│   ├── search/           # SearchForm (main search interface)
│   ├── results/          # SearchResults, CompoundCard
│   ├── filters/          # AdvancedPropertyFilters
│   ├── history/          # Search history with rerun functionality
│   ├── export/           # ExportDialog for data export
│   ├── charts/           # AnalyticsDashboard, ClusteringVisualization
│   └── molecules/        # MoleculeViewer with RDKit
├── hooks/
│   ├── useSearch.ts      # Complete search state management
│   └── useRDKit.ts       # RDKit loading and molecule processing
├── services/
│   ├── api/              # Static data loaders (search, FDA substitutability)
│   ├── rdkit/            # RDKit service with CDN loading
│   └── export/           # Data export utilities
├── store/
│   ├── slices/           # Search, results, UI state management
│   └── store.ts          # Redux store configuration
├── types/
│   └── api.ts            # Complete TypeScript definitions
└── styles/
    └── theme.ts          # Custom Material-UI theme
```

### **State Management**
- **Redux Toolkit** for global application state
- **React Query** for server state and caching
- **Custom hooks** for component-specific logic

### **How Search Works**
- **No backend.** `staticSearchApi.ts` computes an ECFP4 fingerprint for the
  query in the browser (RDKit WASM) and scores it against `fingerprints.bin`,
  a packed corpus of 84,818 compounds. The fingerprints are byte-identical to
  the ones RDKit produces in Python — `verify_fingerprints.py` pins that.
- **`searchApi.ts`** is the unused HTTP client for the FastAPI service, kept
  for when that service is deployed. Its methods throw today.
- **Real-time search** with debouncing and error handling
- **Progressive loading** for large result sets
- **Intelligent caching** for improved performance

---

## 🔬 **RDKit Integration**

### **Molecular Visualization**
The application integrates **RDKit WebAssembly** for professional molecular structure visualization:

```typescript
// Automatic CDN loading with fallbacks
const rdkitService = {
  loadRDKit: () => Promise<RDKitInstance>,
  getMolecule: (smiles: string) => Promise<RDKitMolecule>,
  getSVG: (molecule, options?) => string,
  getProperties: (molecule) => MoleculeProperties
};
```

### **CDN Loading Strategy**
- **Multiple fallback URLs** for robust loading
- **Global availability check** before loading
- **Error handling** with graceful degradation
- **Automatic retry** for failed loads

---

## 📊 **Performance & Optimization**

### **Bundle Optimization**
- **560KB production bundle** (excellent for feature-rich scientific app)
- **Tree shaking** for unused code elimination
- **Code splitting** for optimal loading
- **CDN loading** for external dependencies

### **Performance Features**
- **Virtual scrolling** ready for large datasets
- **Debounced search** to prevent excessive API calls
- **Intelligent caching** for improved user experience
- **Progressive enhancement** for better perceived performance

---

## 🧪 **Development & Testing**

### **Code Quality**
- **100% TypeScript coverage** - Complete type safety
- **ESLint compliant** - Zero linting errors or warnings
- **Prettier formatted** - Consistent code style
- **Comprehensive error handling** - User-friendly error messages

### **Testing Framework**
- **Jest** configured for unit and integration tests
- **React Testing Library** for component testing
- **Mock API layer** for reliable testing
- **Error boundary testing** for robustness

---

## 🚀 **Production Deployment**

### **GitHub Pages Static Mode**
The frontend is configured to run on GitHub Pages without a local database,
local API, or `localhost` service.

- Static compound data is loaded from `public/data/compounds.json`
- The export file `public/data/compounds.csv` is included for inspection or download
- Vite uses relative asset paths so the app can run from a GitHub Pages project path
- React Router uses hash routing so page refreshes do not require server rewrites

Build the static site with:

```bash
npm run build
```

Deploy the generated `dist/` directory to GitHub Pages.

### **When a Backend Is Required**
GitHub Pages cannot run DuckDB, FastAPI, RDKit server-side similarity searches,
login, mutations, real-time updates, or long-running model inference. For full
dynamic ChEMBL search, use this deployment shape:

- Frontend: GitHub Pages
- Backend API: Render, Railway, or Vercel
- Database: Supabase, Neon, MongoDB Atlas, or another managed database
- Configuration: expose the API URL to the frontend with an environment variable

```bash
VITE_API_BASE_URL=https://your-api.com/api
```

---

## 📈 **Future Enhancements**

### **Phase 4+ Features** (Optional)
- **User Authentication** - Personal compound collections and search history
- **Real-time Collaboration** - Multi-user compound analysis sessions
- **Advanced ML Features** - Enhanced AI-powered search and predictions
- **PWA Capabilities** - Offline functionality and mobile app installation
- **API Rate Limiting** - Intelligent request batching and caching
- **Advanced Export** - PDF reports, publication-ready formats

---

## 🤝 **Contributing**

### **Development Guidelines**
1. **TypeScript First** - All new code must be properly typed
2. **ESLint Compliance** - No linting errors allowed
3. **Component Testing** - Test new components and features
4. **Documentation** - Update README and code comments
5. **Performance** - Monitor bundle size and loading performance

### **Code Style**
- **Prettier** for code formatting
- **ESLint** for code quality and consistency
- **Conventional commits** for commit messages
- **Semantic versioning** for releases

---

## 📄 **License**

This project is developed as part of a research internship and is available for educational and research purposes.

---

## 🎓 **Technical Achievement Summary**

### **What Makes This Special**
- **🏆 Solid Foundation** - Well-structured, maintainable React/TypeScript codebase
- **🔬 Scientific Integration** - Real molecular visualization with RDKit WebAssembly
- **⚡ Modern Architecture** - Latest React patterns with optimized performance
- **📱 Universal Access** - Web-based, works on any device with a browser
- **🔧 Developer Experience** - Excellent TypeScript setup and tooling

### **Current Capabilities**
This application **successfully delivers** core chemical informatics functionality:
- **Search & Discovery** - Find similar compounds by structure or name
- **Property Filtering** - Filter results by molecular properties
- **History Management** - Track and rerun previous searches
- **Structure Visualization** - Professional molecular rendering

**Future enhancements** will add analytics, clustering, and advanced export capabilities to match commercial chemical informatics platforms.

---

**🎯 Ready for production deployment and research use!**

*For questions, suggestions, or contributions, please refer to the development documentation or contact the development team.*
