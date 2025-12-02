import type { StatementInfo, Transaction } from '../types';

const DB_NAME = 'sonar-ledger';
const DB_VERSION = 1;
const STORE_NAME = 'app';
const STATEMENTS_KEY = 'statements';

type SerializableTransaction = Omit<Transaction, 'date'> & { date: string };
type SerializableStatement = Omit<StatementInfo, 'periodStart' | 'periodEnd' | 'transactions'> & {
  periodStart: string;
  periodEnd: string;
  transactions: SerializableTransaction[];
};

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    throw new Error('IndexedDB is not available in this environment');
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function serializeStatement(statement: StatementInfo): SerializableStatement {
  return {
    ...statement,
    periodStart: statement.periodStart.toISOString(),
    periodEnd: statement.periodEnd.toISOString(),
    transactions: statement.transactions.map((transaction) => ({
      ...transaction,
      date: transaction.date.toISOString(),
    })),
  };
}

function deserializeStatement(statement: SerializableStatement): StatementInfo {
  return {
    ...statement,
    periodStart: new Date(statement.periodStart),
    periodEnd: new Date(statement.periodEnd),
    transactions: statement.transactions.map((transaction) => ({
      ...transaction,
      date: new Date(transaction.date),
    })),
  };
}

export async function loadPersistedStatements(): Promise<StatementInfo[]> {
  if (!isIndexedDBAvailable()) {
    return [];
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(STATEMENTS_KEY);

    request.onsuccess = () => {
      const raw = request.result as SerializableStatement[] | undefined;
      if (!raw) {
        resolve([]);
        return;
      }
      resolve(raw.map(deserializeStatement));
    };

    request.onerror = () => reject(request.error ?? new Error('Failed to read statements from IndexedDB'));
  });
}

export async function persistStatements(statements: StatementInfo[]): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  const db = await openDatabase();
  const serialized = statements.map(serializeStatement);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(serialized, STATEMENTS_KEY);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to persist statements to IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Persist transaction aborted'));
  });
}

export async function clearPersistedStatements(): Promise<void> {
  if (!isIndexedDBAvailable()) {
    return;
  }

  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(STATEMENTS_KEY);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear statements from IndexedDB'));
    tx.onabort = () => reject(tx.error ?? new Error('Clear transaction aborted'));
  });
}
