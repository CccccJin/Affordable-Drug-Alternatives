import axios from 'axios'
import type {
  SearchRequest,
  SearchResponse,
  ResolveRequest,
  ResolveResponse,
  PropertyCalculationRequest,
  CalculatedProperties,
} from '../../types/api'

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
})

function formatAxiosError(err: unknown): Error {
  // Provide clearer error messages to the UI, including backend detail if available
  const anyErr = err as any
  const detail = anyErr?.response?.data || anyErr?.message || 'Request failed'
  const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return new Error(message)
}

export class SearchApi {
  static async search(request: SearchRequest): Promise<SearchResponse> {
    try {
      const { data } = await api.post('/search', request)
      return data
    } catch (e) {
      throw formatAxiosError(e)
    }
  }

  static async searchAI(request: SearchRequest): Promise<SearchResponse> {
    try {
      const { data } = await api.post('/search_ai', request)
      return data
    } catch (e) {
      throw formatAxiosError(e)
    }
  }

  static async resolveName(request: ResolveRequest): Promise<ResolveResponse> {
    try {
      const { data } = await api.post('/resolve_name', request)
      return data
    } catch (e) {
      throw formatAxiosError(e)
    }
  }

  static async calculateProperties(request: PropertyCalculationRequest): Promise<CalculatedProperties> {
    try {
      const { data } = await api.post('/properties/calculate', request)
      return data
    } catch (e) {
      throw formatAxiosError(e)
    }
  }

  static async getFilterableProperties(): Promise<string[]> {
    try {
      const { data } = await api.get('/properties')
      return data
    } catch (e) {
      throw formatAxiosError(e)
    }
  }

  static async visualizeMolecule(smiles: string): Promise<string> {
    try {
      const { data } = await api.get('/visualize', {
        params: { smiles },
        responseType: 'text',
      })
      return data
    } catch (e) {
      throw formatAxiosError(e)
    }
  }

  static async healthCheck(): Promise<{ status: string }> {
    try {
      const { data } = await api.get('/health')
      return data
    } catch (e) {
      throw formatAxiosError(e)
    }
  }
}
