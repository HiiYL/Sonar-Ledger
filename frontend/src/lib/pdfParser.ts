import * as pdfjsLib from 'pdfjs-dist';
import type { Transaction, StatementInfo } from '../types';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export async function extractTextFromPdf(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Filter to text items with position info and sort by position
    const items: Array<{ str: string; x: number; y: number }> = [];
    for (const item of textContent.items) {
      if ('str' in item && 'transform' in item) {
        const transform = item.transform as number[];
        items.push({
          str: item.str,
          x: transform[4],
          y: transform[5],
        });
      }
    }
    
    // Sort by position (top to bottom, left to right)
    items.sort((a, b) => {
      const yDiff = b.y - a.y; // Higher Y = top of page
      if (Math.abs(yDiff) > 5) return yDiff;
      return a.x - b.x;
    });
    
    const pageText = items.map((item) => item.str).join(' ');
    pages.push(pageText);
  }

  return pages;
}

function detectStatementType(text: string): 'bank' | 'credit_card' {
  // Check for credit card indicators
  if (text.includes('card.centre@uobgroup') || 
      text.includes('Credit Card(s) Statement') ||
      text.includes('UOB ONE CARD')) {
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

function extractPeriod(text: string): { start: Date; end: Date } {
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

function parseBankTransactions(pages: string[], year: number, periodStart?: Date, periodEnd?: Date): Transaction[] {
  const transactions: Transaction[] = [];
  const fullText = pages.join(' ');
  
  // UOB Bank statement format - capture transaction AND the vendor info that follows
  // Pattern: DD Mon TYPE AMOUNT BALANCE [VENDOR_INFO until next date or end]
  // Example: "01 Oct PAYNOW-FAST 7.50 16,306.35 PIB2510017694309231 Qashier-TOTOFISH CL4 OTHR qsb..."
  // We need to capture everything up to the next "DD Mon" pattern
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
    // Determine if inflow or outflow using balance change
    let amount: number;
    if (prevBalance !== null) {
      // Use balance change to determine direction
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

    // Parse the transaction date - need to handle year boundaries
    // If statement period is Jan 2025 but transaction is Dec, it should be Dec 2024
    let date = new Date(`${m.dateStr} ${year}`);
    if (isNaN(date.getTime())) continue;
    
    // Handle year boundary using statement period
    // If statement period spans year boundary (e.g., Dec 2024 to Jan 2025),
    // transactions in the earlier month should use the earlier year
    if (periodStart && periodEnd) {
      const txMonth = date.getMonth();
      const periodStartMonth = periodStart.getMonth();
      const periodEndMonth = periodEnd.getMonth();
      const periodStartYear = periodStart.getFullYear();
      const periodEndYear = periodEnd.getFullYear();
      
      // Check if period spans year boundary (start year < end year)
      if (periodStartYear < periodEndYear) {
        // If transaction month matches the start month (or is close to it), use start year
        // e.g., Period: Dec 2024 to Jan 2025, transaction in Dec -> use 2024
        if (txMonth >= periodStartMonth || txMonth < periodEndMonth) {
          // Transaction is in the late months (like Dec) - should be previous year
          if (txMonth >= periodStartMonth) {
            date = new Date(`${m.dateStr} ${periodStartYear}`);
          }
          // Transaction is in early months (like Jan) - should be current year (already correct)
        }
      }
    }

    // Extract vendor for PayNow transactions - use vendorInfo which contains the merchant details
    const vendor = (m.description.includes('PAYNOW') || m.description.includes('NETS'))
      ? extractPayNowVendor(m.vendorInfo || m.description)
      : undefined;
    
    // Build full description including vendor info for better context
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
    });
  }

  return transactions;
}

function parseCreditCardTransactions(pages: string[], year: number, periodStart?: Date, periodEnd?: Date): Transaction[] {
  const transactions: Transaction[] = [];
  const fullText = pages.join('\n');

  // Credit card format: Post Date Trans Date Description Amount
  // Example: "16 OCT 12 OCT BUS/MRT 725738305 SINGAPORE 3.62"
  const txRegex = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))\s+(.+?)\s+([\d,]+\.\d{2})(CR)?/gi;

  let match;
  while ((match = txRegex.exec(fullText)) !== null) {
    const postDateStr = match[1];
    const description = match[3].trim();
    const amountStr = match[4];
    const isCredit = !!match[5];

    // Skip payments and previous balance
    if (description.includes('PAYMT THRU') || description.includes('PREVIOUS BALANCE')) continue;

    let date = new Date(`${postDateStr} ${year}`);
    const amount = parseFloat(amountStr.replace(/,/g, ''));

    // Handle year boundary using statement period
    if (periodStart && periodEnd) {
      const txMonth = date.getMonth();
      const periodStartMonth = periodStart.getMonth();
      const periodStartYear = periodStart.getFullYear();
      const periodEndYear = periodEnd.getFullYear();
      
      // Check if period spans year boundary (start year < end year)
      if (periodStartYear < periodEndYear) {
        // Transaction in late months (like Dec) should use previous year
        if (txMonth >= periodStartMonth) {
          date = new Date(`${postDateStr} ${periodStartYear}`);
        }
      }
    }

    transactions.push({
      date,
      description: description.replace(/\s+/g, ' ').substring(0, 100),
      amount: isCredit ? amount : -amount,
      source: 'credit_card',
      rawText: match[0],
      category: categorizeTransaction(description),
    });
  }

  return transactions;
}

