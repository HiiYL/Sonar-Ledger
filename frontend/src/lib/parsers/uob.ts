import type { BankParser, StatementType, StatementPeriod, Transaction } from './types';
import { categorizeTransaction, extractPayNowVendor } from './categorizer';

/**
 * UOB Bank Parser
 * Handles UOB bank account statements and credit card statements
 */
export class UOBParser implements BankParser {
  readonly bankId = 'uob' as const;
  readonly bankName = 'United Overseas Bank (UOB)';

  canParse(firstPageText: string): number {
    const text = firstPageText.toLowerCase();
    
    // Strong indicators
    if (text.includes('uobgroup') || text.includes('united overseas bank')) {
      return 0.95;
    }
    
    // Medium indicators
    if (text.includes('uob one') || text.includes('uob card')) {
      return 0.85;
    }
    
    // Weak indicators (could be other banks too)
    if (text.includes('one account') && text.includes('singapore')) {
      return 0.6;
    }
    
    return 0;
  }

  detectStatementType(text: string): StatementType {
    // Check for credit card indicators
    if (text.includes('card.centre@uobgroup') || 
        text.includes('Credit Card(s) Statement') ||
        text.includes('UOB ONE CARD') ||
        text.includes('UOB VISA') ||
        text.includes('UOB MASTERCARD')) {
      return 'credit_card';
    }
    
    // Check for bank account indicators
    if (text.includes('Statement of Account') || 
        text.includes('One Account') ||
        text.includes('customer.service@uobgroup')) {
      return 'bank';
    }
    
    return 'bank'; // Default to bank
  }

