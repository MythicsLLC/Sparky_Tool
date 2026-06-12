import io
import math
from typing import Any
import pandas as pd


def _f(val) -> float | None:
    """float() that maps NaN/Inf to None so JSON serialisation never fails."""
    f = float(val)
    return None if not math.isfinite(f) else f


def parse_and_compute(csv_bytes: bytes) -> dict[str, Any]:
    df = pd.read_csv(io.BytesIO(csv_bytes))

    kpis: dict[str, Any] = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            kpis[col] = {
                "type": "numeric",
                "count": int(df[col].count()),
                "sum": _f(df[col].sum()),
                "mean": _f(df[col].mean()),
                "min": _f(df[col].min()),
                "max": _f(df[col].max()),
            }
        else:
            kpis[col] = {
                "type": "categorical",
                "count": int(df[col].count()),
                "unique_count": int(df[col].nunique()),
                "value_counts": {
                    str(k): int(v)
                    for k, v in df[col].value_counts().head(10).items()
                },
            }

    return {
        "kpis": kpis,
        "rows": df.to_dict(orient="records"),
        "columns": list(df.columns),
        "row_count": len(df),
    }
