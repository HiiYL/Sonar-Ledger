import { useState, useMemo, useEffect, useCallback } from 'react';
import { FileUpload } from './components/FileUpload';
import { StatsCards } from './components/StatsCards';
import {
  SpendChart,
  CategoryPieChart,
  NetFlowTrend,
  ExpenseInsights,
} from './components/Charts';
import { TransactionTable } from './components/TransactionTable';
import { FileSidebar } from './components/FileSidebar';
import { CloudSync } from './components/CloudSync';
import { JsonBackup } from './components/JsonBackup';
import { parseStatement } from './lib/pdfParser';
import {
  getCategoryTotals,
  getTotalStats,
} from './lib/summarizer';
import type { StatementInfo } from './types';
import { FileText, RefreshCw, Brain, Loader2, ArrowRight, X } from 'lucide-react';
import {
  loadPersistedStatements,
  persistStatements,
  clearPersistedStatements,
} from './lib/storage';
import {
  initializeEmbeddings,
  isModelReady,
  precomputeTransactionEmbeddings,
  categorizeWithEmbeddings,
  categorizeWithEmbeddingsFast,
  getUserMappings,
  type ModelLoadProgress,
} from './lib/embeddings';

type AICategorizationChange = {
  id: string;
  statementFilename: string;
  description: string;
  vendor?: string;
  amount: number;
  date: Date;
  previousCategory: string;
  newCategory: string;
  method: 'embedding' | 'rules';
  confidence: number;
};

