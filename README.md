# Sonar Ledger

**Privacy-first statement intelligence for your bank & credit card PDFs.** Sonar Ledger scans your UOB statements entirely in the browser, categorizes PayNow / NETS vendors, and turns raw PDFs into insight without ever uploading sensitive data.

![Sonar Ledger](https://img.shields.io/badge/Privacy-First-green) ![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

View here: https://hiiyl.github.io/Sonar-Ledger/

## Features

### 📊 Dashboard
- **Stats Overview** — Income, expenses, investments, net flow, savings rate
- **Cash Flow Chart** — Visualize income vs expenses by day/week/month
- **Category Breakdown** — Interactive pie chart showing spending by category
- **Net Flow Trend** — Track cumulative savings over time
- **Top Expenses** — See your largest transactions at a glance

### 📁 Multi-Statement Support
- Upload multiple bank and credit card statements
- Filter by individual statements or combine them
- Sidebar shows per-file metrics (income, expenses, transaction count)
- Automatic statement type detection (bank vs credit card)

### 🔍 Transaction Analysis
- **Smart Categorization** — Automatic categorization of transactions (Food, Transport, Shopping, etc.)
- **Vendor Extraction** — Extracts merchant names from PayNow/NETS transactions
- **Search & Filter** — Search by description, vendor, or category
- **Sortable Columns** — Sort by date, amount, or category
- **Export to CSV** — Download filtered transactions for further analysis

### 🎯 Smart Filtering
- Click on chart elements to filter transactions
- Click on pie chart categories to see related transactions
- Click on bar chart months to filter by time period
- Category badges in table are clickable filters

### 💡 Intelligent Handling
- **Internal Transfers** — Credit card payments, investments, and savings are tracked separately (not counted as expenses)
- **Year Boundaries** — Correctly handles statements spanning year boundaries (e.g., Dec-Jan)
- **Duplicate Prevention** — Avoids double-counting when both bank and credit card statements are loaded

## Supported Statements

Currently optimized for:
- **UOB Bank Statements** (PDF)
- **UOB Credit Card Statements** (PDF)

The parser can be extended to support other banks.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and builds
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **PDF.js** for client-side PDF parsing
- **Lucide React** for icons

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/HiiYL/Sonar-Ledger.git
cd Sonar-Ledger

# Install dependencies
cd frontend
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

The built files will be in `frontend/dist/`.

## Privacy

**Your data stays on your device.** This app:
- ✅ Processes all PDFs locally in your browser
- ✅ Never uploads your financial data to any server
- ✅ Has no backend or database
- ✅ Can work completely offline after initial load

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── Charts.tsx        # All chart components
│   │   ├── FileSidebar.tsx   # Statement file selector
│   │   ├── FileUpload.tsx    # PDF upload dropzone
│   │   ├── StatsCards.tsx    # Summary statistics
│   │   └── TransactionTable.tsx
│   ├── lib/
│   │   ├── pdfParser.ts      # PDF text extraction & parsing
│   │   └── summarizer.ts     # Data aggregation functions
│   ├── types.ts              # TypeScript interfaces
│   ├── App.tsx               # Main application
│   └── main.tsx              # Entry point
├── public/
└── package.json
```

## Adding Support for Other Banks

To add support for a new bank:

1. **Identify the statement format** — Look at how dates, descriptions, and amounts are formatted
2. **Update `detectStatementType()`** — Add keywords to identify the new bank
3. **Create a new parser function** — Similar to `parseBankTransactions()` or `parseCreditCardTransactions()`
4. **Update `categorizeTransaction()`** — Add any bank-specific merchant patterns

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License — feel free to use this for your personal finance tracking.

---

**Note:** This tool is for personal use. Always verify the parsed data against your actual statements.
