import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MockSearchApi } from '../services/api/mockSearchApi';
import type {
  SearchRequest,
  SearchResponse,
  ResolveRequest,
  ResolveResponse,
  PropertyCalculationRequest,
  CalculatedProperties,
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
      return await MockSearchApi.search(request);
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
    mutationFn: async (request: SearchRequest) => {
      return await MockSearchApi.searchAI(request);
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
      return await MockSearchApi.resolveName(request);
    },
  });
};

// Property calculation hook
export const useCalculateProperties = () => {
  return useMutation<CalculatedProperties, Error, PropertyCalculationRequest>({
    mutationFn: async (request: PropertyCalculationRequest) => {
      return await MockSearchApi.calculateProperties(request);
    },
  });
};

// Filterable properties hook
export const useFilterableProperties = () => {
  return useQuery<string[]>({
    queryKey: queryKeys.properties,
    queryFn: async () => {
      return await MockSearchApi.getFilterableProperties();
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });
};

// Molecule visualization hook
export const useVisualizeMolecule = () => {
  return useMutation<string, Error, string>({
    mutationFn: async (smiles: string) => {
      return await MockSearchApi.visualizeMolecule(smiles);
    },
  });
};

// Health check hook
export const useHealthCheck = () => {
  return useQuery<{ status: string }>({
    queryKey: queryKeys.health,
    queryFn: async () => {
      return await MockSearchApi.healthCheck();
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

  const searchBySMILES = async (smiles: string, useAI: boolean = false) => {
    const searchRequest: SearchRequest = {
      smiles,
      threshold: 0.7,
      max_results: 50,
      enable_post_processing: true,
    };

    if (useAI) {
      return await aiSearch.mutateAsync(searchRequest);
    } else {
      return await regularSearch.mutateAsync(searchRequest);
    }
  };

  const searchByName = async (name: string, useAI: boolean = false) => {
    try {
      const resolveResult = await resolveName.mutateAsync({ name });

      if (!resolveResult.smiles) {
        throw new Error('Could not resolve chemical name to SMILES');
      }

      return await searchBySMILES(resolveResult.smiles, useAI);
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
