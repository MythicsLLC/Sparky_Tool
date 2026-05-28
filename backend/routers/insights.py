import io
import json
import os
import re
import time
import datetime
import httpx
import pandas as pd
import google.generativeai as genai
from fastapi import APIRouter, Depends, File, Query, HTTPException, UploadFile
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from encrypt import decrypt
from openai import OpenAI
import anthropic as _anthropic_sdk
from models import User, UserConfig, AiModel
from logger import get_logger

log = get_logger("insights")
router = APIRouter(prefix="/api/v2/insights", tags=["insights"])

# backend/routers/insights.py  →  ../Output Files
_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "Output Files")


# ── helpers ────────────────────────────────────────────────────────────────────

def _list_corehr_files() -> list[dict]:
    """Return metadata for every .csv in Output Files/, newest first."""
    if not os.path.isdir(_OUTPUT_DIR):
        return []
    files = []
    for name in os.listdir(_OUTPUT_DIR):
        if not name.lower().endswith(".csv"):
            continue
        full = os.path.join(_OUTPUT_DIR, name)
        stat = os.stat(full)
        files.append({
            "filename":    name,
            "modified_at": stat.st_mtime,
            "size_bytes":  stat.st_size,
        })
    files.sort(key=lambda f: f["modified_at"], reverse=True)
    for f in files:
        f["modified_at"] = datetime.datetime.fromtimestamp(
            f["modified_at"], tz=datetime.timezone.utc
        ).isoformat()
    return files


