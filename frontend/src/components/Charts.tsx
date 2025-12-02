import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  ReferenceLine,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import type { Transaction } from '../types';

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

// Categories to exclude from expense calculations
const INTERNAL_TRANSFER_CATEGORIES = ['Credit Card Payment', 'Investments', 'Savings'];

type TimeGrouping = 'day' | 'week' | 'month';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
  }).format(value);
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function getDateKey(date: Date, grouping: TimeGrouping): { key: string; sortKey: number } {
  switch (grouping) {
    case 'day':
      return {
        key: `${date.getMonth() + 1}/${date.getDate()}`,
        sortKey: date.getTime(),
      };
    case 'week':
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
      return {
        key: `W${week}`,
        sortKey: date.getFullYear() * 100 + week,
      };
    case 'month':
    default:
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        key: `${monthNames[date.getMonth()]} ${date.getFullYear().toString().slice(-2)}`,
        sortKey: date.getFullYear() * 100 + date.getMonth(),
      };
  }
}

function groupTransactions(transactions: Transaction[], grouping: TimeGrouping) {
  const groups = new Map<string, { income: number; expenses: number; sortKey: number }>();

  for (const tx of transactions) {
    // Skip internal transfers
    if (INTERNAL_TRANSFER_CATEGORIES.includes(tx.category || '')) continue;

    const { key, sortKey } = getDateKey(tx.date, grouping);

    if (!groups.has(key)) {
      groups.set(key, { income: 0, expenses: 0, sortKey });
    }

    const group = groups.get(key)!;
    if (tx.amount > 0) {
      group.income += tx.amount;
    } else {
      group.expenses += Math.abs(tx.amount);
    }
  }

  // Sort by sortKey
  return Array.from(groups.entries())
    .sort((a, b) => a[1].sortKey - b[1].sortKey)
    .map(([label, data]) => ({
      label,
      income: Math.round(data.income),
      expenses: Math.round(data.expenses),
      net: Math.round(data.income - data.expenses),
    }));
}

interface SpendChartProps {
  transactions: Transaction[];
  onPeriodClick?: (period: string) => void;
  selectedPeriod?: string;
}

