import * as pdfjsLib from 'pdfjs-dist';
import type { StatementInfo } from '../types';
import { parserRegistry } from './parsers';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Extract text from PDF file
 * Returns array of page texts
 */
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

/**
 * Parse a bank statement PDF file
 * Automatically detects the bank and statement type
 */
export async function parseStatement(file: File): Promise<StatementInfo> {
  const pages = await extractTextFromPdf(file);
  const firstPage = pages[0] || '';
  
  // Find the appropriate parser for this PDF
  const parser = parserRegistry.findParser(firstPage);
  
  if (!parser) {
    throw new Error(
      'Unable to detect bank format. Currently supported banks: ' +
      parserRegistry.getSupportedBanks().map(b => b.name).join(', ')
    );
  }
  
  // Use the parser to extract statement info
  const type = parser.detectStatementType(firstPage);
  const period = parser.extractPeriod(firstPage);
  const transactions = parser.parseTransactions(pages, type, period);

  return {
    filename: file.name,
    type,
    periodStart: period.start,
    periodEnd: period.end,
    transactions,
  };
}

/**
 * Get list of supported banks
 */
export function getSupportedBanks() {
  return parserRegistry.getSupportedBanks();
}
