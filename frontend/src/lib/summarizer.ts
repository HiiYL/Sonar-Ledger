import type { Transaction, MonthlySummary, StatementInfo } from '../types';

// Categories that represent internal transfers or asset movements (not consumption expenses)
const INTERNAL_TRANSFER_CATEGORIES = [
  'Credit Card Payment',  // Paying off credit card from bank
  'Investments',          // Moving money to investment accounts
  'Savings',              // Moving money to savings accounts
];

function isInternalTransfer(tx: Transaction): boolean {
  return INTERNAL_TRANSFER_CATEGORIES.includes(tx.category || '');
}

export function aggregateByMonth(statements: StatementInfo[]): MonthlySummary[] {
  const allTransactions = statements.flatMap((s) => s.transactions);
  const byMonth = new Map<string, Transaction[]>();

  for (const tx of allTransactions) {
    const monthKey = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, []);
    }
    byMonth.get(monthKey)!.push(tx);
  }

  const summaries: MonthlySummary[] = [];

  for (const [month, transactions] of byMonth) {
    const byCategory: Record<string, number> = {};
    let totalInflow = 0;
    let totalOutflow = 0;

    for (const tx of transactions) {
      // Skip internal transfers for totals
      if (isInternalTransfer(tx)) {
        continue;
      }
      
      if (tx.amount > 0) {
        totalInflow += tx.amount;
      } else {
        totalOutflow += Math.abs(tx.amount);
      }

      const cat = tx.category || 'Other';
      if (tx.amount < 0) {
        byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
      }
    }

    summaries.push({
      month,
      totalInflow,
      totalOutflow,
      netFlow: totalInflow - totalOutflow,
      transactionCount: transactions.length,
      byCategory,
    });
  }

  return summaries.sort((a, b) => a.month.localeCompare(b.month));
}

export function getTopMerchants(
  statements: StatementInfo[],
  limit = 10
): { merchant: string; total: number; count: number }[] {
  const allTransactions = statements.flatMap((s) => s.transactions);
  const merchantMap = new Map<string, { total: number; count: number }>();

  for (const tx of allTransactions) {
    if (tx.amount >= 0) continue; // Only count expenses
    if (isInternalTransfer(tx)) continue; // Skip internal transfers

    // Extract merchant name (first part of description)
    const merchant = tx.description.split(/\s+/).slice(0, 3).join(' ').toUpperCase();
    const existing = merchantMap.get(merchant) || { total: 0, count: 0 };
    merchantMap.set(merchant, {
      total: existing.total + Math.abs(tx.amount),
      count: existing.count + 1,
    });
  }

  return Array.from(merchantMap.entries())
    .map(([merchant, data]) => ({ merchant, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function getCategoryTotals(
  statements: StatementInfo[]
): { category: string; total: number }[] {
  const allTransactions = statements.flatMap((s) => s.transactions);
  const categoryMap = new Map<string, number>();

  for (const tx of allTransactions) {
    if (tx.amount >= 0) continue;
    if (isInternalTransfer(tx)) continue; // Skip internal transfers
    // Normalize category name - treat undefined/empty as "Other"
    let cat = (tx.category || 'Other').trim();
    if (!cat || cat === 'Other Spending') cat = 'Other';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Math.abs(tx.amount));
  }

  return Array.from(categoryMap.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export function getTotalStats(statements: StatementInfo[]): {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transactionCount: number;
  avgMonthlySpend: number;
  totalInvestments: number;
  totalSavings: number;
} {
  const summaries = aggregateByMonth(statements);
  const allTransactions = statements.flatMap((s) => s.transactions);
  
  const totalInflow = summaries.reduce((sum, s) => sum + s.totalInflow, 0);
  const totalOutflow = summaries.reduce((sum, s) => sum + s.totalOutflow, 0);
  const transactionCount = summaries.reduce((sum, s) => sum + s.transactionCount, 0);
  
  // Calculate asset transfers separately
  const totalInvestments = allTransactions
    .filter((tx) => tx.category === 'Investments' && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  
  const totalSavings = allTransactions
    .filter((tx) => tx.category === 'Savings' && tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return {
    totalInflow,
    totalOutflow,
    netFlow: totalInflow - totalOutflow,
    transactionCount,
    avgMonthlySpend: summaries.length > 0 ? totalOutflow / summaries.length : 0,
    totalInvestments,
    totalSavings,
  };
}
