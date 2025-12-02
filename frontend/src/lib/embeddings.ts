/**
 * Embedding-based transaction categorizer using MiniLM via @xenova/transformers
 * Runs entirely in-browser via WebAssembly - no server required
 */

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

// Category exemplars - representative phrases for each category
// The model will match transaction descriptions to the closest category
const CATEGORY_EXEMPLARS: Record<string, string[]> = {
  'Income': [
    'salary payment',
    'payroll deposit',
    'bonus payment',
    'wage transfer',
    'monthly salary',
    'income received',
  ],
  'Investments': [
    'stock purchase',
    'investment transfer',
    'brokerage deposit',
    'tiger brokers',
    'moomoo securities',
    'syfe investment',
    'stashaway deposit',
    'cpf contribution',
    'srs transfer',
  ],
  'Savings': [
    'savings transfer',
    'fixed deposit',
    'save money',
    'savings account',
  ],
  'Credit Card Payment': [
    'credit card payment',
    'card bill payment',
    'pay credit card',
    'card statement payment',
  ],
  'Food & Dining': [
    'restaurant payment',
    'food delivery',
    'grab food',
    'foodpanda order',
    'deliveroo',
    'cafe coffee',
    'mcdonald burger',
    'kfc chicken',
    'starbucks coffee',
    'bubble tea',
    'hawker food',
    'lunch dinner breakfast',
  ],
  'Groceries': [
    'supermarket shopping',
    'ntuc fairprice',
    'cold storage',
    'giant hypermarket',
    'sheng siong',
    'grocery shopping',
    'don don donki',
  ],
  'Transport': [
    'bus mrt fare',
    'transit payment',
    'grab ride',
    'taxi fare',
    'gojek transport',
    'parking fee',
    'petrol fuel',
    'ez-link top up',
  ],
  'Shopping': [
    'online shopping',
    'shopee purchase',
    'lazada order',
    'amazon purchase',
    'retail store',
    'clothing purchase',
    'uniqlo clothes',
    'ikea furniture',
  ],
  'Subscriptions': [
    'netflix subscription',
    'spotify premium',
    'youtube premium',
    'disney plus',
    'streaming service',
    'monthly subscription',
    'chatgpt openai',
    'github subscription',
  ],
  'Entertainment': [
    'movie cinema',
    'concert ticket',
    'theme park',
    'karaoke',
    'arcade games',
    'sentosa attraction',
  ],
  'Bills': [
    'utility bill',
    'electricity payment',
    'water bill',
    'internet broadband',
    'mobile phone bill',
    'singtel starhub m1',
  ],
  'Tax': [
    'income tax payment',
    'iras tax',
    'gst payment',
    'property tax',
  ],
  'Rent': [
    'rental payment',
    'monthly rent',
    'lease payment',
    'landlord payment',
  ],
  'Healthcare': [
    'clinic visit',
    'hospital payment',
    'medical expense',
    'pharmacy medicine',
    'dental treatment',
    'doctor consultation',
  ],
  'Insurance': [
    'insurance premium',
    'life insurance',
    'health insurance',
    'policy payment',
    'prudential aia',
  ],
  'Education': [
    'school fees',
    'tuition payment',
    'course enrollment',
    'education expense',
    'university college',
  ],
  'P2P Transfers': [
    'paynow transfer',
    'paylah payment',
    'peer transfer',
    'send money friend',
  ],
  'Transfers': [
    'bank transfer',
    'fund transfer',
    'giro payment',
    'interbank transfer',
  ],
};

// Singleton pipeline instance
let extractor: FeatureExtractionPipeline | null = null;
let categoryEmbeddings: Map<string, Float32Array> | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

// User-defined category mappings (description -> category)
// These are learned from user corrections and used as additional exemplars
let userDefinedMappings: Map<string, string> = new Map();
let userMappingEmbeddings: Map<string, { category: string; embedding: Float32Array }> = new Map();

// Progress callback type
export type ModelLoadProgress = {
  stage: 'downloading' | 'loading' | 'computing_embeddings' | 'ready';
  progress: number; // 0-100
  message: string;
};

/**
 * Initialize the embedding model and pre-compute category embeddings
 * Call this early (e.g., on app load) to warm up the model
 */
