import json
from pathlib import Path

from fastapi import HTTPException

INPUT_DATA_PATH = Path(__file__).with_name("input_data.json")


def load_input_data() -> dict:
    try:
        with INPUT_DATA_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Initial data not found.") from exc
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc
