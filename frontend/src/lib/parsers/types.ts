import type { Transaction, StatementInfo } from '../../types';

// Bank identifier
export type BankId = 'uob' | 'dbs' | 'ocbc' | 'hsbc' | 'sc' | 'unknown';

// Statement type
export type StatementType = 'bank' | 'credit_card';

// Parser detection result
export interface ParserDetectionResult {
  bank: BankId;
  type: StatementType;
  confidence: number; // 0-1, how confident we are in the detection
}

// Period extraction result
export interface StatementPeriod {
  start: Date;
  end: Date;
}

// Parser interface that all bank parsers must implement
export interface BankParser {
  // Unique identifier for this parser
  readonly bankId: BankId;
  
  // Human-readable name
  readonly bankName: string;
  
  // Check if this parser can handle the given PDF text
  // Returns confidence score (0-1), 0 means cannot handle
  canParse(firstPageText: string): number;
  
  // Detect statement type (bank account vs credit card)
  detectStatementType(text: string): StatementType;
  
  // Extract the statement period
  extractPeriod(text: string): StatementPeriod;
  
  // Parse transactions from the PDF pages
  parseTransactions(
    pages: string[],
    type: StatementType,
    period: StatementPeriod
  ): Transaction[];
}

// Parser registry
export interface ParserRegistry {
  parsers: BankParser[];
  
  // Find the best parser for a given PDF
  findParser(firstPageText: string): BankParser | null;
  
  // Register a new parser
  register(parser: BankParser): void;
}

// Re-export for convenience
export type { Transaction, StatementInfo };
