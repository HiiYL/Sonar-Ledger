# Sonar Ledger

**Privacy-first statement intelligence for your bank & credit card PDFs.** Sonar Ledger processes your statements entirely in the browser, uses AI to categorize transactions, and turns raw PDFs into actionable insights — without ever uploading your sensitive financial data.

![Privacy First](https://img.shields.io/badge/Privacy-First-green) ![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![AI Powered](https://img.shields.io/badge/AI-Powered-purple)

**Check it Out!** https://hiiyl.github.io/Sonar-Ledger/

<img width="1509" height="857" alt="Screenshot 2025-12-03 at 12 48 54 AM" src="https://github.com/user-attachments/assets/280fcaa5-b1d9-42fc-a6cf-77ae510b1406" />


## Features

### 📊 Interactive Dashboard
- **Stats Overview** — Income, expenses, investments, net flow, and savings rate at a glance
- **Cash Flow Chart** — Visualize income vs expenses by day/week/month
- **Category Breakdown** — Interactive pie chart showing spending distribution
- **Net Flow Trend** — Track cumulative wealth over time
- **Top Expenses** — See your largest transactions instantly

### 🤖 AI-Powered Categorization
- **Smart Categories** — Automatically categorizes transactions using an on-device AI model (MiniLM)
- **Learn from Corrections** — Manually correct a category and the AI remembers for similar transactions
- **Semantic Understanding** — Understands merchant names and transaction descriptions contextually
- **No Cloud Required** — AI runs entirely in your browser

### 📁 Multi-Statement Support
- Upload multiple bank and credit card statements at once
- Toggle individual statements on/off to compare periods
- Per-statement metrics (income, expenses, transaction count)
- Automatic statement type detection (bank vs credit card)

### 🔍 Transaction Management
- **Search & Filter** — Find transactions by description, vendor, or category
- **Sortable Columns** — Sort by date, amount, category, or vendor
- **Hide Transactions** — Exclude specific transactions from calculations
- **Inline Editing** — Click any category to change it
- **Export to CSV** — Download filtered transactions for spreadsheets

### 🎯 Click-to-Filter
- Click pie chart slices to filter by category
- Click bar chart periods to filter by month
- Click category badges in the table to filter
- All filters sync across charts and tables

### ☁️ Sync & Backup
- **Google Drive Sync** — Auto-sync across devices using your own Google Drive
- **JSON Export/Import** — Manual backup and restore without cloud dependency
- **Persistent Storage** — Data saved locally between sessions

### 💡 Smart Handling
- **Internal Transfers** — Credit card payments, investments, and savings tracked separately
- **Year Boundaries** — Correctly handles Dec-Jan statement periods
- **Duplicate Prevention** — Avoids double-counting across bank and credit card statements

## Supported Statements

Currently optimized for:
- **UOB Bank Statements** (PDF)
- **UOB Credit Card Statements** (PDF)

The modular parser architecture makes it easy to add support for other banks.

## Tech Stack

- **React 18** + TypeScript
- **Vite** — Fast builds and HMR
- **Tailwind CSS** — Utility-first styling
- **Recharts** — Data visualization
- **PDF.js** — Client-side PDF parsing
- **Transformers.js** — On-device AI (MiniLM embeddings)
- **IndexedDB** — Local data persistence

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/HiiYL/Sonar-Ledger.git
cd Sonar-Ledger/frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

Output will be in `frontend/dist/`.

## Cloud Sync Setup (Optional)

Sync your data across devices using Google Drive. Data is stored in your own Google Drive account.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and enable the **Google Drive API**
3. Create **OAuth 2.0 Client ID** (Web application)
4. Add authorized JavaScript origins:
   - `http://localhost:5173` (development)
   - `https://yourusername.github.io` (production)
5. Create `frontend/.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

For GitHub Pages deployment, add `VITE_GOOGLE_CLIENT_ID` as a repository secret.

## Privacy

**Your data never leaves your device.**

- ✅ All PDF processing happens locally in your browser
- ✅ AI categorization runs on-device (no API calls)
- ✅ No backend servers or databases
- ✅ Works offline after initial load
- ✅ Google Drive sync uses YOUR account only (optional)
- ✅ JSON backup is a local file you control

## Project Structure

```
frontend/src/
├── components/
│   ├── Charts.tsx          # Dashboard visualizations
│   ├── CloudSync.tsx       # Google Drive sync UI
│   ├── FileSidebar.tsx     # Statement selector
│   ├── FileUpload.tsx      # PDF dropzone
│   ├── JsonBackup.tsx      # Import/export controls
│   ├── StatsCards.tsx      # Summary statistics
│   └── TransactionTable.tsx
├── lib/
│   ├── backup.ts           # JSON serialization
│   ├── embeddings.ts       # AI categorization engine
│   ├── googleDrive.ts      # Drive API integration
│   ├── pdfParser.ts        # PDF extraction
│   ├── summarizer.ts       # Data aggregation
│   └── parsers/
│       ├── categorizer.ts  # Rule-based fallback
│       └── uob.ts          # UOB statement parser
├── types.ts
├── App.tsx
└── main.tsx
```

## Adding Support for Other Banks

1. Create a new parser in `lib/parsers/` (see `uob.ts` as reference)
2. Update `detectStatementType()` in `pdfParser.ts`
3. Add bank-specific patterns to `categorizer.ts` if needed
4. The AI categorization will work automatically for new banks

## Contributing

Contributions welcome! Feel free to open issues or submit PRs.

## License

MIT License — use freely for personal finance tracking.

---

**Disclaimer:** This tool is for personal use. Always verify parsed data against your actual statements.
