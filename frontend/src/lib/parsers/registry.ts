import type { BankParser, ParserRegistry } from './types';
import { uobParser } from './uob';

/**
 * Parser Registry
 * Manages all available bank parsers and finds the best one for a given PDF
 */
class ParserRegistryImpl implements ParserRegistry {
  parsers: BankParser[] = [];

  constructor() {
    // Register default parsers
    this.register(uobParser);
    
    // Add more parsers here as they are implemented:
    // this.register(dbsParser);
    // this.register(ocbcParser);
    // this.register(hsbcParser);
  }

  register(parser: BankParser): void {
    // Check for duplicate
    const existing = this.parsers.find(p => p.bankId === parser.bankId);
    if (existing) {
      console.warn(`Parser for ${parser.bankId} already registered, replacing...`);
      this.parsers = this.parsers.filter(p => p.bankId !== parser.bankId);
    }
    this.parsers.push(parser);
  }

  findParser(firstPageText: string): BankParser | null {
    let bestParser: BankParser | null = null;
    let bestConfidence = 0;

    for (const parser of this.parsers) {
      const confidence = parser.canParse(firstPageText);
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestParser = parser;
      }
    }

    // Only return parser if confidence is above threshold
    if (bestConfidence >= 0.5) {
      return bestParser;
    }

    return null;
  }

  /**
   * Get list of supported banks
   */
  getSupportedBanks(): Array<{ id: string; name: string }> {
    return this.parsers.map(p => ({
      id: p.bankId,
      name: p.bankName,
    }));
  }
}

// Export singleton instance
export const parserRegistry = new ParserRegistryImpl();
