import { create } from 'zustand'

export const useStore = create((set) => ({
  selectedSymbol: 'AAPL',
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  watchlist: [],
  setWatchlist: (watchlist) => set({ watchlist }),
  portfolio: [],
  setPortfolio: (portfolio) => set({ portfolio }),
}))
