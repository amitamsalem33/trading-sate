// frontend/src/components/Signal/ReasoningPanel.jsx
import { useQuery }      from '@tanstack/react-query'
import { signalsAPI }    from '../../api/client'
import { useState }      from 'react'

function DecisionBadge({ decision, confidence }) {
  const config = {
    'קנייה':  { bg: 'bg-accent/15',  border: 'border-accent/40',  text: 'text-accent',  glow: 'shadow-[0_0_20px_rgba(0,212,170,0.3)]' },
    'מכירה':  { bg: 'bg-danger/15',  border: 'border-danger/40',  text: 'text-danger',  glow: 'shadow-[0_0_20px_rgba(255,77,109,0.3)]' },
    'החזק':   { bg: 'bg-warning/15', border: 'border-warning/40', text: 'text-warning', glow: 'shadow-[0_0_15px_rgba(255,209,102,0.2)]' },
  }
  const c = config[decision] || config['החזק']
  return (
    <div className={`${c.bg} ${c.border} ${c.glow} border rounded-2xl
                     px-8 py-4 text-center`}>
      <div className={`text-4xl font-black ${c.text}`}>{decision}</div>
      <div className="text-muted text-sm mt-1">
        ביטחון: <span className={`font-bold ${c.text}`}>{Math.round(confidence * 100)}%</span>
      </div>
    </div>
  )
}

function ConfidenceBar({ label, value, color }) {
  const pct = Math.round(value * 100)
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted text-xs w-20 text-left shrink-0">{label}</span>
      <div className="flex-1 bg-white/5 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-white text-xs font-bold w-10 text-right">{pct}%</span>
    </div>
  )
}

function ReasoningText({ text }) {
  if (!text) return null
  return (
    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
      {text.split('\n').map((line, i) => {
        // Bold markdown **text**
        const parts = line.split(/\*\*(.*?)\*\*/g)
        return (
          <p key={i} className={line.startsWith('📊') || line.startsWith('📐') ||
                                 line.startsWith('📰') || line.startsWith('📈') ||
                                 line.startsWith('🛡️') || line.startsWith('**המלצה')
            ? 'mt-3 mb-1' : 'mb-0.5'}>
            {parts.map((part, j) =>
              j % 2 === 1
                ? <strong key={j} className="text-white font-bold">{part}</strong>
                : <span key={j}>{part}</span>
            )}
          </p>
        )
      })}
    </div>
  )
}

function NewsSource({ article, index }) {
  const sentimentConfig = {
    positive: { label: 'חיובי',  color: 'text-accent',  bg: 'bg-accent/10'  },
    negative: { label: 'שלילי',  color: 'text-danger',  bg: 'bg-danger/10'  },
    neutral:  { label: 'ניטרלי', color: 'text-muted',   bg: 'bg-white/5'    },
  }
  const sc = sentimentConfig[article.sentiment] || sentimentConfig.neutral

  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer"
       className="block bg-primary/60 rounded-lg p-3 border border-white/5
                  hover:border-accent/30 transition group">
      <div className="flex items-start gap-2">
        <span className="text-muted text-xs shrink-0 mt-0.5">#{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs leading-snug group-hover:text-accent
                        transition line-clamp-2 font-medium">
            {article.headline}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-xs px-1.5 py-0.5 rounded ${sc.bg} ${sc.color}`}>
              {sc.label}
            </span>
            <span className="text-muted text-xs">{article.source}</span>
            <span className="text-muted text-xs mr-auto">
              ציון: {article.score > 0 ? '+' : ''}{article.score?.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}

function TaSignalRow({ signal }) {
  const isPos = signal.direction > 0
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded
                     ${isPos ? 'bg-accent/5' : 'bg-danger/5'}`}>
      <span className={`text-xs font-medium ${isPos ? 'text-accent' : 'text-danger'}`}>
        {isPos ? '✅' : '❌'} {signal.signal}
      </span>
      <span className="text-muted text-xs">משקל: {Math.round(signal.weight * 100)}%</span>
    </div>
  )
}

