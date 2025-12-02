import { CreditCard, Building2, Check, Calendar } from 'lucide-react';
import type { StatementInfo } from '../types';

interface FileSidebarProps {
  statements: StatementInfo[];
  selectedFiles: Set<string>;
  onToggleFile: (filename: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPeriod(start: Date): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
}

// Categories that are internal transfers (not real expenses)
const INTERNAL_TRANSFER_CATEGORIES = ['Credit Card Payment', 'Investments', 'Savings'];

function getFileStats(statement: StatementInfo) {
  const inflow = statement.transactions
    .filter((t) => t.amount > 0 && !INTERNAL_TRANSFER_CATEGORIES.includes(t.category || ''))
    .reduce((sum, t) => sum + t.amount, 0);
  const outflow = statement.transactions
    .filter((t) => t.amount < 0 && !INTERNAL_TRANSFER_CATEGORIES.includes(t.category || ''))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return { inflow, outflow, count: statement.transactions.length };
}

// Get date range string
function getDateRange(statements: StatementInfo[]): string {
  if (statements.length === 0) return '';
  const sorted = [...statements].sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return `${formatPeriod(first.periodStart)} - ${formatPeriod(last.periodEnd)}`;
}

export function FileSidebar({
  statements,
  selectedFiles,
  onToggleFile,
  onSelectAll,
  onSelectNone,
}: FileSidebarProps) {
  // Group by type
  const bankStatements = statements.filter((s) => s.type === 'bank');
  const cardStatements = statements.filter((s) => s.type === 'credit_card');

  // Sort by period (newest first for easier access)
  const sortByPeriod = (a: StatementInfo, b: StatementInfo) =>
    b.periodStart.getTime() - a.periodStart.getTime();

  const allSelected = selectedFiles.size === statements.length;
  const noneSelected = selectedFiles.size === 0;

  // Calculate totals for selected files (excluding internal transfers)
  const selectedStatements = statements.filter((s) => selectedFiles.has(s.filename));
  const allSelectedTx = selectedStatements.flatMap((s) => s.transactions);
  const totalInflow = allSelectedTx
    .filter((t) => t.amount > 0 && !INTERNAL_TRANSFER_CATEGORIES.includes(t.category || ''))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalOutflow = allSelectedTx
    .filter((t) => t.amount < 0 && !INTERNAL_TRANSFER_CATEGORIES.includes(t.category || ''))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <div className="w-72 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-[calc(100vh-8rem)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Statements</h2>
          <span className="text-xs bg-white px-2 py-0.5 rounded-full text-gray-600 shadow-sm">
            {selectedFiles.size}/{statements.length}
          </span>
        </div>
        {statements.length > 0 && (
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
            <Calendar className="w-3 h-3" />
            {getDateRange(statements)}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onSelectAll}
            disabled={allSelected}
            className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Select All
          </button>
          <button
            onClick={onSelectNone}
            disabled={noneSelected}
            className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Scrollable file list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Bank Statements */}
        {bankStatements.length > 0 && (
          <div className="p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Building2 className="w-3.5 h-3.5" />
              Bank ({bankStatements.length})
            </div>
            <div className="space-y-1">
              {bankStatements.sort(sortByPeriod).map((statement) => {
                const stats = getFileStats(statement);
                const isSelected = selectedFiles.has(statement.filename);
                return (
                  <button
                    key={statement.filename}
                    onClick={() => onToggleFile(statement.filename)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-200 shadow-sm'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {formatPeriod(statement.periodStart)}
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="text-green-600 font-medium">
                        +{formatCurrency(stats.inflow)}
                      </span>
                      <span className="text-red-600 font-medium">
                        -{formatCurrency(stats.outflow)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {stats.count} transactions
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Credit Card Statements */}
        {cardStatements.length > 0 && (
          <div className="p-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <CreditCard className="w-3.5 h-3.5" />
              Credit Card ({cardStatements.length})
            </div>
            <div className="space-y-1">
              {cardStatements.sort(sortByPeriod).map((statement) => {
                const stats = getFileStats(statement);
                const isSelected = selectedFiles.has(statement.filename);
                return (
                  <button
                    key={statement.filename}
                    onClick={() => onToggleFile(statement.filename)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 ${
                      isSelected
                        ? 'bg-purple-50 border border-purple-200 shadow-sm'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {formatPeriod(statement.periodStart)}
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="text-red-600 font-medium">
                        -{formatCurrency(stats.outflow)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {stats.count} transactions
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Summary footer - shows selected totals */}
      <div className="p-3 border-t border-gray-200 bg-gray-50/80 backdrop-blur-sm">
        <div className="text-xs font-medium text-gray-600 mb-2">Selected Summary</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-green-50 rounded-lg p-2">
            <div className="text-xs text-green-600">Income</div>
            <div className="text-sm font-semibold text-green-700">
              {formatCurrency(totalInflow)}
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-2">
            <div className="text-xs text-red-600">Expenses</div>
            <div className="text-sm font-semibold text-red-700">
              {formatCurrency(totalOutflow)}
            </div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-gray-200">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Net Flow</span>
            <span className={`font-semibold ${totalInflow - totalOutflow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalInflow - totalOutflow)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
