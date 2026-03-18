# Simulateur de courbe de taux (React + FastAPI)

Application de démonstration pour:
- déplacer un point de courbe en drag & drop,
- **rentrer manuellement les taux**,
- **rentrer manuellement les corrélations**,
- mesurer l'impact sur des stratégies de type **spread** et **butterfly**.

## Architecture

- `frontend/` : React (Vite), visualisation SVG interactive + formulaires de saisie.
- `backend/` : FastAPI, moteur de simulation.

## Démarrage rapide

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Ensuite ouvrir `http://localhost:5173`.

## Principe de calcul

1. Tu bouges un tenor (ex: `10Y`) à un nouveau taux **ou** tu saisis tes taux et lances une simulation.
2. Le choc en bp est calculé: `shock_bp = (new_rate - old_rate) * 100`.
3. Chaque tenor `j` reçoit `shock_bp * corr(moved_tenor, j)`.
4. Les stratégies sont recalculées par somme pondérée des taux.

Exemple stratégies incluses:
- **2s10s spread** : `-1 * 2Y + 1 * 10Y`
- **5s10s30s butterfly** : `1 * 5Y - 2 * 10Y + 1 * 30Y`

## Conseils de calibration des corrélations

- Mets `1.00` sur la diagonale.
- Entre tenors voisins, commence autour de `0.75` à `0.95`.
- Entre extrémités courte/longue (ex: 1Y-30Y), commence plutôt à `0.20`-`0.55`.
- Garde la matrice symétrique (`corr(i,j)=corr(j,i)`) et bornée entre `-1` et `1`.
- Calibre ensuite avec tes historiques (rolling windows) et par régime de marché (normal/stress).
