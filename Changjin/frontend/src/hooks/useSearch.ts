import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  StaticSearchApi,
} from '../services/api/staticSearchApi';
import type {
  SearchRequest,
  SearchResponse,
  ResolveRequest,
  ResolveResponse,
  PropertyCalculationRequest,
  CalculatedProperties,
  PropertyFilters,
} from '../types/api';

// Query keys for React Query caching
export const queryKeys = {
  search: ['search'] as const,
  resolveName: ['resolveName'] as const,
  properties: ['properties'] as const,
  visualization: ['visualization'] as const,
  health: ['health'] as const,
} as const;

// Search hooks
export const useSearch = () => {
  const queryClient = useQueryClient();

  return useMutation<SearchResponse, Error, SearchRequest>({
    mutationFn: async (request: SearchRequest) => {
      return await StaticSearchApi.search(request);
    },
    onSuccess: (data) => {
      // Cache the search results
      queryClient.setQueryData([...queryKeys.search, 'results'], data);
    },
  });
};

export const useAISearch = () => {
  const queryClient = useQueryClient();

  return useMutation<SearchResponse, Error, SearchRequest>({
    // The request is ignored: ChemBERTa search needs the FastAPI backend, so
    // the static build rejects it rather than answering with a lookalike score.
    mutationFn: async () => {
      return await StaticSearchApi.searchAI();
    },
    onSuccess: (data) => {
      // Cache the AI search results
      queryClient.setQueryData([...queryKeys.search, 'ai-results'], data);
    },
  });
};

// Name resolution hook
export const useResolveName = () => {
  return useMutation<ResolveResponse, Error, ResolveRequest>({
    mutationFn: async (request: ResolveRequest) => {
      return await StaticSearchApi.resolveName(request);
    },
  });
};

// Property calculation hook
export const useCalculateProperties = () => {
  return useMutation<CalculatedProperties, Error, PropertyCalculationRequest>({
    mutationFn: async (request: PropertyCalculationRequest) => {
      return await StaticSearchApi.calculateProperties(request);
    },
  });
};

// Filterable properties hook
export const useFilterableProperties = () => {
  return useQuery<string[]>({
    queryKey: queryKeys.properties,
    queryFn: async () => {
      return await StaticSearchApi.getFilterableProperties();
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });
};

// Molecule visualization hook
export const useVisualizeMolecule = () => {
  return useMutation<string, Error, string>({
    mutationFn: async (smiles: string) => {
      return await StaticSearchApi.visualizeMolecule(smiles);
    },
  });
};

// Health check hook
export const useHealthCheck = () => {
  return useQuery<{ status: string }>({
    queryKey: queryKeys.health,
    queryFn: async () => {
      return await StaticSearchApi.healthCheck();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });
};

// Combined search hook that handles both regular and AI search
export const useCompoundSearch = () => {
  const regularSearch = useSearch();
  const aiSearch = useAISearch();
  const resolveName = useResolveName();

  const searchBySMILES = async (smiles: string, useAI: boolean = false, filters?: PropertyFilters) => {
    const searchRequest: SearchRequest = {
      smiles,
      threshold: DEFAULT_SIMILARITY_THRESHOLD,
      max_results: 50,
      enable_post_processing: true,
      filters,
    };

    if (useAI) {
      return await aiSearch.mutateAsync(searchRequest);
    } else {
      return await regularSearch.mutateAsync(searchRequest);
    }
  };

  const searchByName = async (name: string, useAI: boolean = false, filters?: PropertyFilters) => {
    try {
      const resolveResult = await resolveName.mutateAsync({ name });

      if (!resolveResult.smiles) {
        throw new Error('Could not resolve chemical name to SMILES');
      }

      return await searchBySMILES(resolveResult.smiles, useAI, filters);
    } catch (error) {
      throw new Error(`Name resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return {
    searchBySMILES,
    searchByName,
    regularSearch,
    aiSearch,
    resolveName,
    isLoading: regularSearch.isPending || aiSearch.isPending || resolveName.isPending,
    error: regularSearch.error || aiSearch.error || resolveName.error,
  };
};
