import { useMemo, useState } from 'react'

const apiUrl = 'http://localhost:8000/simulate'

const initialCurve = [
  { tenor: '1Y', years: 1, rate: 2.9 },
  { tenor: '2Y', years: 2, rate: 2.75 },
  { tenor: '5Y', years: 5, rate: 2.62 },
  { tenor: '10Y', years: 10, rate: 2.55 },
  { tenor: '30Y', years: 30, rate: 2.48 },
]

const defaultCorrelations = {
  '1Y': { '1Y': 1, '2Y': 0.85, '5Y': 0.6, '10Y': 0.45, '30Y': 0.25 },
  '2Y': { '1Y': 0.85, '2Y': 1, '5Y': 0.72, '10Y': 0.55, '30Y': 0.35 },
  '5Y': { '1Y': 0.6, '2Y': 0.72, '5Y': 1, '10Y': 0.8, '30Y': 0.55 },
  '10Y': { '1Y': 0.45, '2Y': 0.55, '5Y': 0.8, '10Y': 1, '30Y': 0.78 },
  '30Y': { '1Y': 0.25, '2Y': 0.35, '5Y': 0.55, '10Y': 0.78, '30Y': 1 },
}

const strategies = [
  { name: '2s10s Spread', weights: { '2Y': -1, '10Y': 1 } },
  { name: '5s10s30s Butterfly', weights: { '5Y': 1, '10Y': -2, '30Y': 1 } },
]

function curveToCoords(curve, width, height, pad) {
  const minY = Math.min(...curve.map((p) => p.rate)) - 0.2
  const maxY = Math.max(...curve.map((p) => p.rate)) + 0.2
  const xMax = Math.max(...curve.map((p) => p.years))

  return curve.map((p) => ({
    ...p,
    x: pad + (p.years / xMax) * (width - 2 * pad),
    y: height - pad - ((p.rate - minY) / (maxY - minY)) * (height - 2 * pad),
    minY,
    maxY,
  }))
}

function clampCorr(value) {
  return Math.max(-1, Math.min(1, value))
}

function normalizeCorrelationMatrix(matrix, tenors) {
  const next = { ...matrix }
  tenors.forEach((rowTenor) => {
    if (!next[rowTenor]) next[rowTenor] = {}
    tenors.forEach((colTenor) => {
      if (rowTenor === colTenor) {
        next[rowTenor][colTenor] = 1
      } else {
        const v1 = next[rowTenor]?.[colTenor]
        const v2 = next[colTenor]?.[rowTenor]
        const chosen = Number.isFinite(v1) ? v1 : Number.isFinite(v2) ? v2 : 0
        const clipped = clampCorr(chosen)
        next[rowTenor][colTenor] = clipped
        if (!next[colTenor]) next[colTenor] = {}
        next[colTenor][rowTenor] = clipped
      }
    })
  })
  return next
}

