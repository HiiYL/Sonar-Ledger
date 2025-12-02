import { useState } from 'react';
import { Search, Download, ChevronDown, ChevronUp } from 'lucide-react';
import type { Transaction } from '../types';

interface TransactionTableProps {
  transactions: Transaction[];
  initialCategoryFilter?: string;
  onCategoryFilterChange?: (category: string) => void;
  periodFilter?: string;
  onPeriodFilterChange?: (period: string) => void;
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
  onPeriodFilterChange
}: TransactionTableProps) {
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showCount, setShowCount] = useState(50);
  
  // Use external filter if provided, otherwise use internal state
  const [internalCategoryFilter, setInternalCategoryFilter] = useState('all');
  const categoryFilter = initialCategoryFilter || internalCategoryFilter;
  
  const handleCategoryChange = (value: string) => {
    setInternalCategoryFilter(value);
    onCategoryFilterChange?.(value === 'all' ? '' : value);
  };

  const categories = [...new Set(transactions.map((t) => t.category || 'Other'))].sort();

  // Helper to check if transaction matches period filter
  const matchesPeriod = (tx: Transaction, period: string): boolean => {
    if (!period) return true;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const txMonth = monthNames[tx.date.getMonth()];
    const txYear = tx.date.getFullYear().toString().slice(-2);
    const txPeriod = `${txMonth} ${txYear}`;
    return txPeriod === period || period.includes(txMonth);
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
    return matchesText && matchesCategory && matchesPeriodFilter;
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
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
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
                    <div className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity truncate max-w-[100px]">
                      {tx.sourceFile.replace(/\.[^/.]+$/, '').slice(0, 20)}
                    </div>
                  )}
                </td>
                <td className="py-3 px-2 max-w-xs" title={tx.description}>
                  {tx.vendor ? (
                    <div>
                      <div className="font-medium truncate">{tx.vendor}</div>
                      <div className="text-xs text-gray-500 truncate">{tx.description}</div>
                    </div>
                  ) : (
                    <span className="truncate block">{tx.description}</span>
                  )}
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