// Extract vendor name from PayNow/NETS transaction vendor info
function extractPayNowVendor(vendorInfo: string): string | undefined {
  // vendorInfo contains text after the balance, e.g.:
  // "PIB2510017694309231 Qashier-TOTOFISH CL4 OTHR qsb-sqr-sg..."
  // "Sixth Avenue Porky MBK2510017699021478"
  // "PAYNOW OTHR DYLAN HO XIAN ZHENG"
  // "MIXUE-3151 16211912 xxxxxx4254" (for NETS)
  
  const info = vendorInfo.replace(/\s+/g, ' ').trim();
  if (!info) return undefined;
  
  // Pattern 1: Qashier- prefix (POS system) - extract business name
  const qashierMatch = info.match(/Qashier-([A-Za-z0-9\s\-]+?)(?:\s+CL|\s+OTHR|\s*$)/i);
  if (qashierMatch) {
    return qashierMatch[1].trim();
  }
  
  // Pattern 2: After PIB reference, capture vendor name before OTHR
  const pibMatch = info.match(/PIB\d+\s+([A-Za-z][A-Za-z0-9\s\-\(\)\.\']+?)(?:\s+OTHR|\s+MBK|\s*$)/i);
  if (pibMatch) {
    return pibMatch[1].trim();
  }
  
  // Pattern 3: Vendor name before MBK reference (no PIB)
  const mbkMatch = info.match(/^([A-Za-z][A-Za-z0-9\s\-\(\)\.\']+?)\s+MBK/i);
  if (mbkMatch) {
    return mbkMatch[1].trim();
  }
  
  // Pattern 4: PAYNOW OTHR followed by person name
  const othrMatch = info.match(/PAYNOW\s+OTHR\s+([A-Za-z][A-Za-z\s\']+)/i);
  if (othrMatch) {
    return othrMatch[1].trim();
  }
  
  // Pattern 5: NETS - MIXUE or other merchant names at start
  const netsMatch = info.match(/^([A-Z][A-Z0-9\-]+)(?:\s+\d|\s+x)/i);
  if (netsMatch) {
    return netsMatch[1].trim();
  }
  
  // Pattern 6: Business names with PTE/LTD/ENTERPRISE
  const bizMatch = info.match(/([A-Z][A-Z\s]+(?:ENTERPRISE|PTE|LTD|RESTAURANT|CAFE))/i);
  if (bizMatch) {
    return bizMatch[1].trim();
  }
  
  return undefined;
}

// Known vendor categories for PayNow merchants
const VENDOR_CATEGORIES: Record<string, string> = {
  // Food vendors
  'totofish': 'Food & Dining',
  'porky': 'Food & Dining',
  'mahan': 'Food & Dining',
  'aarya': 'Food & Dining',
  'baoyuan': 'Food & Dining',
  'fish': 'Food & Dining',
  'pancake': 'Food & Dining',
  'restaurant': 'Food & Dining',
  'cafe': 'Food & Dining',
  'food': 'Food & Dining',
  'kitchen': 'Food & Dining',
  'bakery': 'Food & Dining',
  'noodle': 'Food & Dining',
  'rice': 'Food & Dining',
  'chicken': 'Food & Dining',
  'prata': 'Food & Dining',
  'kopitiam': 'Food & Dining',
  // Entertainment/Activities
  'climbing': 'Entertainment',
  'piano': 'Entertainment',
  'gym': 'Entertainment',
  'fitness': 'Entertainment',
  // Rent
  'rental': 'Rent',
  'rent': 'Rent',
};

function categorizeByVendor(vendor: string): string | undefined {
  const v = vendor.toLowerCase();
  for (const [keyword, category] of Object.entries(VENDOR_CATEGORIES)) {
    if (v.includes(keyword)) {
      return category;
    }
  }
  return undefined;
}

function categorizeTransaction(description: string, vendor?: string): string {
  const desc = description.toLowerCase();
  const vendorLower = vendor?.toLowerCase() || '';
  
  // First try to categorize by vendor name if available
  if (vendor) {
    const vendorCategory = categorizeByVendor(vendor);
    if (vendorCategory) {
      return vendorCategory;
    }
  }
  
  // Also check description for vendor-based hints from OTHR field
  // e.g., "OTHR hii climbing pass", "OTHR dinner hii", "OTHR hii rental"
  if (desc.includes('climbing') || vendorLower.includes('climbing')) {
    return 'Entertainment';
  }
  if (desc.includes('piano') || vendorLower.includes('piano')) {
    return 'Entertainment';
  }
  if (desc.includes('rental') || desc.includes('rent') || vendorLower.includes('rental')) {
    return 'Rent';
  }
  if (desc.includes('dinner') || desc.includes('lunch') || desc.includes('breakfast')) {
    return 'Food & Dining';
  }
  
  // Transport
  if (desc.includes('bus/mrt') || desc.includes('grab') || desc.includes('gojek') || 
      desc.includes('easyvan') || desc.includes('comfort') || desc.includes('taxi')) {
    return 'Transport';
  }
  
  // Groceries
  if (desc.includes('ntuc') || desc.includes('fairprice') || desc.includes('cold storage') || 
      desc.includes('sheng siong') || desc.includes('giant') || desc.includes('prime')) {
    return 'Groceries';
  }
  
  // Food & Dining (by merchant name)
  if (desc.includes('mcdonald') || desc.includes('burger') || desc.includes('kfc') || 
      desc.includes('food') || desc.includes('restaurant') || desc.includes('cafe') || 
      desc.includes('coffee') || desc.includes('huang tu di') || desc.includes('mixue') || 
      desc.includes('pancake') || desc.includes('porky') || desc.includes('fish') || 
      desc.includes('mahan') || desc.includes('aarya') || desc.includes('baoyuan') || 
      desc.includes('totofish')) {
    return 'Food & Dining';
  }
  
  // Shopping
  if (desc.includes('shopee') || desc.includes('lazada') || desc.includes('amazon') || 
      desc.includes('taobao') || desc.includes('qoo10')) {
    return 'Shopping';
  }
  
  // Subscriptions
  if (desc.includes('apple.com') || desc.includes('spotify') || desc.includes('netflix') || 
      desc.includes('patreon') || desc.includes('youtube') || desc.includes('disney') ||
      desc.includes('membership')) {
    return 'Subscriptions';
  }
  
  // Tax
  if (desc.includes('iras') || desc.includes('tax') || desc.includes('itx')) {
    return 'Tax';
  }
  
  // Investments (asset transfers, not expenses)
  if (desc.includes('interactive brokers') || desc.includes('tiger brokers') || 
      desc.includes('moomoo') || desc.includes('syfe') || desc.includes('stashaway') ||
      desc.includes('endowus') || desc.includes('dbs vickers') || desc.includes('poems') ||
      desc.includes('saxo') || desc.includes('investment') || desc.includes('broker') ||
      desc.includes('cpf') || desc.includes('srs')) {
    return 'Investments';
  }
  
  // Savings (internal transfers to savings)
  if (desc.includes('savings') || desc.includes('fixed deposit') || 
      desc.includes('time deposit') || desc.includes('fd account')) {
    return 'Savings';
  }
  
  // Income
  if (desc.includes('carousell') || desc.includes('stripe') || desc.includes('inward credit') ||
      desc.includes('cash deposit') || desc.includes('salary') || desc.includes('bonus interest')) {
    return 'Income';
  }
  
  // Convenience
  if (desc.includes('ijooz') || desc.includes('7-eleven') || desc.includes('cheers')) {
    return 'Convenience';
  }
  
  // Credit Card Payment (internal transfer - should be excluded from expenses)
  if (desc.includes('uob cards') || desc.includes('uob card') || 
      (desc.includes('bill payment') && desc.includes('mbk-uob'))) {
    return 'Credit Card Payment';
  }
  
  // Bills/Utilities
  if (desc.includes('bill payment') || desc.includes('utilities') ||
      desc.includes('singtel') || desc.includes('starhub') || desc.includes('m1')) {
    return 'Bills';
  }
  
  // P2P Transfers (PayNow to individuals - not merchants)
  // If it's a PayNow with a person's name (not a business), categorize as P2P Transfer
  if ((desc.includes('paynow') || desc.includes('pib') || desc.includes('mbk')) && vendor) {
    // Check if vendor looks like a person's name (2-3 words, no business keywords)
    const words = vendor.split(/\s+/);
    const looksLikePersonName = words.length >= 2 && words.length <= 4 &&
      !vendorLower.includes('pte') && !vendorLower.includes('ltd') &&
      !vendorLower.includes('restaurant') && !vendorLower.includes('cafe');
    if (looksLikePersonName) {
      return 'P2P Transfers';
    }
  }
  
  // Generic transfers
  if (desc.includes('transfer') || desc.includes('paynow') || desc.includes('pib') ||
      desc.includes('mbk') || desc.includes('giro')) {
    return 'Transfers';
  }
  
  // NETS/Debit transactions without clear category
  if (desc.includes('nets debit')) {
    return 'Other Spending';
  }
  
  return 'Other';
}

export async function parseStatement(file: File): Promise<StatementInfo> {
  const pages = await extractTextFromPdf(file);
  const firstPage = pages[0] || '';
  
  const type = detectStatementType(firstPage);
  const { start, end } = extractPeriod(firstPage);
  const year = end.getFullYear();

  const transactions = type === 'bank' 
    ? parseBankTransactions(pages, year, start, end)
    : parseCreditCardTransactions(pages, year, start, end);

  return {
    filename: file.name,
    type,
    periodStart: start,
    periodEnd: end,
    transactions,
  };
}
