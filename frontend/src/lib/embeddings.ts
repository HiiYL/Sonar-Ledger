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
  // Return existing promise if already initializing
  if (initPromise) return initPromise;
  if (extractor) return;
  
  isInitializing = true;
  
  initPromise = (async () => {
    try {
      onProgress?.({ stage: 'downloading', progress: 0, message: 'Downloading AI model...' });
      
      // Load the model with progress callback
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: (progressData: { status: string; progress?: number }) => {
          if (progressData.status === 'progress' && progressData.progress !== undefined) {
            onProgress?.({ 
              stage: 'downloading', 
              progress: progressData.progress, 
              message: `Downloading: ${Math.round(progressData.progress)}%` 
            });
          }
        }
      });
      
      onProgress?.({ stage: 'loading', progress: 100, message: 'Model loaded, loading cache...' });
      
      // Load user-defined mappings from storage
      await loadUserMappings();
      
      // Load cached transaction embeddings from IndexedDB
      const cachedCount = await loadCachedEmbeddings();
      console.log(`Loaded ${cachedCount} cached transaction embeddings`);
      
      onProgress?.({ stage: 'computing_embeddings', progress: 0, message: 'Computing category embeddings...' });
      
      // Compute category embeddings
      categoryEmbeddings = new Map();
      const categories = Object.keys(CATEGORY_EXEMPLARS);
      
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const exemplars = CATEGORY_EXEMPLARS[category];
        const exemplarText = exemplars.join(' ');
        const embedding = await getEmbedding(exemplarText);
        categoryEmbeddings.set(category, embedding);
        
        onProgress?.({
          stage: 'computing_embeddings',
          progress: Math.round(((i + 1) / categories.length) * 100),
          message: `Computing embeddings: ${i + 1}/${categories.length}`,
        });
      }
      
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
 * Categorize using a pre-computed embedding (sync, fast)
 */
function categorizeWithEmbeddingSync(
  embedding: Float32Array
): { category: string; confidence: number } {
  if (!categoryEmbeddings) {
    return { category: 'Other', confidence: 0 };
  }
  
  let bestCategory = 'Other';
  let bestScore = -1;
  
  // Check user-defined mapping embeddings first (with a boost)
  const USER_MAPPING_BOOST = 0.25;
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
  const CONFIDENCE_THRESHOLD = 0.8;
  if (bestScore < CONFIDENCE_THRESHOLD) {
    return { category: 'Other', confidence: bestScore };
  }
  
  return { category: bestCategory, confidence: Math.min(bestScore, 1.0) };
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
    return { category: 'Other', confidence: 0 };
  }
  
  // Check for exact match in user-defined mappings first
  if (userDefinedMappings.has(description)) {
    return { category: userDefinedMappings.get(description)!, confidence: 1.0 };
  }
  
  // Try to use cached embedding first (fast path)
  const key = vendor ? `${description}|${vendor}` : description;
  let embedding = transactionEmbeddingCache.get(key);
  
  if (!embedding) {
    // Compute and cache embedding
    const text = vendor ? `${description} ${vendor}` : description;
    embedding = await getEmbedding(text);
    transactionEmbeddingCache.set(key, embedding);
    saveTxEmbedding(key, embedding);
  }
  
  return categorizeWithEmbeddingSync(embedding);
}

/**
 * Fast categorization using only cached embeddings (sync)
 * Returns null if embedding not cached
 */
