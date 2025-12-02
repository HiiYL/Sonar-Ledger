import { useState, useMemo, useCallback } from 'react';
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
import { LLMStatus } from './components/LLMStatus';
import { parseStatement } from './lib/pdfParser';
import {
  getCategoryTotals,
  getTotalStats,
} from './lib/summarizer';
import { batchCategorizeWithLLM, isLLMReady } from './lib/ml';
import type { StatementInfo } from './types';
import { FileText, RefreshCw } from 'lucide-react';

function App() {
  const [statements, setStatements] = useState<StatementInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<string>('');
  const [sourceFileFilter, setSourceFileFilter] = useState<string>('');
  const [recategorizeProgress, setRecategorizeProgress] = useState<{ current: number; total: number } | null>(null);

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

  // Filter statements based on selection
  const filteredStatements = useMemo(
    () => statements.filter((s) => selectedFiles.has(s.filename)),
    [statements, selectedFiles]
  );

  const allTransactions = filteredStatements.flatMap((s) => 
    s.transactions.map((tx) => ({ ...tx, sourceFile: s.filename }))
  );
  const categoryTotals = getCategoryTotals(filteredStatements);
  const stats = getTotalStats(filteredStatements);

  // Re-categorize all transactions using LLM
  const handleRecategorizeAll = useCallback(async () => {
    if (!isLLMReady() || statements.length === 0) return;
    
    setIsLoading(true);
    try {
      // Get all transactions with their indices
      const txsToRecategorize = statements.flatMap((s, si) => 
        s.transactions.map((tx, ti) => ({
          statementIndex: si,
          transactionIndex: ti,
          description: tx.description,
          vendor: tx.vendor,
        }))
      );
      
      const total = txsToRecategorize.length;
      setRecategorizeProgress({ current: 0, total });
      
      // Process in smaller batches with progress updates
      const BATCH_SIZE = 5;
      const allCategories: (string | null)[] = [];
      
      for (let i = 0; i < txsToRecategorize.length; i += BATCH_SIZE) {
        const batch = txsToRecategorize.slice(i, i + BATCH_SIZE);
        const batchCategories = await batchCategorizeWithLLM(
          batch.map(t => ({ description: t.description, vendor: t.vendor }))
        );
        allCategories.push(...batchCategories);
        setRecategorizeProgress({ current: Math.min(i + BATCH_SIZE, total), total });
      }
      
      // Update statements with new categories
      setStatements(prev => {
        const updated = [...prev];
        txsToRecategorize.forEach((tx, i) => {
          const newCat = allCategories[i];
          if (newCat) {
            updated[tx.statementIndex] = {
              ...updated[tx.statementIndex],
              transactions: updated[tx.statementIndex].transactions.map((t, ti) =>
                ti === tx.transactionIndex ? { ...t, category: newCat } : t
              ),
            };
          }
        });
        return updated;
      });
    } catch (err) {
      console.error('Re-categorization failed:', err);
    } finally {
      setIsLoading(false);
      setRecategorizeProgress(null);
    }
  }, [statements]);

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
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
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

        {statements.length === 0 ? (
          <div className="max-w-xl mx-auto">
            <FileUpload
              onFilesSelected={handleFilesSelected}
              isLoading={isLoading}
            />
            <div className="mt-8 text-center text-sm text-gray-500">
              <p className="font-medium mb-2">Privacy First</p>
              <p>
                All processing happens in your browser. Your files never leave
                your device.
              </p>
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
                      transactions={allTransactions} 
                      onPeriodClick={setPeriodFilter}
                      selectedPeriod={periodFilter}
                    />
                    <CategoryPieChart 
                      data={categoryTotals} 
                      onCategoryClick={setCategoryFilter}
                      selectedCategory={categoryFilter}
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <NetFlowTrend transactions={allTransactions} />
                    </div>
                    <ExpenseInsights transactions={allTransactions} />
                  </div>

                  {/* AI Categorization */}
                  <LLMStatus 
                    onCategorizeAll={handleRecategorizeAll} 
                    recategorizeProgress={recategorizeProgress}
                  />

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