export default function ReasoningPanel({ symbol }) {
  const [tab, setTab] = useState('decision')   // 'decision' | 'ta' | 'sources'

  const { data, isLoading, error, refetch } = useQuery({
    queryKey:   ['signal', symbol],
    queryFn:    () => signalsAPI.getSignal(symbol),
    enabled:    !!symbol,
    staleTime:  15 * 60_000,
    retry:      1,
  })

  if (isLoading) return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl">🤖</span>
        <h3 className="text-white font-bold">מנוע Alpha — מחשב...</h3>
      </div>
      <div className="space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="h-4 bg-white/5 rounded animate-pulse" />
        ))}
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-base">🤖 מנוע Alpha</h3>
        <button onClick={refetch}
          className="text-xs text-accent hover:underline">נסה שוב</button>
      </div>
      <p className="text-danger text-sm">⚠️ שגיאה בטעינת האות. בדוק שהשרת פועל.</p>
    </div>
  )

  const {
    decision, confidence, entry_price, stop_loss, take_profit,
    risk_reward, reasoning_he, sources = [], ml_result = {},
    sentiment = {}, ta_signals = [], risk = {}, cached, error,
  } = data

  const probabilities = ml_result?.probabilities || {}

  return (
    <div className="card">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h3 className="text-white font-bold text-base">מנוע Alpha — {symbol}</h3>
          {cached && (
            <span className="text-xs text-muted bg-white/5 rounded px-2 py-0.5">
              ממטמון
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-accent hover:underline"
        >
          🔄 רענן
        </button>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="mb-4 bg-danger/10 border border-danger/30 rounded-lg px-4 py-3">
          <p className="text-danger text-xs font-bold mb-0.5">⚠️ שגיאה בחישוב האות</p>
          <p className="text-danger/70 text-xs font-mono break-all">{error}</p>
        </div>
      )}

      {/* ── Decision Badge ── */}
      {!error && (
      <div className="mb-4">
        <DecisionBadge decision={decision} confidence={confidence} />
      </div>
      )}

      {/* ── Key Levels ── */}
      {entry_price && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'כניסה',    value: `$${entry_price?.toFixed(2)}`,  color: 'text-warning' },
            { label: 'סטופ',     value: stop_loss    ? `$${stop_loss.toFixed(2)}`    : '—', color: 'text-danger'  },
            { label: 'מטרה',     value: take_profit  ? `$${take_profit.toFixed(2)}`  : '—', color: 'text-accent'  },
          ].map(l => (
            <div key={l.label} className="bg-primary rounded-lg p-2 text-center">
              <div className="text-muted text-xs mb-0.5">{l.label}</div>
              <div className={`font-bold text-sm ${l.color}`} dir="ltr">{l.value}</div>
            </div>
          ))}
        </div>
      )}

      {risk_reward && (
        <div className="text-center text-xs text-muted mb-4">
          יחס סיכון/תגמול: <span className="text-white font-bold">1:{risk_reward}</span>
          {risk?.recommended_shares && (
            <span className="mr-3">
              פוזיציה מומלצת:{' '}
              <span className="text-white font-bold">{risk.recommended_shares} יחידות</span>
            </span>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex rounded-lg overflow-hidden border border-white/10 mb-4">
        {[
          { id: 'decision', label: '🧠 ניתוח'  },
          { id: 'ta',       label: '📐 אותות TA' },
          { id: 'sources',  label: `📰 מקורות (${sources.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-bold transition
              ${tab === t.id
                ? 'bg-accent text-primary'
                : 'text-muted hover:text-white hover:bg-white/5'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {tab === 'decision' && (
        <div className="space-y-4">
          {/* ML Probabilities */}
          {Object.keys(probabilities).length > 0 && (
            <div className="space-y-2">
              <p className="text-muted text-xs font-bold uppercase tracking-wide mb-2">
                הסתברויות מודל ML
              </p>
              <ConfidenceBar label="קנייה"  value={probabilities.buy  || 0} color="bg-accent" />
              <ConfidenceBar label="החזק"   value={probabilities.hold || 0} color="bg-warning" />
              <ConfidenceBar label="מכירה"  value={probabilities.sell || 0} color="bg-danger"  />
            </div>
          )}

          {/* Sentiment Summary */}
          {sentiment.aggregate_score !== undefined && (
            <div className="bg-primary rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted text-xs">סנטימנט חדשות</span>
                <span className={`text-xs font-bold
                  ${sentiment.aggregate_score > 0 ? 'text-accent' : 
                    sentiment.aggregate_score < 0 ? 'text-danger' : 'text-muted'}`}>
                  {sentiment.label}
                </span>
              </div>
              <div className="flex gap-3 text-xs text-muted">
                <span>✅ {sentiment.bullish_count} חיוביות</span>
                <span>❌ {sentiment.bearish_count} שליליות</span>
                <span>⚪ {sentiment.neutral_count} ניטרלי</span>
              </div>
            </div>
          )}

          {/* Full Reasoning */}
          {reasoning_he && (
            <div className="bg-primary/50 rounded-lg p-3 border border-white/5">
              <p className="text-muted text-xs font-bold uppercase tracking-wide mb-2">
                פירוט ומקורות
              </p>
              <ReasoningText text={reasoning_he} />
            </div>
          )}
        </div>
      )}

      {tab === 'ta' && (
        <div className="space-y-1.5">
          {ta_signals.length === 0 ? (
            <p className="text-muted text-sm text-center py-3">אין אותות טכניים זמינים</p>
          ) : (
            ta_signals.map((s, i) => <TaSignalRow key={i} signal={s} />)
          )}
        </div>
      )}

      {tab === 'sources' && (
        <div className="space-y-2">
          {sources.length === 0 ? (
            <p className="text-muted text-sm text-center py-3">
              אין כתבות חדשות זמינות
            </p>
          ) : (
            sources.map((a, i) => <NewsSource key={i} article={a} index={i} />)
          )}
        </div>
      )}
    </div>
  )
}