export async function initializeEmbeddings(
  onProgress?: (progress: ModelLoadProgress) => void
): Promise<void> {
  if (categoryEmbeddings) return; // Already initialized
  if (initPromise) return initPromise; // Already initializing
  
  isInitializing = true;
  initPromise = (async () => {
    try {
      onProgress?.({ stage: 'downloading', progress: 0, message: 'Downloading AI model...' });
      
      // Load the model - this downloads ~45MB on first run, then cached
      extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { progress_callback: (progress: { status: string; progress?: number; file?: string }) => {
          if (progress.status === 'progress' && progress.progress !== undefined) {
            onProgress?.({
              stage: 'downloading',
              progress: Math.round(progress.progress),
              message: `Downloading model: ${Math.round(progress.progress)}%`,
            });
          } else if (progress.status === 'done') {
            onProgress?.({ stage: 'loading', progress: 100, message: 'Model downloaded, loading...' });
          }
        }}
      );
      
      onProgress?.({ stage: 'computing_embeddings', progress: 0, message: 'Computing category embeddings...' });
      
      // Pre-compute embeddings for all category exemplars
      categoryEmbeddings = new Map();
      const categories = Object.entries(CATEGORY_EXEMPLARS);
      
      for (let i = 0; i < categories.length; i++) {
        const [category, exemplars] = categories[i];
        // Combine all exemplars into one text for a single embedding per category
        const combinedText = exemplars.join('. ');
        const embedding = await getEmbedding(combinedText);
        categoryEmbeddings.set(category, embedding);
        
        onProgress?.({
          stage: 'computing_embeddings',
          progress: Math.round(((i + 1) / categories.length) * 100),
          message: `Computing embeddings: ${i + 1}/${categories.length}`,
        });
      }
      
      // Load user-defined mappings from storage
      await loadUserMappings();
      
      onProgress?.({ stage: 'ready', progress: 100, message: 'AI model ready' });
      console.log('Embedding model initialized with', categoryEmbeddings.size, 'categories');
    } finally {
      isInitializing = false;
    }
  })();
  
  return initPromise;
}

/**
 * Get embedding vector for a text string
 */
async function getEmbedding(text: string): Promise<Float32Array> {
  if (!extractor) {
    throw new Error('Embedding model not initialized. Call initializeEmbeddings() first.');
  }
  
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output.data as Float32Array;
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Vectors are already normalized, so dot product = cosine similarity
  return dot;
}

/**
 * Categorize a transaction description using semantic similarity
 * Returns the best matching category and confidence score
 * 
 * Priority:
 * 1. Exact match in user-defined mappings (confidence = 1.0)
 * 2. Similarity to user-defined mapping embeddings (boosted score)
 * 3. Similarity to category exemplar embeddings
 */
