/** Synthetic provider payload; no recorded personal holdings or market prices. */
export function yahooFixture(now: number, symbol='TEST', currency='EUR', instrumentType='EQUITY') {
  const day=Math.floor(now/86_400_000)*86_400
  return {chart:{error:null,result:[{
    meta:{symbol,currency,instrumentType,shortName:'Synthetic instrument',exchangeName:'TESTEX',exchangeTimezoneName:'UTC',
      regularMarketPrice:110,regularMarketTime:Math.floor(now/1000)-10,
      chartPreviousClose:1, // range-start metadata must never become previous session close
      currentTradingPeriod:{regular:{start:Math.floor(now/1000)-3600,end:Math.floor(now/1000)+3600}}},
    timestamp:[day-2*86400,day-86400,day],indicators:{quote:[{close:[90,100,110]}]},events:{},
  }]}}
}