def _parse_corehr_file(filename: str) -> dict:
    """
    Parse a CoreHR Discovery CSV into structured sections.

    File structure:
      Header block (asterisks / run metadata)
      **Countries implemented**
        KEY : ,VALUE   (space-key-space-colon-comma-value)
      ----  (first separator)
        KEY,VALUE      (modules Y/N  or  parameters)
      ----  (second separator)
        BU header row
        BU data rows (CODE,,Description)
    """
    safe_name = os.path.basename(filename)          # prevent path traversal
    full_path = os.path.join(_OUTPUT_DIR, safe_name)
    if not os.path.isfile(full_path):
        raise HTTPException(404, f"File not found: {safe_name}")

    with open(full_path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()

    run_date          = ""
    company           = ""
    countries:  dict  = {}
    modules:    dict  = {}
    parameters: dict  = {}
    business_units    = []

    STATE_HEADER    = "header"
    STATE_COUNTRIES = "countries"
    STATE_MOD_PARAMS= "mod_params"
    STATE_BU_HEADER = "bu_header"
    STATE_BU_DATA   = "bu_data"

    state           = STATE_HEADER
    separator_count = 0

    for raw_line in lines:
        stripped = raw_line.strip()

        # Run Date Time appears in the header block
        if "Run Date Time" in raw_line and ":" in raw_line:
            run_date = raw_line.split(":", 1)[1].strip()
            continue

        # Section marker for Countries
        if "Countries implemented" in raw_line:
            state = STATE_COUNTRIES
            continue

        # Separator lines advance the state machine
        if stripped.startswith("---"):
            separator_count += 1
            if separator_count == 1:
                state = STATE_MOD_PARAMS
            elif separator_count == 2:
                state = STATE_BU_HEADER
            continue

        # Skip blank, asterisk-only, or whitespace-only lines
        if not stripped or all(c in "*= \t" for c in stripped):
            continue

        if state == STATE_COUNTRIES:
            # Format: " COMPANY : ,SHD"  or  " USA : ,Y"
            if " : ," in raw_line:
                key, val = raw_line.split(" : ,", 1)
                key = key.strip()
                val = val.strip()
                if key == "COMPANY":
                    company = val
                elif key != "COUNTRY":          # skip the COUNTRY label row
                    countries[key] = (val.upper() == "Y")

        elif state == STATE_MOD_PARAMS:
            # Format: "Benefits Administration,Y"  or  "To Currency,USD"
            if "," in stripped:
                key, val = stripped.split(",", 1)
                key = key.strip()
                val = val.strip()
                if not key:
                    continue
                if val.upper() in ("Y", "N"):
                    modules[key] = (val.upper() == "Y")
                else:
                    parameters[key] = val

        elif state == STATE_BU_HEADER:
            # Skip the column-header row, then move to data
            state = STATE_BU_DATA

        elif state == STATE_BU_DATA:
            # Format: "SHAND,,UF Health"
            parts = [p.strip() for p in stripped.split(",")]
            if parts and parts[0]:
                business_units.append({
                    "code":        parts[0],
                    "active":      parts[1] if len(parts) > 1 else "",
                    "description": parts[2] if len(parts) > 2 else "",
                })

    return {
        "run_date":       run_date,
        "company":        company,
        "countries":      countries,
        "modules":        modules,
        "parameters":     parameters,
        "business_units": business_units,
    }


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.get("/corehr/files")
def list_corehr_files(user: User = Depends(get_current_user)):
    """List all CoreHR Discovery CSV files available for viewing."""
    files = _list_corehr_files()
    log.debug("list_corehr_files  user=%s  count=%d", user.id[:8], len(files))
    return {"files": files}


@router.get("/corehr/file")
def get_corehr_file(
    filename: str = Query(..., description="Filename from /corehr/files"),
    user: User = Depends(get_current_user),
):
    """Parse and return a single CoreHR Discovery file."""
    log.debug("get_corehr_file  user=%s  file=%s", user.id[:8], filename)
    return _parse_corehr_file(filename)


@router.get("/health")
def check_health(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Live connectivity check for the calling user's most-recently-updated
    active config.  Tests PeopleSoft (HTTP GET) and Windows Server.
    """
    config: UserConfig | None = (
        db.query(UserConfig)
        .filter(UserConfig.user_id == user.id, UserConfig.is_active == True)  # noqa: E712
        .order_by(UserConfig.updated_at.desc())
        .first()
    )

    if not config:
        return {
            "peoplesoft": {"status": "no_config"},
            "windows":    {"status": "no_config"},
        }

    result = {}

    # ── PeopleSoft ────────────────────────────────────────────────────────────
    ps_url = (config.ps_base_url or "").strip()
    if ps_url:
        t0 = time.time()
        try:
            with httpx.Client(timeout=5.0) as client:
                client.get(ps_url)
            result["peoplesoft"] = {
                "status":     "ok",
                "latency_ms": round((time.time() - t0) * 1000),
            }
        except Exception as exc:
            result["peoplesoft"] = {"status": "error", "error": str(exc)[:120]}
    else:
        result["peoplesoft"] = {"status": "not_configured"}

    # ── Windows Server ────────────────────────────────────────────────────────
    win_host = (config.win_host or "").strip()
    if win_host:
        win_pass = decrypt(config.win_password_enc) if config.win_password_enc else ""
        t0 = time.time()
        try:
            ctype = config.win_connection_type or "winrm"
            if ctype == "smb":
                import smb_client
                smb_client.test_connection(
                    win_host, config.win_username, win_pass,
                    share=config.win_share or "C$",
                    domain=config.win_domain or "",
                    port=config.win_port or 445,
                )
            elif ctype == "ssh":
                import win_ssh_client
                win_ssh_client.test_connection(
                    win_host, config.win_username, win_pass,
                    port=config.win_port or 22,
                )
            else:
                import windows_client
                windows_client.test_connection(
                    win_host, config.win_username, win_pass,
                    config.win_port or 5985,
                    config.win_use_ssl or False,
                    config.win_auth_type or "ntlm",
                )
            result["windows"] = {
                "status":     "ok",
                "latency_ms": round((time.time() - t0) * 1000),
            }
        except Exception as exc:
            result["windows"] = {"status": "error", "error": str(exc)[:120]}
    else:
        result["windows"] = {"status": "not_configured"}

    log.debug(
        "check_health  user=%s  ps=%s  win=%s",
        user.id[:8], result["peoplesoft"]["status"], result["windows"]["status"],
    )
    return result


# ── File Analysis via Gemini ───────────────────────────────────────────────────

_GEMINI_COLORS = [
    "#6b8f71", "#6495b4", "#c9a84c", "#b45050",
    "#9b59b6", "#e67e22", "#1abc9c", "#e74c3c",
    "#3498db", "#2ecc71", "#f39c12", "#8e44ad",
]

_CHART_PROMPT = """You are a data visualisation expert. Analyse this dataset and return chart specifications as JSON.

Dataset:
{profile}

Return a single JSON object (NO markdown, NO code fences, raw JSON only) with this exact structure:
{{
  "summary": "2-3 sentence plain-English description of what this dataset contains and key patterns",
  "charts": [
    {{
      "id": "c1",
      "type": "bar|line|area|pie|radialBar|scatter|composed",
      "title": "Short descriptive title",
      "description": "One sentence explaining the insight",
      "data": [ ... ],
      "xKey": "field used for X axis (bar/line/area/scatter/composed only)",
      "yKeys": ["field1", "field2"],
      "nameKey": "field used for labels (pie/radialBar only)",
      "dataKey": "field used for values (pie/radialBar only)",
      "colors": ["#hex1", "#hex2"]
    }}
  ]
}}

Data format rules per chart type:
- bar/line/area/composed  → data is array of objects; set xKey + yKeys
- pie                     → data is [{{"name":"...", "value": number}}]; set nameKey="name" dataKey="value"
- radialBar               → data is [{{"name":"...", "value": 0-100 (percentage)}}]; set nameKey + dataKey
- scatter                 → data is [{{"x": number, "y": number, "label":"..."}}]; set xKey="x" yKeys=["y"]

General rules:
- Produce 5–8 charts that together tell a complete story about the data
- Pre-aggregate/group the data — do NOT put hundreds of raw rows in any chart
- For bar/line/area keep at most 20 data points; use top-N or time-bucketing as needed
- Choose chart type wisely: pie for ≤8 slices, radialBar for KPI-style percentages, scatter for correlations
- Colors to use: {colors}
- Assign one color per yKey or per pie/radialBar slice
- Return ONLY valid JSON. No explanation. No markdown."""


def _build_profile(df: pd.DataFrame, filename: str, max_sample: int = 100) -> dict:
    """Build a compact dataset profile for the Gemini prompt."""
    profile: dict = {
        "filename": filename,
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "columns": [],
    }

    for col in df.columns:
        series = df[col].dropna()
        info: dict = {
            "name": col,
            "dtype": str(df[col].dtype),
            "null_pct": round(df[col].isna().mean() * 100, 1),
            "unique": int(df[col].nunique()),
        }
        if pd.api.types.is_numeric_dtype(df[col]) and len(series):
            info["min"]  = float(series.min())
            info["max"]  = float(series.max())
            info["mean"] = round(float(series.mean()), 4)
            info["sum"]  = round(float(series.sum()), 4)
        else:
            info["top_values"] = series.value_counts().head(8).to_dict()
        profile["columns"].append(info)

    # Aggregate value_counts for every categorical column (helps Gemini make pie/bar)
    cat_aggs = {}
    for col in df.select_dtypes(exclude="number").columns:
        vc = df[col].value_counts().head(15)
        cat_aggs[col] = vc.to_dict()
    if cat_aggs:
        profile["category_counts"] = cat_aggs

    # Numeric correlations (small matrix)
    num_cols = df.select_dtypes(include="number").columns.tolist()
    if len(num_cols) >= 2:
        corr = df[num_cols].corr().round(2).to_dict()
        profile["correlations"] = corr

    # Sample rows (capped)
    sample = df.head(max_sample).where(pd.notnull(df), other=None)
    profile["sample_rows"] = json.loads(sample.to_json(orient="records", date_format="iso"))

    return profile


def _extract_json(text: str) -> dict:
    """Strip optional markdown fences and parse JSON from Gemini response."""
    # Remove ```json ... ``` or ``` ... ``` wrappers
    clean = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    return json.loads(clean)


@router.post("/analyze-file")
async def analyze_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    """
    Accept a CSV or Excel upload, build a dataset profile, ask Gemini to
    recommend charts, and return a chart-spec JSON ready for the frontend.
    """
    # ── read file ────────────────────────────────────────────────────────────
    raw = await file.read()
    fname = file.filename or "upload"
    ext   = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(raw), on_bad_lines="skip")
        elif ext in ("xlsx", "xlsm"):
            df = pd.read_excel(io.BytesIO(raw), engine="openpyxl")
        elif ext == "xls":
            df = pd.read_excel(io.BytesIO(raw), engine="xlrd")
        else:
            raise HTTPException(400, f"Unsupported file type: .{ext}  (use .csv / .xlsx / .xls)")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not parse file: {exc}") from exc

    if df.empty:
        raise HTTPException(422, "File is empty or could not be read")

    # ── build compact profile ────────────────────────────────────────────────
    profile = _build_profile(df, fname)
    log.info(
        "analyze_file  user=%s  file=%s  rows=%d  cols=%d",
        user.id[:8], fname, profile["total_rows"], profile["total_columns"],
    )

    # ── resolve the active AI model ──────────────────────────────────────────
    db_model = db.query(AiModel).filter(
        AiModel.is_default == True, AiModel.is_active == True  # noqa: E712
    ).first()

    if db_model:
        provider  = db_model.provider
        model_id  = db_model.model_id
        api_key   = decrypt(db_model.api_key_enc) if db_model.api_key_enc else ""
        base_url  = db_model.base_url or ""
    else:
        # fall back to environment variable (backwards-compat)
        provider  = "gemini"
        model_id  = "gemini-1.5-flash"
        api_key   = os.environ.get("GEMINI_API_KEY", "").strip()
        base_url  = ""

    if not api_key:
        raise HTTPException(503, "No AI model API key configured. Add one in Admin → AI Models.")

    # ── call the provider ────────────────────────────────────────────────────
    prompt = _CHART_PROMPT.format(
        profile=json.dumps(profile, indent=2, default=str),
        colors=", ".join(_GEMINI_COLORS),
    )

    try:
        if provider == "gemini":
            genai.configure(api_key=api_key)
            gm = genai.GenerativeModel(
                model_name=model_id,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            response = gm.generate_content(prompt)
            chart_spec = _extract_json(response.text)

        elif provider in ("openai", "grok", "generic"):
            client_kwargs = {"api_key": api_key}
            if base_url:
                client_kwargs["base_url"] = base_url
            elif provider == "grok":
                client_kwargs["base_url"] = "https://api.x.ai/v1"
            oai = OpenAI(**client_kwargs)
            resp = oai.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            chart_spec = json.loads(resp.choices[0].message.content)

        elif provider == "anthropic":
            ant = _anthropic_sdk.Anthropic(api_key=api_key)
            msg = ant.messages.create(
                model=model_id,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = msg.content[0].text
            chart_spec = _extract_json(raw)

        else:
            raise HTTPException(400, f"Unknown provider: {provider}")

    except HTTPException:
        raise
    except json.JSONDecodeError as exc:
        log.error("AI provider returned non-JSON for provider=%s", provider)
        raise HTTPException(502, f"AI provider returned invalid JSON: {exc}") from exc
    except Exception as exc:
        log.error("AI provider call failed provider=%s: %s", provider, exc)
        raise HTTPException(502, f"AI provider error: {exc}") from exc

    # Attach metadata so the frontend can display it
    chart_spec["meta"] = {
        "filename":      fname,
        "total_rows":    profile["total_rows"],
        "total_columns": profile["total_columns"],
        "columns":       [c["name"] for c in profile["columns"]],
    }

    log.info(
        "analyze_file  user=%s  charts_returned=%d",
        user.id[:8], len(chart_spec.get("charts", [])),
    )
    return chart_spec
