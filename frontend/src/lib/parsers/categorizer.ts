// Shared transaction categorization logic
// Can be used by all bank parsers
// Supports both rule-based (sync) and embedding-based (async) categorization

import { categorizeWithEmbeddings, isModelReady } from '../embeddings';

/**
 * Rule-based categorization (synchronous, always available)
 * Used as fallback when embedding model is not loaded
 */
export function categorizeTransaction(description: string, vendor?: string): string {
  const desc = description.toLowerCase();
  const v = vendor?.toLowerCase() || '';
  
  // Income patterns
  if (desc.includes('salary') || desc.includes('payroll') || 
      desc.includes('giro - salary') || desc.includes('bonus')) {
    return 'Income';
  }
  
  // Investments - check before transfers since some investment transfers look like regular transfers
  if (desc.includes('tiger brokers') || desc.includes('moomoo') || 
      desc.includes('interactive brokers') || desc.includes('syfe') ||
      desc.includes('stashaway') || desc.includes('endowus') ||
      desc.includes('poems') || desc.includes('dbs vickers') ||
      desc.includes('cpf') || desc.includes('srs') ||
      v.includes('tiger') || v.includes('moomoo') || v.includes('syfe')) {
    return 'Investments';
  }
  
  // Savings
  if (desc.includes('save') && (desc.includes('transfer') || desc.includes('to ')) ||
      desc.includes('savings') || desc.includes('fixed deposit')) {
    return 'Savings';
  }
  
  // Credit card payments (internal transfers)
  if (desc.includes('credit card') || desc.includes('card payment') ||
      desc.includes('uob card') || desc.includes('dbs card') ||
      desc.includes('ocbc card') || desc.includes('citi card') ||
      desc.includes('amex') || desc.includes('american express') ||
      desc.includes('paymt thru') || desc.includes('e-bank') || desc.includes('cyberb')) {
    return 'Credit Card Payment';
  }
  
  // Credit card rebates/cashback (income-like)
  if (desc.includes('rebate') || desc.includes('cashback') || desc.includes('cash back') ||
      desc.includes('reward') || desc.includes('one card additional')) {
    return 'Income';
  }
  
  // Food & Dining
  if (desc.includes('grab') || desc.includes('foodpanda') || desc.includes('deliveroo') ||
      desc.includes('restaurant') || desc.includes('cafe') || desc.includes('coffee') ||
      desc.includes('mcdonald') || desc.includes('kfc') || desc.includes('subway') ||
      desc.includes('starbucks') || desc.includes('toast box') || desc.includes('ya kun') ||
      desc.includes('kopitiam') || desc.includes('food court') || desc.includes('hawker') ||
      desc.includes('bakery') || desc.includes('bubble tea') || desc.includes('bbt') ||
      desc.includes('gongcha') || desc.includes('koi') || desc.includes('liho') ||
      desc.includes('mixue') || desc.includes('eatery') || desc.includes('dining') ||
      v.includes('cafe') || v.includes('restaurant') || v.includes('food') ||
      v.includes('coffee') || v.includes('bakery') || v.includes('kitchen')) {
    return 'Food & Dining';
  }
  
  // Groceries
  if (desc.includes('ntuc') || desc.includes('fairprice') || desc.includes('cold storage') ||
      desc.includes('giant') || desc.includes('sheng siong') || desc.includes('don don donki') ||
      desc.includes('market') || desc.includes('grocer') || desc.includes('supermarket') ||
      v.includes('ntuc') || v.includes('fairprice') || v.includes('cold storage')) {
    return 'Groceries';
  }
  
  // Transport
  if (desc.includes('bus/mrt') || desc.includes('ez-link') || desc.includes('transit') ||
      desc.includes('simplygo') || desc.includes('grab transport') || desc.includes('gojek') ||
      desc.includes('tada') || desc.includes('comfort') || desc.includes('taxi') ||
      desc.includes('uber') || desc.includes('parking') || desc.includes('carpark') ||
      desc.includes('petrol') || desc.includes('shell') || desc.includes('esso') ||
      desc.includes('caltex') || desc.includes('spc') || desc.includes('lta')) {
    return 'Transport';
  }
  
  // Shopping
  if (desc.includes('shopee') || desc.includes('lazada') || desc.includes('amazon') ||
      desc.includes('qoo10') || desc.includes('taobao') || desc.includes('uniqlo') ||
      desc.includes('h&m') || desc.includes('zara') || desc.includes('cotton on') ||
      desc.includes('ikea') || desc.includes('courts') || desc.includes('harvey norman') ||
      desc.includes('best denki') || desc.includes('challenger') ||
      v.includes('shop') || v.includes('store') || v.includes('retail')) {
    return 'Shopping';
  }
  
  // Subscriptions
  if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('youtube') ||
      desc.includes('disney') || desc.includes('apple') || desc.includes('google') ||
      desc.includes('amazon prime') || desc.includes('hbo') || desc.includes('subscription') ||
      desc.includes('membership') || desc.includes('recurring') ||
      desc.includes('chatgpt') || desc.includes('openai') || desc.includes('github') ||
      desc.includes('notion') || desc.includes('figma') || desc.includes('adobe')) {
    return 'Subscriptions';
  }
  
  // Entertainment
  if (desc.includes('cinema') || desc.includes('movie') || desc.includes('golden village') ||
      desc.includes('cathay') || desc.includes('shaw') || desc.includes('imax') ||
      desc.includes('concert') || desc.includes('ticket') || desc.includes('event') ||
      desc.includes('karaoke') || desc.includes('arcade') || desc.includes('bowling') ||
      desc.includes('escape') || desc.includes('zoo') || desc.includes('safari') ||
      desc.includes('sentosa') || desc.includes('uss') || desc.includes('attraction')) {
    return 'Entertainment';
  }
  
  // Bills & Utilities
  if (desc.includes('singtel') || desc.includes('starhub') || desc.includes('m1') ||
      desc.includes('circles') || desc.includes('giga') || desc.includes('sp services') ||
      desc.includes('sp group') || desc.includes('utilities') || desc.includes('electricity') ||
      desc.includes('water') || desc.includes('gas') || desc.includes('internet') ||
      desc.includes('broadband') || desc.includes('mobile') || desc.includes('phone bill')) {
    return 'Bills';
  }
  
  // Tax
  if (desc.includes('iras') || desc.includes('income tax') || desc.includes('tax payment') ||
      desc.includes('gst') || desc.includes('property tax')) {
    return 'Tax';
  }
  
  // Rent
  if (desc.includes('rent') || desc.includes('rental') || desc.includes('lease') ||
      desc.includes('landlord') || desc.includes('tenancy')) {
    return 'Rent';
  }
  
  // Healthcare
  if (desc.includes('clinic') || desc.includes('hospital') || desc.includes('doctor') ||
      desc.includes('medical') || desc.includes('pharmacy') || desc.includes('guardian') ||
      desc.includes('watsons') || desc.includes('dental') || desc.includes('polyclinic') ||
      desc.includes('health') || desc.includes('medisave')) {
    return 'Healthcare';
  }
  
  // Insurance
  if (desc.includes('insurance') || desc.includes('prudential') || desc.includes('aia') ||
      desc.includes('great eastern') || desc.includes('ntuc income') || desc.includes('aviva') ||
      desc.includes('manulife') || desc.includes('policy') || desc.includes('premium')) {
    return 'Insurance';
  }
  
  // Education
  if (desc.includes('school') || desc.includes('university') || desc.includes('college') ||
      desc.includes('tuition') || desc.includes('course') || desc.includes('udemy') ||
      desc.includes('coursera') || desc.includes('skillsfuture') || desc.includes('education')) {
    return 'Education';
  }
  
  // P2P Transfers (PayNow, PayLah, etc.)
  if (desc.includes('paynow') || desc.includes('paylah') || desc.includes('pay lah') ||
      v.includes('paynow')) {
    return 'P2P Transfers';
  }
  
  // Generic transfers
  if (desc.includes('transfer') || desc.includes('paynow') || desc.includes('pib') ||
      desc.includes('mbk') || desc.includes('giro')) {
    return 'Transfers';
  }

  return 'Other';
}

