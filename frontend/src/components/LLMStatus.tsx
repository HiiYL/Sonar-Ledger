import { useState } from 'react';
import { Cpu, Download, Check, X, Loader2, Sparkles } from 'lucide-react';
import { useLLM } from '../hooks/useLLM';

interface LLMStatusProps {
  onCategorizeAll?: () => void;
  recategorizeProgress?: { current: number; total: number } | null;
}

export function LLMStatus({ onCategorizeAll, recategorizeProgress }: LLMStatusProps) {
  const { isLoading, isReady, error, progress, progressText, initialize, unload } = useLLM();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const isRecategorizing = recategorizeProgress !== null && recategorizeProgress !== undefined;

  const handleToggle = async () => {
    if (isReady) {
      await unload();
    } else if (!isLoading) {
      await initialize();
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isReady ? 'bg-green-100' : 'bg-gray-100'}`}>
            <Cpu className={`w-5 h-5 ${isReady ? 'text-green-600' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">AI Categorization</h3>
            <p className="text-xs text-gray-500">
              {isReady 
                ? 'SmolLM ready' 
                : isLoading 
                  ? 'Loading model...'
                  : 'Local LLM (WebGPU)'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isReady && onCategorizeAll && (
            <button
              onClick={onCategorizeAll}
              disabled={isRecategorizing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isRecategorizing 
                  ? 'bg-purple-200 text-purple-600 cursor-wait'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              }`}
            >
              {isRecategorizing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {recategorizeProgress?.current}/{recategorizeProgress?.total}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-categorize All
                </>
              )}
            </button>
          )}
          
          <button
            onClick={handleToggle}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isReady
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : isLoading
                  ? 'bg-blue-100 text-blue-700 cursor-wait'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {Math.round(progress * 100)}%
              </>
            ) : isReady ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Enabled
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Enable AI
              </>
            )}
          </button>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-gray-400 hover:text-gray-600"
          >
            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar when loading */}
      {isLoading && (
        <div className="mt-3">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">{progressText}</p>
        </div>
      )}

      {/* Error message */}
      {error && !isLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
          <X className="w-3.5 h-3.5" />
          {error.message}
        </div>
      )}

      {/* Expanded info */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-1">
          <p>
            <strong>Model:</strong> Qwen3-0.6B
          </p>
          <p>
            <strong>Size:</strong> ~400MB (cached locally)
          </p>
          <p>
            <strong>Backend:</strong> WebGPU (GPU accelerated)
          </p>
          <p className="text-gray-400">
            First load downloads the model. Subsequent loads are instant.
            Requires WebGPU-enabled browser (Chrome 113+, Edge 113+).
          </p>
        </div>
      )}
    </div>
  );
}
