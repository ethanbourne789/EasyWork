export interface StockQuote {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  turnover: number;
}

export interface StockAlert {
  id: number;
  stockCode: string;
  alertType: 'price_up' | 'price_down';
  targetPrice: number;
  isEnabled: boolean;
}
