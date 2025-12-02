import { useState, useMemo } from 'react';
import { Search, Download, ChevronDown, ChevronUp, Calendar, RefreshCw } from 'lucide-react';
import type { Transaction } from '../types';

// Detect recurring transactions (same vendor/description, similar amounts, multiple occurrences)
interface RecurringPattern {
  key: string;
  vendor: string;
  avgAmount: number;
  count: number;
  frequency: 'weekly' | 'monthly' | 'irregular';
  transactions: Transaction[];
}

function detectRecurringTransactions(transactions: Transaction[]): Map<string, RecurringPattern> {
  const patterns = new Map<string, RecurringPattern>();
  
  // Group by vendor or description prefix
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // Only expenses
    const key = tx.vendor?.toLowerCase() || tx.description.toLowerCase().slice(0, 20);
    if (!key || key.length < 3) continue;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(tx);
  }
  
  // Identify recurring patterns (3+ occurrences with similar amounts)
  for (const [key, txs] of groups) {
    if (txs.length < 3) continue;
    
    const amounts = txs.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    
    // If amounts are consistent (low variance relative to average)
    if (stdDev / avgAmount < 0.3 || stdDev < 5) {
      // Determine frequency
      const sortedDates = txs.map((t) => t.date.getTime()).sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push((sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
      
      let frequency: 'weekly' | 'monthly' | 'irregular' = 'irregular';
      if (avgGap >= 5 && avgGap <= 10) frequency = 'weekly';
      else if (avgGap >= 25 && avgGap <= 35) frequency = 'monthly';
      
      patterns.set(key, {
        key,
        vendor: txs[0].vendor || txs[0].description.slice(0, 30),
        avgAmount,
        count: txs.length,
        frequency,
        transactions: txs,
      });
    }
  }
  
  return patterns;
}

interface TransactionTableProps {
  transactions: Transaction[];
  initialCategoryFilter?: string;
  onCategoryFilterChange?: (category: string) => void;
  periodFilter?: string;
  onPeriodFilterChange?: (period: string) => void;
  sourceFileFilter?: string;
  onSourceFileFilterChange?: (file: string) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    signDisplay: 'always',
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

// Category colors for visual distinction
const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': 'bg-orange-100 text-orange-700',
  'Transport': 'bg-blue-100 text-blue-700',
  'Groceries': 'bg-green-100 text-green-700',
  'Shopping': 'bg-pink-100 text-pink-700',
  'Subscriptions': 'bg-purple-100 text-purple-700',
  'Entertainment': 'bg-indigo-100 text-indigo-700',
  'Bills': 'bg-yellow-100 text-yellow-700',
  'Tax': 'bg-red-100 text-red-700',
  'Investments': 'bg-emerald-100 text-emerald-700',
  'Savings': 'bg-teal-100 text-teal-700',
  'Income': 'bg-green-100 text-green-700',
  'Transfers': 'bg-gray-100 text-gray-700',
  'P2P Transfers': 'bg-slate-100 text-slate-700',
  'Rent': 'bg-amber-100 text-amber-700',
  'Credit Card Payment': 'bg-violet-100 text-violet-700',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-700';
}

function exportToCSV(transactions: Transaction[]) {
  const headers = ['Date', 'Description', 'Vendor', 'Category', 'Source', 'Amount'];
  const rows = transactions.map((tx) => [
    tx.date.toISOString().split('T')[0],
    `"${tx.description.replace(/"/g, '""')}"`,
    tx.vendor || '',
    tx.category || 'Other',
    tx.source,
    tx.amount.toFixed(2),
  ]);
  
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type SortField = 'date' | 'amount' | 'category';
type SortDir = 'asc' | 'desc';

export function TransactionTable({ 
  transactions, 
  initialCategoryFilter = '',
  onCategoryFilterChange,
  periodFilter = '',
  onPeriodFilterChange,
  sourceFileFilter = '',
  onSourceFileFilterChange
}: TransactionTableProps) {
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showCount, setShowCount] = useState(50);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showRecurringOnly, setShowRecurringOnly] = useState(false);
  
  // Use external filter if provided, otherwise use internal state
  const [internalCategoryFilter, setInternalCategoryFilter] = useState('all');
  const categoryFilter = initialCategoryFilter || internalCategoryFilter;
  
  const handleCategoryChange = (value: string) => {
    setInternalCategoryFilter(value);
    onCategoryFilterChange?.(value === 'all' ? '' : value);
  };

  const categories = [...new Set(transactions.map((t) => t.category || 'Other'))].sort();

  // Detect recurring transactions
  const recurringPatterns = useMemo(() => detectRecurringTransactions(transactions), [transactions]);
  const recurringTxIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pattern of recurringPatterns.values()) {
      for (const tx of pattern.transactions) {
        ids.add(`${tx.date.getTime()}-${tx.amount}-${tx.description}`);
      }
    }
    return ids;
  }, [recurringPatterns]);

  const isRecurring = (tx: Transaction): boolean => {
    return recurringTxIds.has(`${tx.date.getTime()}-${tx.amount}-${tx.description}`);
  };

  // Helper to check if transaction matches period filter
  const matchesPeriod = (tx: Transaction, period: string): boolean => {
    if (!period) return true;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const txMonth = monthNames[tx.date.getMonth()];
    const txYear = tx.date.getFullYear().toString().slice(-2);
    const txPeriod = `${txMonth} ${txYear}`;
    return txPeriod === period || period.includes(txMonth);
  };

  // Helper to check date range
  const matchesDateRange = (tx: Transaction): boolean => {
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (tx.date < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (tx.date > to) return false;
    }
    return true;
  };

  const filtered = transactions.filter((t) => {
    const searchText = filter.toLowerCase();
    const matchesText = 
      t.description.toLowerCase().includes(searchText) ||
      (t.vendor?.toLowerCase().includes(searchText) ?? false) ||
      (t.category?.toLowerCase().includes(searchText) ?? false);
    const matchesCategory =
      categoryFilter === 'all' || t.category === categoryFilter;
    const matchesPeriodFilter = matchesPeriod(t, periodFilter);
    const matchesDate = matchesDateRange(t);
    const matchesRecurring = !showRecurringOnly || isRecurring(t);
    const matchesSourceFile = !sourceFileFilter || t.sourceFile === sourceFileFilter;
    return matchesText && matchesCategory && matchesPeriodFilter && matchesDate && matchesRecurring && matchesSourceFile;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'date':
        cmp = a.date.getTime() - b.date.getTime();
        break;
      case 'amount':
        cmp = a.amount - b.amount;
        break;
      case 'category':
        cmp = (a.category || '').localeCompare(b.category || '');
        break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronDown className="w-3 h-3 inline opacity-30" />;
    }
    return sortDir === 'desc' ? 
      <ChevronDown className="w-4 h-4 inline text-blue-600" /> : 
      <ChevronUp className="w-4 h-4 inline text-blue-600" />;
  };

  // Calculate filtered totals
  const filteredIncome = sorted.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const filteredExpenses = sorted.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search transactions, vendors, categories..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          onClick={() => exportToCSV(sorted)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Date range and recurring filter */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="From"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="To"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-gray-400 hover:text-gray-600"
              title="Clear dates"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={() => setShowRecurringOnly(!showRecurringOnly)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            showRecurringOnly 
              ? 'bg-purple-100 text-purple-700' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          Recurring ({recurringPatterns.size})
        </button>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
        <span className="text-gray-500">
          {sorted.length} transactions
        </span>
        <span className="text-green-600">
          Income: {formatCurrency(filteredIncome)}
        </span>
        <span className="text-red-600">
          Expenses: {formatCurrency(filteredExpenses)}
        </span>
        {(categoryFilter && categoryFilter !== 'all') && (
          <button
            onClick={() => handleCategoryChange('all')}
            className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium hover:bg-blue-200"
          >
            {categoryFilter}
            <span className="ml-1">×</span>
          </button>
        )}
        {periodFilter && (
          <button
            onClick={() => onPeriodFilterChange?.('')}
            className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium hover:bg-purple-200"
          >
            {periodFilter}
            <span className="ml-1">×</span>
          </button>
        )}
        {sourceFileFilter && (
          <button
            onClick={() => onSourceFileFilterChange?.('')}
            className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium hover:bg-amber-200"
          >
            📄 {sourceFileFilter.replace(/\.[^/.]+$/, '').slice(0, 20)}
            <span className="ml-1">×</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th 
                className="text-left py-3 px-2 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('date')}
              >
                Date <SortIcon field="date" />
              </th>
              <th className="text-left py-3 px-2 font-medium text-gray-600">
                Vendor/Description
              </th>
              <th 
                className="text-left py-3 px-2 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('category')}
              >
                Category <SortIcon field="category" />
              </th>
              <th className="text-left py-3 px-2 font-medium text-gray-600">
                Source
              </th>
              <th 
                className="text-right py-3 px-2 font-medium text-gray-600 cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('amount')}
              >
                Amount <SortIcon field="amount" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, showCount).map((tx, i) => (
              <tr 
                key={i} 
                className="border-b border-gray-100 hover:bg-blue-50 group transition-colors"
                title={tx.sourceFile ? `From: ${tx.sourceFile}` : undefined}
              >
                <td className="py-3 px-2 whitespace-nowrap">
                  <div>{formatDate(tx.date)}</div>
                  {tx.sourceFile && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSourceFileFilterChange?.(tx.sourceFile!);
                      }}
                      className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[100px] hover:text-blue-600 hover:underline cursor-pointer"
                      title={`Filter by: ${tx.sourceFile}`}
                    >
                      {tx.sourceFile.replace(/\.[^/.]+$/, '').slice(0, 20)}
                    </button>
                  )}
                </td>
                <td className="py-3 px-2 max-w-xs" title={tx.description}>
                  <div className="flex items-start gap-2">
                    {isRecurring(tx) && (
                      <span className="flex-shrink-0 mt-0.5" title="Recurring transaction">
                        <RefreshCw className="w-3 h-3 text-purple-500" />
                      </span>
                    )}
                    <div className="min-w-0">
                      {tx.vendor ? (
                        <>
                          <div className="font-medium truncate">{tx.vendor}</div>
                          <div className="text-xs text-gray-500 truncate">{tx.description}</div>
                        </>
                      ) : (
                        <span className="truncate block">{tx.description}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2">
                  <button
                    onClick={() => handleCategoryChange(tx.category || 'Other')}
                    className={`px-2 py-1 rounded-full text-xs font-medium hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all ${getCategoryColor(tx.category || 'Other')}`}
                  >
                    {tx.category || 'Other'}
                  </button>
                </td>
                <td className="py-3 px-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      tx.source === 'bank'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {tx.source === 'bank' ? 'Bank' : 'Card'}
                  </span>
                </td>
                <td
                  className={`py-3 px-2 text-right font-medium whitespace-nowrap ${
                    tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > showCount && (
          <div className="text-center mt-4">
            <button
              onClick={() => setShowCount((c) => c + 50)}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Load more ({sorted.length - showCount} remaining)
            </button>
          </div>
        )}
        {sorted.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No transactions match your search
          </p>
        )}
      </div>
    </div>
  );
}
