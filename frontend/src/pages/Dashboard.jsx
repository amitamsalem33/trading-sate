import { useTranslation } from 'react-i18next'
import { useStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'

const DEFAULT_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'BTC-USD', 'ETH-USD']

export default function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setSelectedSymbol = useStore(s => s.setSelectedSymbol)

  const openAsset = (sym) => {
    setSelectedSymbol(sym)
    navigate(`/asset/${sym}`)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-white">{t('dashboard')}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {DEFAULT_SYMBOLS.map(sym => (
          <button key={sym} onClick={() => openAsset(sym)}
            className="card hover:border-accent/40 transition cursor-pointer text-right">
            <div className="text-accent font-bold text-lg">{sym}</div>
            <div className="text-muted text-sm mt-1">לחץ לניתוח מלא</div>
          </button>
        ))}
      </div>
      <div className="mt-8 card">
        <p className="text-muted text-center">
          בחר נכס מהרשימה הנ"ל או חפש בסרגל החיפוש לניתוח מלא עם אותות מסחר
        </p>
      </div>
    </div>
  )
}
