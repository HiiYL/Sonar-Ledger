import { TrendingUp, TrendingDown, Wallet, LineChart, Percent } from 'lucide-react';

interface StatsCardsProps {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  avgMonthlySpend: number;
  totalInvestments?: number;
  totalSavings?: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
  }).format(amount);
}

export function StatsCards({
  totalInflow,
  totalOutflow,
  netFlow,
  avgMonthlySpend,
  totalInvestments = 0,
  totalSavings = 0,
}: StatsCardsProps) {
  const totalAssetTransfers = totalInvestments + totalSavings;
  const savingsRate = totalInflow > 0 ? ((netFlow + totalAssetTransfers) / totalInflow) * 100 : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Income */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-green-600 mb-1">
          <TrendingUp className="w-4 h-4" />
          <span className="text-xs font-medium">Income</span>
        </div>
        <p className="text-xl font-bold text-gray-900">{formatCurrency(totalInflow)}</p>
      </div>

      {/* Expenses */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-red-600 mb-1">
          <TrendingDown className="w-4 h-4" />
          <span className="text-xs font-medium">Expenses</span>
        </div>
        <p className="text-xl font-bold text-gray-900">{formatCurrency(totalOutflow)}</p>
      </div>

      {/* Investments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-indigo-600 mb-1">
          <LineChart className="w-4 h-4" />
          <span className="text-xs font-medium">Invested</span>
        </div>
        <p className="text-xl font-bold text-gray-900">{formatCurrency(totalAssetTransfers)}</p>
      </div>

      {/* Net Flow */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-gray-600 mb-1">
          <Wallet className="w-4 h-4" />
          <span className="text-xs font-medium">Net Flow</span>
        </div>
        <p className={`text-xl font-bold ${netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(netFlow)}
        </p>
      </div>

      {/* Avg Monthly */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-gray-600 mb-1">
          <TrendingDown className="w-4 h-4" />
          <span className="text-xs font-medium">Avg/Month</span>
        </div>
        <p className="text-xl font-bold text-gray-900">{formatCurrency(avgMonthlySpend)}</p>
      </div>

      {/* Savings Rate */}
      <div className={`rounded-xl shadow-sm border p-4 ${savingsRate >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className={`flex items-center gap-2 mb-1 ${savingsRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          <Percent className="w-4 h-4" />
          <span className="text-xs font-medium">Savings Rate</span>
        </div>
        <p className={`text-xl font-bold ${savingsRate >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {savingsRate.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}
