# Backend FastAPI

## Lancer en local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API disponible sur `http://localhost:8000/docs`.
