from __future__ import annotations

from typing import Dict, List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="Interest Rate Curve Simulator",
    description="Simule l'impact des déplacements de points de courbe via corrélations.",
)


class CurvePoint(BaseModel):
    tenor: str
    years: float = Field(gt=0)
    rate: float


class StrategyDefinition(BaseModel):
    name: str
    weights: Dict[str, float]


class SimulationRequest(BaseModel):
    curve: List[CurvePoint]
    moved_tenor: str
    new_rate: float
    correlations: Dict[str, Dict[str, float]]
    strategies: List[StrategyDefinition] = []


class StrategyResult(BaseModel):
    name: str
    initial_value: float
    simulated_value: float
    change_bp: float


class SimulationResponse(BaseModel):
    initial_curve: List[CurvePoint]
    simulated_curve: List[CurvePoint]
    shock_bp: float
    strategy_results: List[StrategyResult]


def strategy_value(weights: Dict[str, float], curve: Dict[str, float]) -> float:
    return sum(weights.get(tenor, 0.0) * curve[tenor] for tenor in weights if tenor in curve)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/simulate", response_model=SimulationResponse)
def simulate(req: SimulationRequest) -> SimulationResponse:
    curve_map = {pt.tenor: pt.rate for pt in req.curve}

    if req.moved_tenor not in curve_map:
        raise HTTPException(status_code=400, detail=f"Tenor {req.moved_tenor} absent de la courbe.")

    old_rate = curve_map[req.moved_tenor]
    shock_bp = (req.new_rate - old_rate) * 100.0

    simulated = curve_map.copy()
    simulated[req.moved_tenor] = req.new_rate

    for tenor, rate in curve_map.items():
        if tenor == req.moved_tenor:
            continue
        corr = req.correlations.get(req.moved_tenor, {}).get(tenor, 0.0)
        impacted_bp = shock_bp * corr
        simulated[tenor] = rate + impacted_bp / 100.0

    initial_curve = req.curve
    simulated_curve = [
        CurvePoint(
            tenor=pt.tenor,
            years=pt.years,
            rate=round(simulated[pt.tenor], 4),
        )
        for pt in sorted(req.curve, key=lambda item: item.years)
    ]

    strategy_results: List[StrategyResult] = []
    for strategy in req.strategies:
        initial_val = strategy_value(strategy.weights, curve_map)
        simulated_val = strategy_value(strategy.weights, simulated)
        strategy_results.append(
            StrategyResult(
                name=strategy.name,
                initial_value=round(initial_val, 6),
                simulated_value=round(simulated_val, 6),
                change_bp=round((simulated_val - initial_val) * 100.0, 4),
            )
        )

    return SimulationResponse(
        initial_curve=initial_curve,
        simulated_curve=simulated_curve,
        shock_bp=round(shock_bp, 4),
        strategy_results=strategy_results,
    )
