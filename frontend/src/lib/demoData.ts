import type { StatementInfo, Transaction } from '../types';

// Realistic mock transactions for demo purposes
const DEMO_VENDORS = {
  food: [
    'GRAB FOOD', 'FOODPANDA', 'DELIVEROO', 'MCDONALDS', 'STARBUCKS',
    'KOI CAFE', 'TOAST BOX', 'YA KUN', 'SUBWAY', 'BURGER KING',
    'PIZZA HUT', 'DOMINOS', 'SUSHI TEI', 'DIN TAI FUNG', 'GENKI SUSHI'
  ],
  transport: [
    'GRAB TRANSPORT', 'GOJEK', 'COMFORT TAXI', 'EZ-LINK TOP UP',
    'LTA ERP', 'SBS TRANSIT', 'SMRT', 'SHELL', 'ESSO', 'CALTEX'
  ],
  shopping: [
    'UNIQLO', 'H&M', 'ZARA', 'COTTON ON', 'DECATHLON',
    'IKEA', 'COURTS', 'HARVEY NORMAN', 'CHALLENGER', 'POPULAR'
  ],
  groceries: [
    'FAIRPRICE', 'COLD STORAGE', 'GIANT', 'SHENG SIONG', 'DON DON DONKI',
    'REDMART', 'AMAZON FRESH', 'MARKET FRESH'
  ],
  entertainment: [
    'NETFLIX', 'SPOTIFY', 'DISNEY PLUS', 'GOLDEN VILLAGE', 'CATHAY',
    'SHAW THEATRES', 'STEAM GAMES', 'PLAYSTATION STORE'
  ],
  utilities: [
    'SP SERVICES', 'SINGTEL', 'STARHUB', 'M1', 'PUB UTILITIES'
  ],
  healthcare: [
    'GUARDIAN', 'WATSONS', 'UNITY PHARMACY', 'RAFFLES MEDICAL',
    'PARKWAY HOSPITAL', 'POLYCLINIC'
  ],
  travel: [
    'SINGAPORE AIRLINES', 'SCOOT', 'JETSTAR', 'AIRBNB',
    'BOOKING.COM', 'AGODA', 'KLOOK'
  ]
};

const CATEGORIES = Object.keys(DEMO_VENDORS) as Array<keyof typeof DEMO_VENDORS>;

