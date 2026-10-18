import type {HistoryRangeSummary} from './investment-history'
import type {PortfolioRange} from './investment-history-dates'
export type PortfolioHistoryPoint={date:string;value:number|null;net_invested:number|null;contribution:number|null;withdrawal:number|null;
 provisional:boolean;event:boolean;coverage:'complete'|'partial';price_as_of_oldest:string|null;price_as_of_latest:string|null;fx_as_of_oldest:string|null;fx_as_of_latest:string|null}
export type PortfolioHistoryResponse={as_of:string;source_revision:number;currency:string;timezone:string;range:PortfolioRange|'custom';from:string;to:string;prior_date:string;
 scope:'all_investment_holdings_including_archived';points:PortfolioHistoryPoint[];opening:PortfolioHistoryPoint;summary:HistoryRangeSummary;
 coverage_ranges:{account_id:string;from:string;to:string;reasons:string[];kind:'value'|'performance'}[];
 holdings:{account_id:string;name:string;archived:boolean;summary:HistoryRangeSummary;first_price_as_of:string|null;last_price_as_of:string|null}[];
 sampling:{daily_points:number;returned_points:number;max_points:number;method:string};
 sources:{symbol:string;provider:string;retrieved_at:string|null;status:string;from:string;to:string;timezone:string|null}[];
 method:{return_label:string;flow_timing:string;price_timing:string;fx_timing:string;current_endpoint:string}}