export function categorizeWithEmbeddingsFast(
  description: string,
  vendor?: string
): { category: string; confidence: number } | null {
  if (!categoryEmbeddings) return null;
  
  // Check for exact match in user-defined mappings first
  if (userDefinedMappings.has(description)) {
    return { category: userDefinedMappings.get(description)!, confidence: 1.0 };
  }
  
  // Try cached embedding
  const key = vendor ? `${description}|${vendor}` : description;
  const embedding = transactionEmbeddingCache.get(key);
  
  if (!embedding) return null;
  
  return categorizeWithEmbeddingSync(embedding);
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

export async function replaceUserMappings(newMappings: Map<string, string>): Promise<void> {
  userDefinedMappings = new Map(newMappings);
  userMappingEmbeddings.clear();

  if (extractor) {
    for (const [description, category] of userDefinedMappings) {
      const embedding = await getEmbedding(description);
      userMappingEmbeddings.set(description, { category, embedding });
    }
  }

  await saveUserMappings();
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
// Transaction Embedding Cache & Similarity Search (with IndexedDB persistence)
// ============================================================================

const TX_EMBEDDINGS_DB_NAME = 'sonar-tx-embeddings';
const TX_EMBEDDINGS_STORE_NAME = 'embeddings';
const TX_EMBEDDINGS_DB_VERSION = 1;

// In-memory cache of transaction embeddings: key = description|vendor, value = embedding
const transactionEmbeddingCache: Map<string, Float32Array> = new Map();

/**
 * Open the transaction embeddings IndexedDB
 */
function openTxEmbeddingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TX_EMBEDDINGS_DB_NAME, TX_EMBEDDINGS_DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(TX_EMBEDDINGS_STORE_NAME)) {
        db.createObjectStore(TX_EMBEDDINGS_STORE_NAME);
      }
    };
  });
}

/**
 * Load all cached embeddings from IndexedDB into memory
 */
export async function loadCachedEmbeddings(): Promise<number> {
  try {
    const db = await openTxEmbeddingsDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TX_EMBEDDINGS_STORE_NAME, 'readonly');
      const store = tx.objectStore(TX_EMBEDDINGS_STORE_NAME);
      const request = store.openCursor();
      let count = 0;
      
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const key = cursor.key as string;
          const value = cursor.value as number[];
          transactionEmbeddingCache.set(key, new Float32Array(value));
          count++;
          cursor.continue();
        } else {
          db.close();
          resolve(count);
        }
      };
    });
  } catch (err) {
    console.error('Failed to load cached embeddings:', err);
    return 0;
  }
}

/**
 * Save a single embedding to IndexedDB
 */
async function saveTxEmbedding(key: string, embedding: Float32Array): Promise<void> {
  try {
    const db = await openTxEmbeddingsDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TX_EMBEDDINGS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(TX_EMBEDDINGS_STORE_NAME);
      // Store as regular array for IndexedDB compatibility
      const request = store.put(Array.from(embedding), key);
      
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      request.onsuccess = () => {
        db.close();
        resolve();
      };
    });
  } catch (err) {
    console.error('Failed to save embedding:', err);
  }
}

/**
 * Clear all cached embeddings from IndexedDB
 */
export async function clearCachedEmbeddings(): Promise<void> {
  try {
    const db = await openTxEmbeddingsDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TX_EMBEDDINGS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(TX_EMBEDDINGS_STORE_NAME);
      const request = store.clear();
      
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      request.onsuccess = () => {
        transactionEmbeddingCache.clear();
        db.close();
        resolve();
      };
    });
  } catch (err) {
    console.error('Failed to clear cached embeddings:', err);
  }
}

/**
 * Get the number of cached embeddings
 */
export function getCachedEmbeddingsCount(): number {
  return transactionEmbeddingCache.size;
}

/**
 * Get or compute embedding for a transaction description
 * Uses in-memory cache backed by IndexedDB for persistence
 */
export async function getTransactionEmbedding(description: string, vendor?: string): Promise<Float32Array | null> {
  if (!extractor) return null;
  
  const key = vendor ? `${description}|${vendor}` : description;
  
  // Check in-memory cache first
  if (transactionEmbeddingCache.has(key)) {
    return transactionEmbeddingCache.get(key)!;
  }
  
  // Compute new embedding
  const text = vendor ? `${description} ${vendor}` : description;
  const embedding = await getEmbedding(text);
  
  // Store in memory cache
  transactionEmbeddingCache.set(key, embedding);
  
  // Persist to IndexedDB (fire and forget)
  saveTxEmbedding(key, embedding);
  
  return embedding;
}

/**
 * Get embedding cache key for a transaction
 */
function getTxCacheKey(description: string, vendor?: string): string {
  return vendor ? `${description}|${vendor}` : description;
}

/**
 * Check if an embedding is already cached (sync, no computation)
 */
export function hasEmbeddingCached(description: string, vendor?: string): boolean {
  const key = getTxCacheKey(description, vendor);
  return transactionEmbeddingCache.has(key);
}

/**
 * Get cached embedding synchronously (returns null if not cached)
 */
