export interface Transaction {
  date: Date;
  description: string;
  amount: number; // positive = inflow, negative = outflow
  balance?: number;
  category?: string;
  categorySource?: 'rules' | 'user' | 'ai'; // How the category was assigned
  vendor?: string; // Extracted vendor/merchant name (especially for PayNow)
  source: 'bank' | 'credit_card';
  sourceFile?: string; // Original filename this transaction came from
  rawText: string;
  hidden?: boolean; // If true, exclude from AI categorization and optionally from display
}

export interface StatementInfo {
  filename: string;
  type: 'bank' | 'credit_card';
  periodStart: Date;
  periodEnd: Date;
  transactions: Transaction[];
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transactionCount: number;
  byCategory: Record<string, number>;
}
