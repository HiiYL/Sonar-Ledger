import type { StatementInfo, Transaction } from '../types';

export type BackupTransaction = Omit<Transaction, 'date'> & { date: string };
export type BackupStatement = Omit<StatementInfo, 'periodStart' | 'periodEnd' | 'transactions'> & {
  periodStart: string;
  periodEnd: string;
  transactions: BackupTransaction[];
};

export type BackupData = {
  statements: BackupStatement[];
  userMappings: Record<string, string>;
  version: number;
  lastModified: string;
};

export function serializeBackupData(
  statements: StatementInfo[],
  userMappings: Map<string, string>
): BackupData {
  const serializedStatements: BackupStatement[] = statements.map((stmt) => ({
    ...stmt,
    periodStart: stmt.periodStart.toISOString(),
    periodEnd: stmt.periodEnd.toISOString(),
    transactions: stmt.transactions.map((tx) => ({
      ...tx,
      date: tx.date.toISOString(),
    })),
  }));

  return {
    statements: serializedStatements,
    userMappings: Object.fromEntries(userMappings),
    version: 1,
    lastModified: new Date().toISOString(),
  };
}

export function parseBackupData(data: BackupData): {
  statements: StatementInfo[];
  userMappings: Map<string, string>;
} {
  const parsedStatements: StatementInfo[] = data.statements.map((stmt) => ({
    ...stmt,
    periodStart: new Date(stmt.periodStart),
    periodEnd: new Date(stmt.periodEnd),
    transactions: stmt.transactions.map((tx) => ({
      ...tx,
      date: new Date(tx.date),
    })),
  }));

  return {
    statements: parsedStatements,
    userMappings: new Map(Object.entries(data.userMappings || {})),
  };
}
