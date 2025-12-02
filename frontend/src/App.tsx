import { useState, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { StatsCards } from './components/StatsCards';
import {
  SpendChart,
  CategoryPieChart,
  NetFlowTrend,
  TopSpending,
} from './components/Charts';
import { TransactionTable } from './components/TransactionTable';
import { FileSidebar } from './components/FileSidebar';
import { parseStatement } from './lib/pdfParser';
import {
  getCategoryTotals,
  getTotalStats,
} from './lib/summarizer';
import type { StatementInfo } from './types';
import { FileText, RefreshCw } from 'lucide-react';

function App() {
  const [statements, setStatements] = useState<StatementInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<string>('');

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Finance Summarizer
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
                    <TopSpending transactions={allTransactions} limit={8} />
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
