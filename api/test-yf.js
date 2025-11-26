import yahooFinance from 'yahoo-finance2';

console.log('Type of default export:', typeof yahooFinance);
console.log('Is constructor?', typeof yahooFinance === 'function' && /^\s*class\s+/.test(yahooFinance.toString()));
console.log('Keys:', Object.keys(yahooFinance));

try {
  const yf = new yahooFinance();
  console.log('Instantiated successfully');
} catch (e) {
  console.log('Instantiation failed:', e.message);
}

if (yahooFinance.YahooFinance) {
    console.log('Found yahooFinance.YahooFinance');
}