export default function App() {
  const [curve, setCurve] = useState(initialCurve)
  const [simulated, setSimulated] = useState(initialCurve)
  const [correlations, setCorrelations] = useState(defaultCorrelations)
  const [metrics, setMetrics] = useState([])
  const [dragging, setDragging] = useState(null)
  const [error, setError] = useState('')

  const width = 900
  const height = 420
  const pad = 50
  const tenors = curve.map((c) => c.tenor)

  const points = useMemo(() => curveToCoords(curve, width, height, pad), [curve])
  const simPoints = useMemo(() => curveToCoords(simulated, width, height, pad), [simulated])

  const runSimulation = async (tenor, newRate, nextCurve = curve) => {
    setError('')

    const payload = {
      curve: nextCurve,
      moved_tenor: tenor,
      new_rate: Number(newRate.toFixed(4)),
      correlations: normalizeCorrelationMatrix(correlations, tenors),
      strategies,
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      setError('Simulation impossible: vérifie les données de taux/corrélations.')
      return
    }

    const data = await response.json()
    setSimulated(data.simulated_curve)
    setMetrics(data.strategy_results)
  }

  const onMouseMove = (event) => {
    if (!dragging) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - bounds.top
    const { minY, maxY } = points[0]
    const normalized = 1 - (y - pad) / (height - 2 * pad)
    const newRate = minY + normalized * (maxY - minY)

    const nextCurve = curve.map((point) =>
      point.tenor === dragging ? { ...point, rate: Number(newRate.toFixed(4)) } : point,
    )

    setCurve(nextCurve)
  }

  const onMouseUp = async () => {
    if (!dragging) return
    const moved = curve.find((point) => point.tenor === dragging)
    setDragging(null)
    if (moved) {
      await runSimulation(moved.tenor, moved.rate)
    }
  }

  const updateRate = (tenor, value) => {
    const parsed = Number(value)
    const nextCurve = curve.map((point) =>
      point.tenor === tenor ? { ...point, rate: Number.isFinite(parsed) ? parsed : point.rate } : point,
    )
    setCurve(nextCurve)
  }

  const simulateFromInput = async () => {
    if (!curve.length) return
    await runSimulation(curve[0].tenor, curve[0].rate, curve)
  }

  const updateCorrelation = (rowTenor, colTenor, value) => {
    const parsed = Number(value)
    const safe = Number.isFinite(parsed) ? clampCorr(parsed) : 0

    setCorrelations((prev) => {
      const next = {
        ...prev,
        [rowTenor]: { ...(prev[rowTenor] || {}) },
        [colTenor]: { ...(prev[colTenor] || {}) },
      }

      if (rowTenor === colTenor) {
        next[rowTenor][colTenor] = 1
      } else {
        next[rowTenor][colTenor] = safe
        next[colTenor][rowTenor] = safe
      }

      return next
    })
  }

  const path = points.map((p) => `${p.x},${p.y}`).join(' ')
  const simPath = simPoints.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <main className="container">
      <h1>Interest Rate Curve Sandbox</h1>
      <p>
        Tu peux déplacer les points sur le graphe <strong>ou</strong> saisir manuellement les taux et
        corrélations ci-dessous, puis lancer la simulation.
      </p>

      <svg width={width} height={height} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="axis" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} className="axis" />

        <polyline points={simPath} className="line simulated" />
        <polyline points={path} className="line current" />

        {points.map((point) => (
          <g key={point.tenor}>
            <circle
              cx={point.x}
              cy={point.y}
              r="8"
              className="point"
              onMouseDown={() => setDragging(point.tenor)}
            />
            <text x={point.x - 12} y={height - pad + 20} className="label">
              {point.tenor}
            </text>
            <text x={point.x - 18} y={point.y - 12} className="rate">
              {point.rate.toFixed(2)}%
            </text>
          </g>
        ))}
      </svg>

      <section className="panel">
        <h2>Saisie manuelle des taux</h2>
        <div className="inline-grid">
          {curve.map((point) => (
            <label key={point.tenor}>
              {point.tenor}
              <input
                type="number"
                step="0.01"
                value={point.rate}
                onChange={(event) => updateRate(point.tenor, event.target.value)}
              />
            </label>
          ))}
          <button onClick={simulateFromInput}>Simuler avec la saisie</button>
        </div>
      </section>

      <section className="panel">
        <h2>Saisie manuelle des corrélations</h2>
        <p>La diagonale est fixée à 1, la matrice est symétrique, et chaque valeur est bornée entre -1 et 1.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Corr</th>
                {tenors.map((tenor) => (
                  <th key={tenor}>{tenor}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenors.map((rowTenor) => (
                <tr key={rowTenor}>
                  <th>{rowTenor}</th>
                  {tenors.map((colTenor) => (
                    <td key={`${rowTenor}-${colTenor}`}>
                      <input
                        type="number"
                        step="0.01"
                        min="-1"
                        max="1"
                        value={correlations[rowTenor]?.[colTenor] ?? 0}
                        onChange={(event) =>
                          updateCorrelation(rowTenor, colTenor, event.target.value)
                        }
                        disabled={rowTenor === colTenor}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel advice">
        <h2>Conseil corrélations (point de départ)</h2>
        <ul>
          <li>Voisins de maturité (1Y-2Y, 5Y-10Y): souvent élevées, par exemple 0.75 à 0.95.</li>
          <li>Courte vs longue extrémité (1Y-30Y): plus faible, souvent 0.20 à 0.55.</li>
          <li>En stress de marché, les corrélations montent souvent vers 1 (effet de "parallel move").</li>
          <li>Utilise une matrice symétrique et stable (petits ajustements incrémentaux).</li>
          <li>
            Méthode pratique: démarre avec une décroissance selon la distance de tenor, puis calibre avec tes
            historiques (rolling 1 an / 3 ans).
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>Évolution des stratégies</h2>
        {error && <p className="error">{error}</p>}
        {metrics.length === 0 ? (
          <p>Déplace un point ou clique “Simuler avec la saisie”.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Stratégie</th>
                <th>Initial</th>
                <th>Simulé</th>
                <th>Δ (bp)</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.name}>
                  <td>{metric.name}</td>
                  <td>{metric.initial_value.toFixed(4)}</td>
                  <td>{metric.simulated_value.toFixed(4)}</td>
                  <td>{metric.change_bp.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
