# Analytics Module

This folder contains the modular refactoring of the Analytics component, breaking down a 1465-line monolithic file into focused, maintainable pieces.

## Structure

All components and utilities are at the root level of analytics-module/:

### Core Files
- **Analytics.tsx** - Main orchestrator component that handles data fetching, state management, and coordinates all sub-components
- **types.ts** - TypeScript type definitions for Transaction, Category, Account, TimePeriod, SpendingEstimate, ChartDataPoint, and TrendDataPoint
- **utils.ts** - Utility functions for calculations (calculateYAxisDomain, convertToMasterCurrency)
- **constants.ts** - Shared constants like the COLORS array for charts

### UI Components
- **CustomSelect.tsx** - Reusable dropdown component with variants (default, success, destructive)
- **SummaryCards.tsx** - Three summary cards displaying Income, Expenses, and Net Flow
- **SpendingEstimates.tsx** - Weekly and monthly spending estimate cards with confidence levels

### Chart Components
- **NetWorthTrendChart.tsx** - Area chart showing total net worth trend over time
- **IncomeChart.tsx** - Bar chart for income comparison with category filtering
- **ExpensesChart.tsx** - Bar chart for expenses comparison with category filtering
- **PerAccountTrendChart.tsx** - Individual area charts for each account's balance trend
- **CategoryBreakdownChart.tsx** - Pie chart showing spending breakdown by category

### List Components
- **TopExpensesList.tsx** - List of the top 5 expenses in the selected period

## Data Flow

1. **Analytics.tsx** receives transactions, categories, accounts, and masterCurrency as props
2. Fetches exchange rates and spending estimates on mount
3. Calculates filtered transactions, totals, and chart data using useMemo hooks
4. Passes processed data to child components for rendering

## Key Features

- **Period Filtering**: Support for This Year, Last Year, All Time, and Custom date ranges
- **Category Filtering**: Filter income and expense charts by specific categories
- **Currency Conversion**: All amounts converted to master currency for consistent comparison
- **Privacy Mode**: Sensitive data can be hidden using PrivacyContext
- **Responsive Design**: Mobile-first design with Tailwind CSS breakpoints
- **Performance**: All expensive calculations memoized with useMemo

## Component Props

Each component receives only the data it needs:
- Charts receive pre-calculated data arrays
- UI components receive display values and currency info
- All components support privacy mode via context

## Usage

```tsx
import { Analytics } from './components/analytics-module/Analytics'

<Analytics
  transactions={transactions}
  categories={categories}
  accounts={accounts}
  masterCurrency="HUF"
/>
```

## Benefits of Modular Structure

1. **Maintainability**: Each component has a single responsibility
2. **Testability**: Components can be tested in isolation
3. **Reusability**: Chart components can be reused in other parts of the app
4. **Readability**: Easier to understand and navigate compared to 1465-line file
5. **Performance**: Smaller component bundles, better code splitting
6. **Collaboration**: Multiple developers can work on different components simultaneously