/**
 * Smart categorization - uses embeddings if model is ready, otherwise falls back to rules
 * This is async and should be used for re-categorization or batch processing
 */
export async function categorizeTransactionSmart(
  description: string,
  vendor?: string
): Promise<{ category: string; confidence: number; method: 'embedding' | 'rules' }> {
  // Try embedding-based categorization if model is ready
  if (isModelReady()) {
    const result = await categorizeWithEmbeddings(description, vendor);
    
    // If embedding confidence is too low, fall back to rules
    if (result.confidence < 0.25) {
      const ruleCategory = categorizeTransaction(description, vendor);
      return { category: ruleCategory, confidence: 0, method: 'rules' };
    }
    
    return { ...result, method: 'embedding' };
  }
  
  // Fall back to rule-based categorization
  const category = categorizeTransaction(description, vendor);
  return { category, confidence: 0, method: 'rules' };
}

/**
 * Batch re-categorize transactions using the smart categorizer
 */
export async function recategorizeTransactions<T extends { description: string; vendor?: string; category?: string }>(
  transactions: T[]
): Promise<T[]> {
  const results: T[] = [];
  
  for (const tx of transactions) {
    const { category } = await categorizeTransactionSmart(tx.description, tx.vendor);
    results.push({ ...tx, category });
  }
  
  return results;
}

// Extract vendor name from PayNow/NETS transaction info
export function extractPayNowVendor(vendorInfo: string): string | undefined {
  const info = vendorInfo.replace(/\s+/g, ' ').trim();
  if (!info || info.length < 3) return undefined;
  
  // Skip transaction IDs and reference numbers
  const cleaned = info
    .replace(/PIB\d+/gi, '')
    .replace(/MBK\d+/gi, '')
    .replace(/\d{10,}/g, '')
    .replace(/xxxxxx\d+/gi, '')
    .replace(/OTHR/gi, '')
    .replace(/FAST/gi, '')
    .replace(/PAYNOW/gi, '')
    .trim();
  
  if (cleaned.length < 3) return undefined;
  
  // Extract meaningful vendor name
  const parts = cleaned.split(/\s+/);
  const meaningfulParts = parts.filter(p => 
    p.length > 2 && 
    !/^\d+$/.test(p) && 
    !['the', 'and', 'for', 'pte', 'ltd', 'sg', 'singapore'].includes(p.toLowerCase())
  );
  
  if (meaningfulParts.length === 0) return undefined;
  
  // Take first few meaningful words as vendor name
  const vendorName = meaningfulParts.slice(0, 3).join(' ');
  
  // Capitalize first letter of each word
  return vendorName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