  extractPeriod(text: string): StatementPeriod {
    // Pattern: "Period: 01 Jul 2025 to 31 Jul 2025"
    const periodMatch = text.match(
      /Period:\s*(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i
    );
    if (periodMatch) {
      return {
        start: new Date(periodMatch[1]),
        end: new Date(periodMatch[2]),
      };
    }
    
    // Fallback for credit card: "Statement Date 16 NOV 2025"
    const stmtDateMatch = text.match(/Statement Date\s+(\d{1,2}\s+\w+\s+\d{4})/i);
    if (stmtDateMatch) {
      const end = new Date(stmtDateMatch[1]);
      const start = new Date(end);
      start.setMonth(start.getMonth() - 1);
      return { start, end };
    }
    
    return { start: new Date(), end: new Date() };
  }

  parseTransactions(
    pages: string[],
    type: StatementType,
    period: StatementPeriod
  ): Transaction[] {
    const year = period.end.getFullYear();
    
    if (type === 'bank') {
      return this.parseBankTransactions(pages, year, period);
    } else {
      return this.parseCreditCardTransactions(pages, year, period);
    }
  }

  private parseBankTransactions(
    pages: string[],
    year: number,
    period: StatementPeriod
  ): Transaction[] {
    const transactions: Transaction[] = [];
    const fullText = pages.join(' ');
    
    // UOB Bank statement format - capture transaction AND the vendor info that follows
    // Pattern: DD Mon TYPE AMOUNT BALANCE [VENDOR_INFO until next date or end]
    const txRegex = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+([A-Za-z][\w\s\-\/\.\,\(\)\']*?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*([^]*?)(?=\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+[A-Za-z]|Please\s*note|United\s*Overseas|$)/gi;
    
    const rawMatches: Array<{
      dateStr: string;
      description: string;
      txAmount: number;
      balance: number;
      vendorInfo: string;
      fullMatch: string;
    }> = [];

    let match;
    while ((match = txRegex.exec(fullText)) !== null) {
      const dateStr = match[1];
      const description = match[2].trim();
      const txAmount = parseFloat(match[3].replace(/,/g, ''));
      const balance = parseFloat(match[4].replace(/,/g, ''));
      const vendorInfo = (match[5] || '').trim();

      // Skip non-transaction lines
      if (description.includes('BALANCE B/F')) continue;
      if (description.includes('Page ')) continue;
      if (description.includes('Account Transaction')) continue;
      if (description.includes('Date Description')) continue;
      if (description.includes('SGD SGD')) continue;
      if (description.length < 3) continue;

      rawMatches.push({
        dateStr,
        description,
        txAmount,
        balance,
        vendorInfo,
        fullMatch: match[0],
      });
    }

    // Process matches - use balance changes to determine transaction direction
    let prevBalance: number | null = null;
    
    for (const m of rawMatches) {
      let amount: number;
      if (prevBalance !== null) {
        amount = m.balance - prevBalance;
      } else {
        // First transaction - use heuristics
        const isInflow = 
          m.description.includes('Inward') ||
          m.description.includes('Cash Deposit') ||
          m.description.includes('Bonus Interest') ||
          (m.description.includes('PAYNOW') && !m.description.includes('PIB') && !m.description.includes('MBK'));
        amount = isInflow ? m.txAmount : -m.txAmount;
      }
      
      prevBalance = m.balance;
      
      // Skip small interest entries
      if (m.description.includes('Interest') && Math.abs(amount) < 50) continue;

      // Parse date with year boundary handling
      let date = new Date(`${m.dateStr} ${year}`);
      if (isNaN(date.getTime())) continue;
      
      date = this.adjustDateForYearBoundary(date, m.dateStr, period);

      // Extract vendor for PayNow/NETS transactions
      const vendor = (m.description.includes('PAYNOW') || m.description.includes('NETS'))
        ? extractPayNowVendor(m.vendorInfo || m.description)
        : undefined;
      
      const fullDescription = m.vendorInfo 
        ? `${m.description} ${m.vendorInfo}`.replace(/\s+/g, ' ').trim()
        : m.description;

      transactions.push({
        date,
        description: fullDescription.substring(0, 150),
        amount: Math.round(amount * 100) / 100,
        balance: m.balance,
        vendor,
        source: 'bank',
        rawText: m.fullMatch,
        category: categorizeTransaction(fullDescription, vendor),
        categorySource: 'rules',
      });
    }

    return transactions;
  }

  private parseCreditCardTransactions(
    pages: string[],
    year: number,
    period: StatementPeriod
  ): Transaction[] {
    const transactions: Transaction[] = [];
    const fullText = pages.join('\n');

    // Credit card format: Post Date Trans Date Description Amount [CR]
    // CR suffix indicates credit (positive amount)
    const txRegex = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR)?/gi;

    let match;
    while ((match = txRegex.exec(fullText)) !== null) {
      const postDateStr = match[1];
      const description = match[3].trim();
      const amountStr = match[4];
      const crSuffix = match[5];
      const isCredit = crSuffix?.toUpperCase() === 'CR';

      // Skip previous balance (not a real transaction)
      if (description.includes('PREVIOUS BALANCE')) continue;

      let date = new Date(`${postDateStr} ${year}`);
      const amount = parseFloat(amountStr.replace(/,/g, ''));

      date = this.adjustDateForYearBoundary(date, postDateStr, period);

      transactions.push({
        date,
        description: description.replace(/\s+/g, ' ').substring(0, 100),
        amount: isCredit ? amount : -amount,
        source: 'credit_card',
        rawText: match[0],
        category: categorizeTransaction(description),
        categorySource: 'rules',
      });
    }

    return transactions;
  }

  /**
   * Adjust date for year boundary cases
   * e.g., Statement period Dec 2024 to Jan 2025, Dec transactions should be 2024
   */
  private adjustDateForYearBoundary(
    date: Date,
    dateStr: string,
    period: StatementPeriod
  ): Date {
    const txMonth = date.getMonth();
    const periodStartMonth = period.start.getMonth();
    const periodStartYear = period.start.getFullYear();
    const periodEndYear = period.end.getFullYear();
    
    // Check if period spans year boundary
    if (periodStartYear < periodEndYear) {
      // Transaction in late months should use previous year
      if (txMonth >= periodStartMonth) {
        return new Date(`${dateStr} ${periodStartYear}`);
      }
    }
    
    return date;
  }
}

// Export singleton instance
export const uobParser = new UOBParser();
