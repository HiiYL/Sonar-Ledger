import { useState, useCallback, useEffect } from 'react';
import {
  initLLM,
  isLLMReady,
  getLLMStatus,
  categorizeWithLLM,
  batchCategorizeWithLLM,
  unloadLLM,
  type Category,
} from '../lib/ml';

interface LLMState {
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
  progress: number;
  progressText: string;
}

interface UseLLMReturn extends LLMState {
  initialize: () => Promise<boolean>;
  categorize: (description: string, vendor?: string) => Promise<Category | null>;
  batchCategorize: (transactions: Array<{ description: string; vendor?: string }>) => Promise<Array<Category | null>>;
  unload: () => Promise<void>;
}

/**
 * React hook for using the LLM categorizer
 */
export function useLLM(autoInit = false): UseLLMReturn {
  const [state, setState] = useState<LLMState>({
    isLoading: false,
    isReady: isLLMReady(),
    error: null,
    progress: 0,
    progressText: '',
  });

  // Sync with global LLM status
  useEffect(() => {
    const status = getLLMStatus();
    setState(prev => ({
      ...prev,
      isLoading: status.loading,
      isReady: status.ready,
      error: status.error,
    }));
  }, []);

  const initialize = useCallback(async () => {
    if (isLLMReady()) return true;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    const success = await initLLM((progress) => {
      setState(prev => ({
        ...prev,
        progress: progress.progress,
        progressText: progress.text,
      }));
    });
    
    setState(prev => ({
      ...prev,
      isLoading: false,
      isReady: success,
      error: success ? null : new Error('Failed to load LLM'),
      progress: success ? 1 : prev.progress,
    }));
    
    return success;
  }, []);

  const categorize = useCallback(async (description: string, vendor?: string) => {
    return categorizeWithLLM(description, vendor);
  }, []);

  const batchCategorize = useCallback(async (
    transactions: Array<{ description: string; vendor?: string }>
  ) => {
    return batchCategorizeWithLLM(transactions);
  }, []);

  const unload = useCallback(async () => {
    await unloadLLM();
    setState(prev => ({
      ...prev,
      isReady: false,
      progress: 0,
      progressText: '',
    }));
  }, []);

  // Auto-initialize if requested
  useEffect(() => {
    if (autoInit && !isLLMReady() && !state.isLoading) {
      initialize();
    }
  }, [autoInit, initialize, state.isLoading]);

  return {
    ...state,
    initialize,
    categorize,
    batchCategorize,
    unload,
  };
}
