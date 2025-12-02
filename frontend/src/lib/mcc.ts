import type { MccEntry } from 'merchant-category-codes';
import { mcc_with_groups_en } from 'merchant-category-codes';

export interface MccInfo {
  code: string;
  shortDescription: string;
  fullDescription: string;
  sourceGroup: string;
  category: string;
}

const GROUP_CATEGORY_MAP: Record<string, string> = {
  Transport: 'Transport',
  'Transportation services': 'Transport',
  'Automotive dealers and services': 'Automotive',
  'Gas stations': 'Transport',
  'Car rental': 'Travel',
  'Travel agencies': 'Travel',
  'Hotels and motels': 'Travel',
  'Airlines': 'Travel',
  'Tourism and leisure': 'Entertainment',
  'Restaurants and cafes': 'Food & Dining',
  'Fast food restaurants': 'Food & Dining',
  'Food stores': 'Groceries',
  Markets: 'Groceries',
  'Clothing and accessories': 'Shopping',
  'Department stores': 'Shopping',
  Household: 'Home Improvement',
  'Electronics stores': 'Electronics',
  'Specialty retail stores': 'Shopping',
  'General merchandise': 'Shopping',
  'Entertainment stores': 'Entertainment',
  'Professional services': 'Other',
  'Business services': 'Business Services',
  'Financial services': 'Financial',
  Insurance: 'Insurance',
  'Charity and memberships': 'Charity',
  Education: 'Education',
  Healthcare: 'Healthcare',
  'Government services': 'Government',
  Utilities: 'Utilities',
  Telecommunications: 'Utilities',
  'Home improvement': 'Home Improvement',
  'Personal care services': 'Personal Care',
};

const MCC_TABLE: Record<string, MccInfo> = buildMccTable();

function normalizeGroup(entry: MccEntry): string {
  return entry.group?.description || entry.group?.type || 'Other';
}

function mapGroupToCategory(group: string): string {
  return GROUP_CATEGORY_MAP[group] || 'Other';
}

function buildMccTable(): Record<string, MccInfo> {
  const table: Record<string, MccInfo> = {};

  for (const entry of mcc_with_groups_en) {
    const code = entry.mcc.padStart(4, '0');
    const sourceGroup = normalizeGroup(entry);

    table[code] = {
      code,
      shortDescription: entry.shortDescription,
      fullDescription: entry.fullDescription,
      sourceGroup,
      category: mapGroupToCategory(sourceGroup),
    };
  }

  return table;
}

export function getMccInfo(code?: string): MccInfo | undefined {
  if (!code) return undefined;
  const normalized = code.padStart(4, '0');
  return MCC_TABLE[normalized];
}

export function listAllMccCodes(): MccInfo[] {
  return Object.values(MCC_TABLE);
}