export async function categorizeWithEmbeddings(
  description: string,
  vendor?: string
): Promise<{ category: string; confidence: number }> {
  if (!categoryEmbeddings || !extractor) {
    // Fallback if model not loaded
    return { category: 'Other', confidence: 0 };
  }
  
  // Check for exact match in user-defined mappings first
  if (userDefinedMappings.has(description)) {
    return { category: userDefinedMappings.get(description)!, confidence: 1.0 };
  }
  
  // Combine description and vendor for better context
  const text = vendor ? `${description} ${vendor}` : description;
  const embedding = await getEmbedding(text);
  
  let bestCategory = 'Other';
  let bestScore = -1;
  
  // Check user-defined mapping embeddings first (with a boost)
  const USER_MAPPING_BOOST = 0.25; // Boost user mappings significantly
  for (const [, { category, embedding: userEmbedding }] of userMappingEmbeddings) {
    const score = cosineSimilarity(embedding, userEmbedding) + USER_MAPPING_BOOST;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  
  // Check category exemplar embeddings
  for (const [category, catEmbedding] of categoryEmbeddings) {
    const score = cosineSimilarity(embedding, catEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }
  
  // If confidence is too low, return "Other"
  // Threshold of 0.8 ensures we only apply high-confidence changes
  const CONFIDENCE_THRESHOLD = 0.8;
  if (bestScore < CONFIDENCE_THRESHOLD) {
    return { category: 'Other', confidence: bestScore };
  }
  
  return { category: bestCategory, confidence: Math.min(bestScore, 1.0) };
}

/**
 * Batch categorize multiple transactions efficiently
 */
export async function categorizeBatch(
  transactions: Array<{ description: string; vendor?: string }>
): Promise<Array<{ category: string; confidence: number }>> {
  if (!categoryEmbeddings || !extractor) {
    await initializeEmbeddings();
  }
  
  const results: Array<{ category: string; confidence: number }> = [];
  
  for (const tx of transactions) {
    const result = await categorizeWithEmbeddings(tx.description, tx.vendor);
    results.push(result);
  }
  
  return results;
}

/**
 * Check if the embedding model is ready
 */
export function isModelReady(): boolean {
  return categoryEmbeddings !== null && extractor !== null;
}

/**
 * Check if the model is currently loading
 */
export function isModelLoading(): boolean {
  return isInitializing;
}

// IndexedDB helpers for user mappings
const USER_MAPPINGS_DB = 'sonar-ledger';
const USER_MAPPINGS_STORE = 'app';
const USER_MAPPINGS_KEY = 'user_category_mappings';

async function openMappingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(USER_MAPPINGS_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(USER_MAPPINGS_STORE)) {
        db.createObjectStore(USER_MAPPINGS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load user-defined category mappings from IndexedDB
 */
async function loadUserMappings(): Promise<void> {
  try {
    const db = await openMappingsDB();
    const tx = db.transaction(USER_MAPPINGS_STORE, 'readonly');
    const store = tx.objectStore(USER_MAPPINGS_STORE);
    
    const result = await new Promise<Record<string, string> | undefined>((resolve, reject) => {
      const request = store.get(USER_MAPPINGS_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (result) {
      userDefinedMappings = new Map(Object.entries(result));
      console.log(`Loaded ${userDefinedMappings.size} user-defined category mappings`);
      
      // Compute embeddings for user mappings
      for (const [description, category] of userDefinedMappings) {
        if (extractor) {
          const embedding = await getEmbedding(description);
          userMappingEmbeddings.set(description, { category, embedding });
        }
      }
    }
  } catch (err) {
    console.error('Failed to load user mappings:', err);
  }
}

/**
 * Save user-defined category mappings to IndexedDB
 */
async function saveUserMappings(): Promise<void> {
  try {
    const db = await openMappingsDB();
    const tx = db.transaction(USER_MAPPINGS_STORE, 'readwrite');
    const store = tx.objectStore(USER_MAPPINGS_STORE);
    
    const obj = Object.fromEntries(userDefinedMappings);
    store.put(obj, USER_MAPPINGS_KEY);
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to save user mappings:', err);
  }
}

/**
 * Learn a user's category correction - this will be used for future categorizations
 * @param description The transaction description
 * @param category The correct category assigned by the user
 */
export async function learnUserCategory(
  description: string,
  category: string
): Promise<void> {
  if (!extractor) {
    console.warn('Cannot learn category - model not initialized');
    return;
  }
  
  // Store the mapping
  userDefinedMappings.set(description, category);
  
  // Compute and store the embedding
  const embedding = await getEmbedding(description);
  userMappingEmbeddings.set(description, { category, embedding });
  
  // Persist to storage
  await saveUserMappings();
  
  console.log(`Learned: "${description.substring(0, 50)}..." -> ${category}`);
}

/**
 * Get all user-defined category mappings
 */
export function getUserMappings(): Map<string, string> {
  return new Map(userDefinedMappings);
}

/**
 * Clear all user-defined category mappings
 */
export async function clearUserMappings(): Promise<void> {
  userDefinedMappings.clear();
  userMappingEmbeddings.clear();
  await saveUserMappings();
}

// ============================================================================
// Transaction Embedding Cache & Similarity Search
// ============================================================================

// Cache of transaction embeddings: key = description, value = embedding
const transactionEmbeddingCache: Map<string, Float32Array> = new Map();

/**
 * Get or compute embedding for a transaction description
 */
export async function getTransactionEmbedding(description: string, vendor?: string): Promise<Float32Array | null> {
  if (!extractor) return null;
  
  const key = vendor ? `${description}|${vendor}` : description;
  
  if (transactionEmbeddingCache.has(key)) {
    return transactionEmbeddingCache.get(key)!;
  }
  
  const text = vendor ? `${description} ${vendor}` : description;
  const embedding = await getEmbedding(text);
  transactionEmbeddingCache.set(key, embedding);
  
  return embedding;
}

/**
 * Find transactions similar to a given one
 * Returns indices and similarity scores for transactions above the threshold
 */
export async function findSimilarTransactions(
  targetDescription: string,
  targetVendor: string | undefined,
  allTransactions: Array<{ description: string; vendor?: string; hidden?: boolean }>,
  threshold: number = 0.85
): Promise<Array<{ index: number; similarity: number }>> {
  if (!extractor) return [];
  
  const targetEmbedding = await getTransactionEmbedding(targetDescription, targetVendor);
  if (!targetEmbedding) return [];
  
  const results: Array<{ index: number; similarity: number }> = [];
  
  for (let i = 0; i < allTransactions.length; i++) {
    const tx = allTransactions[i];
    
    // Skip hidden transactions
    if (tx.hidden) continue;
    
    // Skip the exact same transaction
    if (tx.description === targetDescription && tx.vendor === targetVendor) continue;
    
    const txEmbedding = await getTransactionEmbedding(tx.description, tx.vendor);
    if (!txEmbedding) continue;
    
    const similarity = cosineSimilarity(targetEmbedding, txEmbedding);
    
    if (similarity >= threshold) {
      results.push({ index: i, similarity });
    }
  }
  
  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);
  
  return results;
}

/**
 * Pre-compute embeddings for all transactions (call after model loads)
 * Returns progress updates via callback
 */
export async function precomputeTransactionEmbeddings(
  transactions: Array<{ description: string; vendor?: string }>,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  if (!extractor) return;
  
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    await getTransactionEmbedding(tx.description, tx.vendor);
    onProgress?.(i + 1, transactions.length);
  }
}
