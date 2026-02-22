import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Layout/Navbar'
import Sidebar from './components/Layout/Sidebar'
import Dashboard from './pages/Dashboard'
import AssetView from './pages/AssetView'
import ScreenerPage from './pages/ScreenerPage'
import PortfolioPage from './pages/PortfolioPage'
import BacktestPage from './pages/BacktestPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-row-reverse min-h-screen" dir="rtl">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Navbar />
          <main className="flex-1 p-6 overflow-auto">
            <Routes>
              <Route path="/"          element={<Dashboard />} />
              <Route path="/asset/:symbol" element={<AssetView />} />
              <Route path="/screener"  element={<ScreenerPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/backtest"  element={<BacktestPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