function App() {
  const EMBEDDING_CONFIDENCE_THRESHOLD = 0.8;

  const [statements, setStatements] = useState<StatementInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<string>('');
  const [sourceFileFilter, setSourceFileFilter] = useState<string>('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelLoadProgress, setModelLoadProgress] = useState<ModelLoadProgress | null>(null);
  const [isRecategorizing, setIsRecategorizing] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ processed: number; total: number; currentDescription?: string } | null>(null);
  const [aiChanges, setAiChanges] = useState<AICategorizationChange[]>([]);
  const [showAiResults, setShowAiResults] = useState(false);

  // Initialize embedding model on mount
  useEffect(() => {
    setModelStatus('loading');
    initializeEmbeddings((progress) => {
      setModelLoadProgress(progress);
      if (progress.stage === 'ready') {
        setModelStatus('ready');
      }
    })
      .then(() => setModelStatus('ready'))
      .catch((err) => {
        console.error('Failed to load embedding model:', err);
        setModelStatus('error');
      });
  }, []);

  // Pre-compute embeddings for all transactions in background when model is ready
  useEffect(() => {
    if (modelStatus !== 'ready' || statements.length === 0) return;
    
    const allTx = statements.flatMap((s) => 
      s.transactions.map((tx) => ({ description: tx.description, vendor: tx.vendor }))
    );
    
    // Run in background without blocking UI
    precomputeTransactionEmbeddings(allTx).catch((err) => {
      console.error('Failed to precompute embeddings:', err);
    });
  }, [modelStatus, statements]);

  // Re-categorize all transactions using the embedding model
  const handleRecategorize = useCallback(async () => {
    if (!isModelReady()) return;
    if (statements.length === 0) {
      setError('No statements loaded');
      return;
    }

    const targets: Array<{ stmtIndex: number; txIndex: number }> = [];
    statements.forEach((stmt, stmtIndex) => {
      stmt.transactions.forEach((tx, txIndex) => {
        // Only process:
        // 1. Non-hidden transactions
        // 2. "Other" category OR user-corrected categories (not rule-based defaults)
        const isOther = (tx.category ?? 'Other') === 'Other';
        const isUserCorrected = tx.categorySource === 'user' || tx.categorySource === 'ai';
        
        if (!tx.hidden && (isOther || isUserCorrected)) {
          targets.push({ stmtIndex, txIndex });
        }
      });
    });

    if (targets.length === 0) {
      setError('No transactions need AI categorization. Rule-based categories are kept as-is.');
      return;
    }

    setIsRecategorizing(true);
    setAiProgress({ processed: 0, total: targets.length, currentDescription: '' });
    setAiChanges([]);
    setShowAiResults(false);

    const updatedStatements = statements.map((stmt) => ({
      ...stmt,
      transactions: stmt.transactions.map((tx) => ({ ...tx })),
    }));

    const changes: AICategorizationChange[] = [];
    
    // OPTIMIZATION: Process in batches for better performance
    const BATCH_SIZE = 20;
    let processedCount = 0;
    
    // First pass: use cached embeddings (instant)
    for (const { stmtIndex, txIndex } of targets) {
      const tx = updatedStatements[stmtIndex].transactions[txIndex];
      const previousCategory = tx.category ?? 'Other';
      
      // Try fast path with cached embedding
      const fastResult = categorizeWithEmbeddingsFast(tx.description, tx.vendor);
      
      if (fastResult && fastResult.confidence >= EMBEDDING_CONFIDENCE_THRESHOLD && fastResult.category !== previousCategory) {
        tx.category = fastResult.category;
        tx.categorySource = 'ai';
        changes.push({
          id: `${updatedStatements[stmtIndex].filename}-${txIndex}-${tx.date.toISOString()}`,
          statementFilename: updatedStatements[stmtIndex].filename,
          description: tx.description,
          vendor: tx.vendor,
          amount: tx.amount,
          date: tx.date,
          previousCategory,
          newCategory: fastResult.category,
          method: 'embedding',
          confidence: fastResult.confidence,
        });
      }
      
      processedCount++;
    }
    
    // Update progress after fast pass
    setAiProgress({ processed: processedCount, total: targets.length, currentDescription: 'Fast pass complete' });
    
    // Second pass: compute missing embeddings
    let needsCompute = 0;
    for (let i = 0; i < targets.length; i++) {
      const { stmtIndex, txIndex } = targets[i];
      const tx = updatedStatements[stmtIndex].transactions[txIndex];
      
      // Skip if already processed in fast pass (category changed)
      if (tx.categorySource === 'ai') continue;
      
      const previousCategory = tx.category ?? 'Other';
      
      // Update progress periodically
      if (needsCompute % BATCH_SIZE === 0) {
        await new Promise<void>((resolve) => {
          setAiProgress({ 
            processed: processedCount + needsCompute, 
            total: targets.length + needsCompute, 
            currentDescription: tx.description.substring(0, 40) 
          });
          setTimeout(resolve, 0); // Minimal delay, just yield to UI
        });
      }

      try {
        const result = await categorizeWithEmbeddings(tx.description, tx.vendor);
        
        if (result.confidence >= EMBEDDING_CONFIDENCE_THRESHOLD && result.category !== previousCategory) {
          tx.category = result.category;
          tx.categorySource = 'ai';
          changes.push({
            id: `${updatedStatements[stmtIndex].filename}-${txIndex}-${tx.date.toISOString()}`,
            statementFilename: updatedStatements[stmtIndex].filename,
            description: tx.description,
            vendor: tx.vendor,
            amount: tx.amount,
            date: tx.date,
            previousCategory,
            newCategory: result.category,
            method: 'embedding',
            confidence: result.confidence,
          });
        }
      } catch (err) {
        console.error('Failed to categorize transaction', tx.description, err);
      }
      
      needsCompute++;
    }
    
    setAiProgress({ processed: targets.length, total: targets.length });

    setStatements(updatedStatements);
    setAiChanges(changes);
    setAiProgress(null);

    if (changes.length === 0) {
      setError('AI did not find high-confidence category improvements.');
    } else {
      setError(null);
      setShowAiResults(true); // Show popup with results
    }
    setIsRecategorizing(false);
  }, [statements]);

  useEffect(() => {
    let isCancelled = false;

    async function hydrate() {
      try {
        const persisted = await loadPersistedStatements();
        if (isCancelled) return;

        if (persisted.length > 0) {
          setStatements(persisted);
          setSelectedFiles(new Set(persisted.map((s) => s.filename)));
        }
      } catch (err) {
        console.error('Failed to load persisted statements', err);
      } finally {
        if (!isCancelled) {
          setIsHydrated(true);
        }
      }
    }

    hydrate();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    persistStatements(statements).catch((err) => {
      console.error('Failed to persist statements', err);
    });
  }, [statements, isHydrated]);

  // Handle category update from transaction table (user correction)
  const handleCategoryUpdate = useCallback((txIndex: number, _description: string, newCategory: string) => {
    // Find which statement contains this transaction and update it
    // txIndex is relative to the flattened allTransactions array
    let currentIndex = 0;
    
    setStatements((prev) => {
      const updated = prev.map((stmt) => {
        const txCount = stmt.transactions.length;
        if (txIndex >= currentIndex && txIndex < currentIndex + txCount) {
          // This statement contains the transaction
          const localIndex = txIndex - currentIndex;
          const updatedTransactions = [...stmt.transactions];
          updatedTransactions[localIndex] = {
            ...updatedTransactions[localIndex],
            category: newCategory,
            categorySource: 'user', // Mark as user-corrected
          };
          return { ...stmt, transactions: updatedTransactions };
        }
        currentIndex += txCount;
        return stmt;
      });
      return updated;
    });
  }, []);

  // Handle toggling hidden status for a transaction
  const handleToggleHidden = useCallback((txIndex: number) => {
    let currentIndex = 0;
    
    setStatements((prev) => {
      const updated = prev.map((stmt) => {
        const txCount = stmt.transactions.length;
        if (txIndex >= currentIndex && txIndex < currentIndex + txCount) {
          const localIndex = txIndex - currentIndex;
          const updatedTransactions = [...stmt.transactions];
          updatedTransactions[localIndex] = {
            ...updatedTransactions[localIndex],
            hidden: !updatedTransactions[localIndex].hidden,
          };
          return { ...stmt, transactions: updatedTransactions };
        }
        currentIndex += txCount;
        return stmt;
      });
      return updated;
    });
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const parsed = await Promise.all(files.map((f) => parseStatement(f)));
      setStatements((prev) => [...prev, ...parsed]);
      // Auto-select newly added files
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        parsed.forEach((p) => next.add(p.filename));
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse PDFs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStatements([]);
    setSelectedFiles(new Set());
    setError(null);
    clearPersistedStatements().catch((err) => {
      console.error('Failed to clear persisted statements', err);
    });
  };

  const handleToggleFile = (filename: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedFiles(new Set(statements.map((s) => s.filename)));
  };

  const handleSelectNone = () => {
    setSelectedFiles(new Set());
  };

  // Handle data loaded from cloud sync
  const handleCloudDataLoaded = useCallback((loadedStatements: StatementInfo[], _mappings: Map<string, string>) => {
    setStatements(loadedStatements);
    setSelectedFiles(new Set(loadedStatements.map((s) => s.filename)));
    // Note: User mappings are handled separately in the embeddings module
  }, []);

  // Filter statements based on selection
  const filteredStatements = useMemo(
    () => statements.filter((s) => selectedFiles.has(s.filename)),
    [statements, selectedFiles]
  );

  // All transactions (including hidden) for the table
  const allTransactions = filteredStatements.flatMap((s) => 
    s.transactions.map((tx) => ({ ...tx, sourceFile: s.filename }))
  );
  
  // Visible transactions only (excluding hidden) for charts and stats
  const visibleTransactions = allTransactions.filter((tx) => !tx.hidden);
  
  // Filter transactions by period for charts (when a period is selected)
  const periodFilteredTransactions = useMemo(() => {
    if (!periodFilter) return visibleTransactions;
    
    return visibleTransactions.filter((tx) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const txMonth = `${monthNames[tx.date.getMonth()]} ${tx.date.getFullYear().toString().slice(-2)}`;
      return txMonth === periodFilter;
    });
  }, [visibleTransactions, periodFilter]);
  
  // Use period-filtered transactions for category totals when period is selected
  const categoryTotals = useMemo(() => {
    if (!periodFilter) return getCategoryTotals(filteredStatements);
    
    // Calculate category totals from period-filtered transactions
    const totals = new Map<string, number>();
    for (const tx of periodFilteredTransactions) {
      if (tx.amount < 0) { // Only expenses
        const cat = tx.category || 'Other';
        totals.set(cat, (totals.get(cat) || 0) + Math.abs(tx.amount));
      }
    }
    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredStatements, periodFilter, periodFilteredTransactions]);
  
  const stats = getTotalStats(filteredStatements);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Sonar Ledger
                </h1>
                <p className="text-sm text-gray-500">
                  Upload your bank & credit card statements
                </p>
              </div>
            </div>
            {statements.length > 0 && (
              <div className="flex items-center gap-3">
                {/* AI Model Status & Recategorize */}
                <div className="flex items-center gap-2">
                  {modelStatus === 'loading' && modelLoadProgress && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <div className="flex flex-col">
                        <span>{modelLoadProgress.message}</span>
                        {modelLoadProgress.stage === 'downloading' && (
                          <div className="w-32 h-1.5 bg-amber-100 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-amber-500 transition-all"
                              style={{ width: `${modelLoadProgress.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {modelStatus === 'loading' && !modelLoadProgress && (
                    <span className="flex items-center gap-1.5 text-sm text-amber-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading AI...
                    </span>
                  )}
                  {modelStatus === 'ready' && (
                    <button
                      onClick={handleRecategorize}
                      disabled={isRecategorizing}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isRecategorizing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Brain className="w-4 h-4" />
                      )}
                      {isRecategorizing ? 'Categorizing...' : 'AI Categorize'}
                    </button>
                  )}
                  {modelStatus === 'error' && (
                    <span className="text-sm text-red-500">AI unavailable</span>
                  )}
                </div>
                
                {/* Cloud Sync */}
                <CloudSync
                  statements={statements}
                  userMappings={getUserMappings()}
                  onDataLoaded={handleCloudDataLoaded}
                />
                
                {/* JSON Import/Export */}
                <JsonBackup
                  statements={statements}
                  userMappings={getUserMappings()}
                  onDataLoaded={handleCloudDataLoaded}
                />
                
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={`${statements.length > 0 ? 'px-4' : 'max-w-7xl mx-auto px-4'} py-8`}>
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {aiProgress && (
          <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between text-sm text-purple-800">
              <div className="font-medium">Categorizing "Other" transactions...</div>
              <div>
                {aiProgress.processed} / {aiProgress.total}
              </div>
            </div>
            <div className="mt-3 h-2 bg-purple-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-150"
                style={{ width: `${Math.round((aiProgress.processed / aiProgress.total) * 100)}%` }}
              />
            </div>
            {aiProgress.currentDescription && (
              <p className="mt-2 text-xs text-purple-600 truncate">
                Processing: {aiProgress.currentDescription}...
              </p>
            )}
          </div>
        )}

        {/* AI Results Modal/Popup */}
        {showAiResults && aiChanges.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    AI Categorization Complete
                  </h3>
                  <p className="text-sm text-gray-500">
                    {aiChanges.length} transaction{aiChanges.length === 1 ? '' : 's'} updated
                  </p>
                </div>
                <button
                  onClick={() => setShowAiResults(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiChanges.map((change) => (
                  <div key={change.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{new Date(change.date).toLocaleDateString()}</span>
                      <span className="text-xs text-gray-400">{(change.confidence * 100).toFixed(0)}% confidence</span>
                    </div>
                    <p className="mt-1 font-medium text-gray-900 truncate" title={change.description}>
                      {change.description}
                    </p>
                    {change.vendor && (
                      <p className="text-sm text-gray-600">{change.vendor}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                        {change.previousCategory}
                      </span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {change.newCategory}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <button
                  onClick={() => setShowAiResults(false)}
                  className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {statements.length === 0 ? (
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-1">
                <FileUpload
                  onFilesSelected={handleFilesSelected}
                  isLoading={isLoading}
                />
                <div className="mt-8 text-sm text-gray-500">
                  <p className="font-medium mb-2 text-center md:text-left">Privacy First</p>
                  <p className="text-center md:text-left">
                    All processing happens in your browser. Your files never leave
                    your device.
                  </p>
                </div>
              </div>
              <div className="md:w-72 w-full md:self-stretch flex flex-col gap-4">
                {/* Google Drive Sync */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
                  <div className="text-sm font-medium text-gray-900">
                    Sync with Google Drive
                  </div>
                  <p className="text-xs text-gray-500">
                    Load existing data or back up to your own Drive.
                  </p>
                  <CloudSync
                    statements={statements}
                    userMappings={getUserMappings()}
                    onDataLoaded={handleCloudDataLoaded}
                  />
                </div>
                
                {/* JSON Import/Export */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-2">
                  <div className="text-sm font-medium text-gray-900">
                    Import / Export JSON
                  </div>
                  <p className="text-xs text-gray-500">
                    Load from or save to a local JSON backup file.
                  </p>
                  <JsonBackup
                    statements={statements}
                    userMappings={getUserMappings()}
                    onDataLoaded={handleCloudDataLoaded}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Sidebar - sticky and independently scrollable */}
            <div className="flex-shrink-0 sticky top-4 self-start">
              <FileSidebar
                statements={statements}
                selectedFiles={selectedFiles}
                onToggleFile={handleToggleFile}
                onSelectAll={handleSelectAll}
                onSelectNone={handleSelectNone}
              />
            </div>

            {/* Main content */}
            <div className="flex-1 space-y-6 min-w-0">
              {selectedFiles.size === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>Select one or more statements from the sidebar to view data</p>
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <StatsCards
                    totalInflow={stats.totalInflow}
                    totalOutflow={stats.totalOutflow}
                    netFlow={stats.netFlow}
                    avgMonthlySpend={stats.avgMonthlySpend}
                    totalInvestments={stats.totalInvestments}
                    totalSavings={stats.totalSavings}
                  />

                  {/* Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SpendChart 
                      transactions={visibleTransactions} 
                      onPeriodClick={setPeriodFilter}
                      selectedPeriod={periodFilter}
                    />
                    <CategoryPieChart 
                      data={categoryTotals} 
                      onCategoryClick={setCategoryFilter}
                      selectedCategory={categoryFilter}
                      periodFilter={periodFilter}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <NetFlowTrend 
                        transactions={visibleTransactions}
                        selectedPeriod={periodFilter}
                        onPeriodClick={setPeriodFilter}
                      />
                    </div>
                    <ExpenseInsights transactions={periodFilteredTransactions} />
                  </div>

                  {/* Transactions */}
                  <div>
                    <h2 className="text-xl font-semibold mb-4">
                      Transactions ({allTransactions.length})
                    </h2>
                    <TransactionTable 
                      transactions={allTransactions} 
                      initialCategoryFilter={categoryFilter}
                      onCategoryFilterChange={setCategoryFilter}
                      periodFilter={periodFilter}
                      onPeriodFilterChange={setPeriodFilter}
                      sourceFileFilter={sourceFileFilter}
                      onSourceFileFilterChange={setSourceFileFilter}
                      onCategoryUpdate={handleCategoryUpdate}
                      onToggleHidden={handleToggleHidden}
                    />
                  </div>
                </>
              )}

              {/* Add more files */}
              <div className="max-w-md mx-auto py-8">
                <FileUpload
                  onFilesSelected={handleFilesSelected}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