export function SpendChart({ transactions, onPeriodClick, selectedPeriod }: SpendChartProps) {
  const [grouping, setGrouping] = useState<TimeGrouping>('month');
  
  const chartData = groupTransactions(transactions, grouping);

  const handleBarClick = (data: { label: string }) => {
    if (onPeriodClick) {
      onPeriodClick(selectedPeriod === data.label ? '' : data.label);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Cash Flow</h3>
          {selectedPeriod && (
            <button
              onClick={() => onPeriodClick?.('')}
              className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium hover:bg-blue-200"
            >
              {selectedPeriod}
              <span>×</span>
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['day', 'week', 'month'] as TimeGrouping[]).map((g) => (
            <button
              key={g}
              onClick={() => setGrouping(g)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                grouping === g
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} onClick={(e) => e?.activeLabel && handleBarClick({ label: e.activeLabel as string })}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Bar 
            dataKey="income" 
            fill="#22c55e" 
            name="Income" 
            radius={[4, 4, 0, 0]} 
            cursor="pointer"
            opacity={selectedPeriod ? 0.5 : 1}
          >
            {chartData.map((entry) => (
              <Cell 
                key={entry.label} 
                opacity={!selectedPeriod || selectedPeriod === entry.label ? 1 : 0.3}
              />
            ))}
          </Bar>
          <Bar 
            dataKey="expenses" 
            fill="#ef4444" 
            name="Expenses" 
            radius={[4, 4, 0, 0]}
            cursor="pointer"
          >
            {chartData.map((entry) => (
              <Cell 
                key={entry.label} 
                opacity={!selectedPeriod || selectedPeriod === entry.label ? 1 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CategoryChartProps {
  data: { category: string; total: number }[];
  onCategoryClick?: (category: string) => void;
  selectedCategory?: string;
  periodFilter?: string;
}

export function CategoryPieChart({ data, onCategoryClick, selectedCategory, periodFilter }: CategoryChartProps) {
  // First, merge any "Other" categories together
  const mergedData = new Map<string, number>();
  for (const item of data) {
    const cat = item.category || 'Other';
    mergedData.set(cat, (mergedData.get(cat) || 0) + item.total);
  }
  
  // Convert back to array and sort
  const sortedData = Array.from(mergedData.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
  
  // Take top 8 categories, group rest as "Other (misc)"
  const topCategories = sortedData.filter(d => d.category !== 'Other').slice(0, 8);
  const otherCategories = sortedData.filter(d => 
    d.category === 'Other' || !topCategories.find(t => t.category === d.category)
  );
  const otherTotal = otherCategories.reduce((sum, d) => sum + d.total, 0);
  
  const chartData = otherTotal > 0 
    ? [...topCategories, { category: 'Other', total: otherTotal }]
    : topCategories;

  const handleClick = (category: string) => {
    if (onCategoryClick) {
      // Toggle: if already selected, clear filter
      onCategoryClick(selectedCategory === category ? '' : category);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Spending by Category</h3>
          {periodFilter && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              {periodFilter}
            </span>
          )}
        </div>
        {selectedCategory && (
          <button
            onClick={() => onCategoryClick?.('')}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="flex flex-col lg:flex-row items-center gap-4">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="total"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              onClick={(_, index) => handleClick(chartData[index].category)}
              style={{ cursor: 'pointer' }}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={index} 
                  fill={COLORS[index % COLORS.length]}
                  opacity={selectedCategory && selectedCategory !== entry.category ? 0.3 : 1}
                  stroke={selectedCategory === entry.category ? '#000' : 'none'}
                  strokeWidth={selectedCategory === entry.category ? 2 : 0}
                />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Legend - clickable */}
        <div className="flex flex-wrap lg:flex-col gap-1 justify-center">
          {chartData.map((item, index) => (
            <button
              key={item.category}
              onClick={() => handleClick(item.category)}
              className={`flex items-center gap-2 text-sm px-2 py-1 rounded-lg transition-colors text-left ${
                selectedCategory === item.category 
                  ? 'bg-gray-100' 
                  : 'hover:bg-gray-50'
              } ${selectedCategory && selectedCategory !== item.category ? 'opacity-50' : ''}`}
            >
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0" 
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-gray-700 truncate max-w-[100px]">{item.category}</span>
              <span className="text-gray-400 text-xs ml-auto">
                {formatCurrency(item.total)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Combined Expense Insights with tabs
interface ExpenseInsightsProps {
  transactions: Transaction[];
}

export function ExpenseInsights({ transactions }: ExpenseInsightsProps) {
  const [activeTab, setActiveTab] = useState<'largest' | 'recurring'>('largest');

  // Top expenses
  const topExpenses = useMemo(() => 
    [...transactions]
      .filter((tx) => tx.amount < 0 && !INTERNAL_TRANSFER_CATEGORIES.includes(tx.category || ''))
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 6),
    [transactions]
  );

  const topTotal = topExpenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const allExpenses = transactions
    .filter((tx) => tx.amount < 0 && !INTERNAL_TRANSFER_CATEGORIES.includes(tx.category || ''))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const topPercentage = allExpenses > 0 ? (topTotal / allExpenses) * 100 : 0;

  // Recurring patterns
  const patterns = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    
    for (const tx of transactions) {
      if (tx.amount >= 0) continue;
      const key = tx.vendor?.toLowerCase() || tx.description.toLowerCase().slice(0, 20);
      if (!key || key.length < 3) continue;
      
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }
    
    const result: Array<{
      vendor: string;
      avgAmount: number;
      count: number;
      frequency: string;
      monthlyEstimate: number;
    }> = [];
    
    for (const [, txs] of groups) {
      if (txs.length < 3) continue;
      
      const amounts = txs.map((t) => Math.abs(t.amount));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);
      
      if (stdDev / avgAmount < 0.3 || stdDev < 5) {
        const sortedDates = txs.map((t) => t.date.getTime()).sort((a, b) => a - b);
        const gaps: number[] = [];
        for (let i = 1; i < sortedDates.length; i++) {
          gaps.push((sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24));
        }
        const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 30;
        
        let frequency = 'irregular';
        let monthlyEstimate = avgAmount;
        if (avgGap >= 5 && avgGap <= 10) {
          frequency = 'weekly';
          monthlyEstimate = avgAmount * 4;
        } else if (avgGap >= 25 && avgGap <= 35) {
          frequency = 'monthly';
          monthlyEstimate = avgAmount;
        }
        
        result.push({
          vendor: txs[0].vendor || txs[0].description.slice(0, 25),
          avgAmount,
          count: txs.length,
          frequency,
          monthlyEstimate,
        });
      }
    }
    
    return result.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
  }, [transactions]);

  const totalMonthly = patterns.reduce((sum, p) => sum + p.monthlyEstimate, 0);

  if (topExpenses.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 h-full flex flex-col">
      {/* Tabs */}
      <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('largest')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'largest'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Largest
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'recurring'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Recurring {patterns.length > 0 && `(${patterns.length})`}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'largest' ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Top expenses</span>
              <span className="text-xs text-gray-500">{topPercentage.toFixed(0)}% of total</span>
            </div>
            <div className="space-y-2">
              {topExpenses.map((tx, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {tx.vendor || tx.description.slice(0, 25)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {tx.date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-red-600 whitespace-nowrap ml-2">
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-gray-900">{formatCurrency(-topTotal)}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {patterns.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Detected subscriptions</span>
                  <span className="text-xs text-gray-500">~{formatCurrency(totalMonthly)}/mo</span>
                </div>
                <div className="space-y-2">
                  {patterns.slice(0, 6).map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.vendor}</p>
                        <p className="text-xs text-gray-500">
                          {p.frequency} · {p.count}×
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-700 whitespace-nowrap ml-2">
                        {formatCurrency(-p.avgAmount)}
                      </span>
                    </div>
                  ))}
                </div>
                {patterns.length > 6 && (
                  <p className="text-xs text-gray-400 mt-2">
                    +{patterns.length - 6} more
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No recurring expenses detected
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}


interface NetFlowTrendProps {
  transactions: Transaction[];
  selectedPeriod?: string;
  onPeriodClick?: (period: string) => void;
}

export function NetFlowTrend({ transactions, selectedPeriod, onPeriodClick }: NetFlowTrendProps) {
  const [grouping, setGrouping] = useState<TimeGrouping>('month');
  
  const chartData = groupTransactions(transactions, grouping);
  
  // Calculate cumulative savings
  let cumulative = 0;
  const cumulativeData = chartData.map((d) => {
    cumulative += d.net;
    return { ...d, cumulative };
  });

  const handleClick = (data: { label: string }) => {
    if (onPeriodClick) {
      onPeriodClick(selectedPeriod === data.label ? '' : data.label);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Net Flow & Cumulative Savings</h3>
          {selectedPeriod && (
            <button
              onClick={() => onPeriodClick?.('')}
              className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium hover:bg-blue-200"
            >
              {selectedPeriod}
              <span>×</span>
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['day', 'week', 'month'] as TimeGrouping[]).map((g) => (
            <button
              key={g}
              onClick={() => setGrouping(g)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                grouping === g
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart 
          data={cumulativeData}
          onClick={(e) => e?.activeLabel && handleClick({ label: e.activeLabel as string })}
        >
          <defs>
            <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
          <Tooltip 
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'cumulative' ? 'Cumulative' : 'Net Flow'
            ]} 
          />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#colorCumulative)"
            name="Cumulative"
            style={{ cursor: 'pointer' }}
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 3 }}
            name="Net Flow"
            style={{ cursor: 'pointer' }}
          />
          <Legend />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Cumulative wealth chart
interface CumulativeChartProps {
  transactions: Transaction[];
}

export function CumulativeWealthChart({ transactions }: CumulativeChartProps) {
  // Sort transactions by date and calculate cumulative
  const sorted = [...transactions]
    .filter((tx) => !INTERNAL_TRANSFER_CATEGORIES.includes(tx.category || ''))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  
  let cumulative = 0;
  const data = sorted.map((tx) => {
    cumulative += tx.amount;
    return {
      date: tx.date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' }),
      value: cumulative,
    };
  });

  // Sample to avoid too many points
  const sampled = data.length > 100 
    ? data.filter((_, i) => i % Math.ceil(data.length / 100) === 0)
    : data;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold mb-4">Cumulative Cash Flow</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={sampled}>
          <defs>
            <linearGradient id="colorWealth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#colorWealth)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
