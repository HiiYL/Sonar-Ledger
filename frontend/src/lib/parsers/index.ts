/**
 * Bank Statement Parsers
 * 
 * This module provides a plugin-based architecture for parsing bank statements.
 * Each bank has its own parser that implements the BankParser interface.
 * 
 * To add support for a new bank:
 * 1. Create a new file (e.g., dbs.ts) implementing BankParser
 * 2. Register it in registry.ts
 * 
 * Example:
 * ```typescript
 * // dbs.ts
 * export class DBSParser implements BankParser {
 *   readonly bankId = 'dbs';
 *   readonly bankName = 'DBS Bank';
 *   // ... implement methods
 * }
 * 
 * // registry.ts
 * import { dbsParser } from './dbs';
 * this.register(dbsParser);
 * ```
 */

export * from './types';
export * from './categorizer';
export { parserRegistry } from './registry';
export { uobParser, UOBParser } from './uob';