function getCachedEmbedding(description: string, vendor?: string): Float32Array | null {
  const key = getTxCacheKey(description, vendor);
  return transactionEmbeddingCache.get(key) || null;
}

/**
 * Find transactions similar to a given one - FAST version
 * Only uses already-cached embeddings (no computation during search)
 * Returns indices and similarity scores for transactions above the threshold
 */
export function findSimilarTransactionsFast(
  targetDescription: string,
  targetVendor: string | undefined,
  allTransactions: Array<{ description: string; vendor?: string; hidden?: boolean }>,
  threshold: number = 0.85
): Array<{ index: number; similarity: number }> {
  const targetEmbedding = getCachedEmbedding(targetDescription, targetVendor);
  if (!targetEmbedding) return [];
  
  const results: Array<{ index: number; similarity: number }> = [];
  
  for (let i = 0; i < allTransactions.length; i++) {
    const tx = allTransactions[i];
    
    // Skip hidden transactions
    if (tx.hidden) continue;
    
    // Skip the exact same transaction
    if (tx.description === targetDescription && tx.vendor === targetVendor) continue;
    
    // Only use cached embeddings (skip if not cached)
    const txEmbedding = getCachedEmbedding(tx.description, tx.vendor);
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
 * Find transactions similar to a given one - computes missing embeddings
 * Use findSimilarTransactionsFast for instant results with cached data
 */
export async function findSimilarTransactions(
  targetDescription: string,
  targetVendor: string | undefined,
  allTransactions: Array<{ description: string; vendor?: string; hidden?: boolean }>,
  threshold: number = 0.85
): Promise<Array<{ index: number; similarity: number }>> {
  if (!extractor) return [];
  
  // First ensure target embedding exists
  const targetEmbedding = await getTransactionEmbedding(targetDescription, targetVendor);
  if (!targetEmbedding) return [];
  
  // Try fast path first (only cached)
  const fastResults = findSimilarTransactionsFast(targetDescription, targetVendor, allTransactions, threshold);
  
  // If we have good coverage (>80% cached), return fast results
  const cachedCount = allTransactions.filter(tx => hasEmbeddingCached(tx.description, tx.vendor)).length;
  if (cachedCount > allTransactions.length * 0.8) {
    return fastResults;
  }
  
  // Otherwise compute missing embeddings in background
  const results: Array<{ index: number; similarity: number }> = [...fastResults];
  const processedKeys = new Set(fastResults.map(r => {
    const tx = allTransactions[r.index];
    return getTxCacheKey(tx.description, tx.vendor);
  }));
  
  // Process uncached transactions
  const BATCH_SIZE = 10;
  let batchCount = 0;
  
  for (let i = 0; i < allTransactions.length; i++) {
    const tx = allTransactions[i];
    if (tx.hidden) continue;
    if (tx.description === targetDescription && tx.vendor === targetVendor) continue;
    
    const key = getTxCacheKey(tx.description, tx.vendor);
    if (processedKeys.has(key) || transactionEmbeddingCache.has(key)) continue;
    
    const txEmbedding = await getTransactionEmbedding(tx.description, tx.vendor);
    if (!txEmbedding) continue;
    
    const similarity = cosineSimilarity(targetEmbedding, txEmbedding);
    
    if (similarity >= threshold) {
      results.push({ index: i, similarity });
    }
    
    batchCount++;
    if (batchCount % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}

/**
 * Pre-compute embeddings for all transactions (call after model loads)
 * Runs in background with yields to avoid blocking UI
 * Skips already-cached embeddings for efficiency
 */
export async function precomputeTransactionEmbeddings(
  transactions: Array<{ description: string; vendor?: string }>,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  if (!extractor) return;
  
  const BATCH_SIZE = 5; // Small batches for smoother UI
  let computed = 0;
  
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const key = tx.vendor ? `${tx.description}|${tx.vendor}` : tx.description;
    
    // Skip if already cached
    if (transactionEmbeddingCache.has(key)) {
      onProgress?.(i + 1, transactions.length);
      continue;
    }
    
    await getTransactionEmbedding(tx.description, tx.vendor);
    computed++;
    onProgress?.(i + 1, transactions.length);
    
    // Yield to UI every batch
    if (computed % BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  console.log(`Pre-computed ${computed} new embeddings (${transactions.length - computed} were cached)`);
}
