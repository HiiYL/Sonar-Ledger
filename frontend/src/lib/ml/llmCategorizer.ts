import * as webllm from '@mlc-ai/web-llm';

// Available categories for transaction classification
export const CATEGORIES = [
  'Food & Dining',
  'Transport',
  'Groceries',
  'Shopping',
  'Subscriptions',
  'Entertainment',
  'Bills',
  'Tax',
  'Investments',
  'Savings',
  'Income',
  'Transfers',
  'P2P Transfers',
  'Rent',
  'Healthcare',
  'Insurance',
  'Education',
  'Credit Card Payment',
  'Other',
] as const;

export type Category = typeof CATEGORIES[number];

// Model configuration
// Using Qwen3-0.6B with thinking disabled
const MODEL_ID = 'Qwen3-0.6B-q4f16_1-MLC';

// Singleton engine instance
let engine: webllm.MLCEngine | null = null;
let isLoading = false;
let loadError: Error | null = null;

// Progress callback type
export type LoadProgressCallback = (progress: {
  progress: number;
  text: string;
}) => void;

/**
 * Initialize the WebLLM engine
 * Downloads model on first use (~200-400MB), cached in IndexedDB after
 */
export async function initLLM(onProgress?: LoadProgressCallback): Promise<boolean> {
  if (engine) return true;
  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return engine !== null;
  }
  
  isLoading = true;
  loadError = null;
  
  try {
    // Check WebGPU support
    if (!('gpu' in navigator)) {
      console.warn('WebGPU not supported, LLM categorization disabled');
      loadError = new Error('WebGPU not supported. Try Chrome 113+ or Edge 113+.');
      return false;
    }

    // Request GPU adapter to verify WebGPU actually works
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      console.warn('No WebGPU adapter found');
      loadError = new Error('No WebGPU adapter found. Your GPU may not be supported.');
      return false;
    }

    console.log('WebGPU adapter found:', adapter.info);

    const initProgressCallback = (report: webllm.InitProgressReport) => {
      console.log('LLM loading progress:', report.text, report.progress);
      onProgress?.({
        progress: report.progress,
        text: report.text,
      });
    };
    
    engine = new webllm.MLCEngine({
      initProgressCallback,
    });
    
    console.log('Loading model:', MODEL_ID);
    await engine.reload(MODEL_ID);
    
    console.log('LLM engine loaded successfully');
    return true;
  } catch (err) {
    console.error('Failed to load LLM:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    loadError = new Error(`LLM load failed: ${errorMessage}`);
    engine = null;
    return false;
  } finally {
    isLoading = false;
  }
}

/**
 * Check if LLM is ready for inference
 */
export function isLLMReady(): boolean {
  return engine !== null;
}

/**
 * Get loading status
 */
export function getLLMStatus(): { loading: boolean; ready: boolean; error: Error | null } {
  return {
    loading: isLoading,
    ready: engine !== null,
    error: loadError,
  };
}

/**
 * Categorize a single transaction using the LLM
 */
export async function categorizeWithLLM(
  description: string,
  vendor?: string
): Promise<Category | null> {
  if (!engine) return null;
  
  const transactionText = vendor 
    ? `${vendor}: ${description}`
    : description;
  
  const prompt = `Classify this bank transaction into exactly one of these categories:
Food & Dining, Transport, Groceries, Shopping, Subscriptions, Entertainment, Bills, Tax, Investments, Savings, Income, Transfers, P2P Transfers, Rent, Healthcare, Insurance, Education, Credit Card Payment, Other.

Transaction: "${transactionText}"

Answer with ONLY the category name.`;

  try {
    const chunks: string[] = [];
    const stream = await engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Reply with only the category name. Do not explain. Do not include <think>.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 256,
      temperature: 0,
      stream: true,
      // Qwen-specific flag to disable thinking mode
      // @ts-ignore
      enable_thinking: false,
    });

    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) chunks.push(delta);
    }

    const raw = chunks.join('');
    const cleaned = extractCategoryFromQwen3Response(raw);
    console.log(`LLM raw: "${raw.slice(0, 120)}..." -> cleaned: "${cleaned}"`);

    const matched = matchCategory(cleaned);
    if (matched) {
      return matched;
    }

    console.warn(`Unrecognized: "${raw}"`);
    return null;
  } catch (err) {
    console.error('LLM error:', err);
    return null;
  }
}