function randomAmount(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTransaction(date: Date, isExpense: boolean, source: 'bank' | 'credit_card'): Transaction {
  if (isExpense) {
    const categoryKey = randomChoice(CATEGORIES);
    const vendor = randomChoice(DEMO_VENDORS[categoryKey]);
    
    const amountRanges: Record<string, [number, number]> = {
      food: [5, 80],
      transport: [3, 50],
      shopping: [20, 300],
      groceries: [30, 200],
      entertainment: [10, 50],
      utilities: [50, 200],
      healthcare: [20, 150],
      travel: [100, 1500]
    };
    
    const [min, max] = amountRanges[categoryKey];
    const amount = -randomAmount(min, max);
    
    const categoryNames: Record<string, string> = {
      food: 'Food & Dining',
      transport: 'Transport',
      shopping: 'Shopping',
      groceries: 'Groceries',
      entertainment: 'Entertainment',
      utilities: 'Utilities',
      healthcare: 'Healthcare',
      travel: 'Travel'
    };
    
    const description = `${vendor} SINGAPORE`;
    return {
      date,
      description,
      amount,
      category: categoryNames[categoryKey],
      categorySource: 'ai',
      vendor,
      source,
      rawText: description,
      hidden: false
    };
  } else {
    // Income transaction
    const incomeTypes = [
      { desc: 'SALARY CREDIT', amount: randomAmount(4000, 8000) },
      { desc: 'BONUS PAYMENT', amount: randomAmount(1000, 5000) },
      { desc: 'INTEREST CREDIT', amount: randomAmount(5, 50) },
      { desc: 'CASHBACK REBATE', amount: randomAmount(10, 100) },
      { desc: 'DIVIDEND PAYMENT', amount: randomAmount(50, 500) }
    ];
    
    const income = randomChoice(incomeTypes);
    return {
      date,
      description: income.desc,
      amount: income.amount,
      category: 'Income',
      categorySource: 'rules',
      source,
      rawText: income.desc,
      hidden: false
    };
  }
}

function generateBankStatement(year: number, month: number): StatementInfo {
  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 0);
  
  const transactions: Transaction[] = [];
  
  // Add salary (1st of month)
  transactions.push({
    date: new Date(year, month, 1),
    description: 'SALARY CREDIT - ACME CORP PTE LTD',
    amount: randomAmount(5500, 7500),
    category: 'Income',
    categorySource: 'rules',
    source: 'bank',
    rawText: 'SALARY CREDIT - ACME CORP PTE LTD',
    hidden: false
  });
  
  // Add some expenses (15-25 per month)
  const numExpenses = Math.floor(Math.random() * 10) + 15;
  for (let i = 0; i < numExpenses; i++) {
    const date = randomDate(periodStart, periodEnd);
    transactions.push(generateTransaction(date, true, 'bank'));
  }
  
  // Add occasional income (interest, cashback)
  if (Math.random() > 0.5) {
    transactions.push({
      date: new Date(year, month, 28),
      description: 'INTEREST CREDIT',
      amount: randomAmount(5, 30),
      category: 'Income',
      categorySource: 'rules',
      source: 'bank',
      rawText: 'INTEREST CREDIT',
      hidden: false
    });
  }
  
  // Add investment transfer
  if (Math.random() > 0.3) {
    transactions.push({
      date: new Date(year, month, 15),
      description: 'TRANSFER TO INVESTMENT ACCOUNT',
      amount: -randomAmount(500, 1500),
      category: 'Investments',
      categorySource: 'rules',
      source: 'bank',
      rawText: 'TRANSFER TO INVESTMENT ACCOUNT',
      hidden: false
    });
  }
  
  // Add savings transfer
  if (Math.random() > 0.4) {
    transactions.push({
      date: new Date(year, month, 20),
      description: 'TRANSFER TO SAVINGS ACCOUNT',
      amount: -randomAmount(300, 800),
      category: 'Savings',
      categorySource: 'rules',
      source: 'bank',
      rawText: 'TRANSFER TO SAVINGS ACCOUNT',
      hidden: false
    });
  }
  
  // Add credit card payment
  transactions.push({
    date: new Date(year, month, 25),
    description: 'CREDIT CARD PAYMENT - UOB ONE CARD',
    amount: -randomAmount(800, 2000),
    category: 'Credit Card Payment',
    categorySource: 'rules',
    source: 'bank',
    rawText: 'CREDIT CARD PAYMENT - UOB ONE CARD',
    hidden: false
  });
  
  // Sort by date
  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return {
    filename: `UOB_Bank_Statement_${monthNames[month]}_${year}.pdf`,
    type: 'bank',
    periodStart,
    periodEnd,
    transactions
  };
}

function generateCreditCardStatement(year: number, month: number): StatementInfo {
  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 0);
  
  const transactions: Transaction[] = [];
  
  // Credit card has more frequent small transactions
  const numExpenses = Math.floor(Math.random() * 15) + 20;
  for (let i = 0; i < numExpenses; i++) {
    const date = randomDate(periodStart, periodEnd);
    const tx = generateTransaction(date, true, 'credit_card');
    // Credit card amounts tend to be smaller
    tx.amount = tx.amount * 0.7;
    transactions.push(tx);
  }
  
  // Add cashback
  transactions.push({
    date: new Date(year, month, 28),
    description: 'CASHBACK REBATE',
    amount: randomAmount(15, 50),
    category: 'Income',
    categorySource: 'rules',
    source: 'credit_card',
    rawText: 'CASHBACK REBATE',
    hidden: false
  });
  
  // Add payment received
  transactions.push({
    date: new Date(year, month, 25),
    description: 'PAYMENT RECEIVED - THANK YOU',
    amount: randomAmount(800, 2000),
    category: 'Credit Card Payment',
    categorySource: 'rules',
    source: 'credit_card',
    rawText: 'PAYMENT RECEIVED - THANK YOU',
    hidden: false
  });
  
  // Sort by date
  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return {
    filename: `UOB_CreditCard_Statement_${monthNames[month]}_${year}.pdf`,
    type: 'credit_card',
    periodStart,
    periodEnd,
    transactions
  };
}

export function generateDemoData(): StatementInfo[] {
  const statements: StatementInfo[] = [];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  // Generate 6 months of statements
  for (let i = 5; i >= 0; i--) {
    let month = currentMonth - i;
    let year = currentYear;
    
    if (month < 0) {
      month += 12;
      year -= 1;
    }
    
    statements.push(generateBankStatement(year, month));
    statements.push(generateCreditCardStatement(year, month));
  }
  
  return statements;
}

export function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).has('demo');
}
