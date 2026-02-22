// frontend/src/api/client.js
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  r => r.data,
  err => {
    console.error('API Error:', err.response?.data || err.message)
    return Promise.reject(err)
  }
)

export const marketAPI = {
  getQuote:       (symbol)                          => api.get(`/market/quote/${symbol}`),
  getOHLCV:       (symbol, period='3mo', interval='1d') =>
                    api.get(`/market/ohlcv/${symbol}`, { params: { period, interval } }),
  getFundamentals:(symbol)                          => api.get(`/market/fundamentals/${symbol}`),
  getBatchQuotes: (symbols)                         => api.get('/market/quotes/batch', { params: { symbols: symbols.join(',') } }),
  getWatchlist:   ()                                => api.get('/market/watchlist'),
  addWatch:       (symbol)                          => api.post(`/market/watchlist/${symbol}`),
  removeWatch:    (symbol)                          => api.delete(`/market/watchlist/${symbol}`),
}

export const tradingAPI = {
  placeOrder:   (order)   => api.post('/trading/order', order),
  getPortfolio: ()        => api.get('/trading/portfolio'),
  getHistory:   ()        => api.get('/trading/history'),
  closeTrade:   (id)      => api.post(`/trading/close/${id}`),
}

export const signalsAPI = {
  getSignal: (symbol) => api.get(`/signals/${symbol}`),
}

export const newsAPI = {
  getNews:        (symbol) => api.get(`/news/${symbol}`),
  getGeneralNews: (cat='general') => api.get(`/news/market/general?category=${cat}`),
}

export default api