/**
 * Extract the category from Qwen3's response which may contain <think>...</think> blocks
 * Qwen3 outputs: <think>reasoning here...</think>\n\nActual Answer
 */
function extractCategoryFromQwen3Response(text: string): string {
  // First, try to get content AFTER </think> tag
  const afterThinkMatch = text.match(/<\/think>\s*([\s\S]*)/i);
  if (afterThinkMatch && afterThinkMatch[1]) {
    const afterThink = afterThinkMatch[1].trim();
    if (afterThink.length > 0) {
      // Get first meaningful line after </think>
      const lines = afterThink.split(/\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        return lines[0].replace(/['"*`]/g, '').trim();
      }
    }
  }
  
  // If no </think> found, remove <think> opening and try to parse
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // Remove complete think blocks
    .replace(/<think>[\s\S]*/gi, '') // Remove incomplete think blocks (no closing tag)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/['"`*]/g, '')
    .trim();

  // Take first non-empty line
  const firstLine = cleaned.split(/\n|\r/).map(l => l.trim()).find(Boolean) || cleaned;
  return firstLine.split(/[,.;]/)[0]?.trim() || firstLine;
}

function matchCategory(value: string): Category | null {
  const lower = value.toLowerCase();

  const exact = CATEGORIES.find(cat => cat.toLowerCase() === lower);
  if (exact) return exact;

  const partial = CATEGORIES.find(cat => lower.includes(cat.toLowerCase()) || cat.toLowerCase().includes(lower));
  if (partial) return partial;

  // Additional heuristics when model outputs keywords
  if (lower.includes('food') || lower.includes('dining') || lower.includes('restaurant')) return 'Food & Dining';
  if (lower.includes('transport') || lower.includes('mrt') || lower.includes('taxi') || lower.includes('grab')) return 'Transport';
  if (lower.includes('grocery') || lower.includes('supermarket') || lower.includes('ntuc')) return 'Groceries';
  if (lower.includes('shopping') || lower.includes('retail')) return 'Shopping';
  if (lower.includes('subscription')) return 'Subscriptions';
  if (lower.includes('entertainment')) return 'Entertainment';
  if (lower.includes('bill') || lower.includes('utility')) return 'Bills';
  if (lower.includes('tax')) return 'Tax';
  if (lower.includes('investment')) return 'Investments';
  if (lower.includes('saving')) return 'Savings';
  if (lower.includes('income') || lower.includes('salary')) return 'Income';
  if (lower.includes('transfer')) return 'Transfers';
  if (lower.includes('rent')) return 'Rent';
  if (lower.includes('health')) return 'Healthcare';
  if (lower.includes('insurance')) return 'Insurance';
  if (lower.includes('education') || lower.includes('tuition')) return 'Education';
  if (lower.includes('credit card')) return 'Credit Card Payment';

  return null;
}

/**
 * Batch categorize multiple transactions
 * More efficient than calling categorizeWithLLM multiple times
 */
export async function batchCategorizeWithLLM(
  transactions: Array<{ description: string; vendor?: string }>
): Promise<Array<Category | null>> {
  if (!engine) {
    return transactions.map(() => null);
  }
  
  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5;
  const results: Array<Category | null> = [];
  
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(tx => categorizeWithLLM(tx.description, tx.vendor))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Unload the LLM engine to free memory
 */
export async function unloadLLM(): Promise<void> {
  if (engine) {
    await engine.unload();
    engine = null;
  }
}
