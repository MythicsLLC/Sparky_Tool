import io
import json
import os
import re
import time
import datetime
import httpx
import pandas as pd
from google import genai as _genai
from google.genai import types as _genai_types
from fastapi import APIRouter, Depends, File, Query, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from encrypt import decrypt
from openai import OpenAI
import anthropic as _anthropic_sdk
from models import User, UserConfig, AiModel
from logger import get_logger
from pii_masker import PIIMasker
from pdf_generator import (
    generate_analysis_pdf, generate_run_pdf,
    generate_functional_pdf, generate_operational_pdf,
)

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
- Multi-sheet rule: if the profile contains a "sheets" key, analyse EVERY sheet and produce charts
  covering all sheets. Prefix each chart title with the sheet name (e.g. "Payroll – Monthly Totals").
  Also include at least one cross-sheet comparison chart where the data permits it.
- Return ONLY valid JSON. No explanation. No markdown."""


def _build_sheet_profile(df: pd.DataFrame, max_sample: int = 100) -> dict:
    """Build a profile dict for a single DataFrame (one sheet or a CSV)."""
    profile: dict = {
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

    cat_aggs = {}
    for col in df.select_dtypes(exclude="number").columns:
        vc = df[col].value_counts().head(15)
        cat_aggs[col] = vc.to_dict()
    if cat_aggs:
        profile["category_counts"] = cat_aggs

    num_cols = df.select_dtypes(include="number").columns.tolist()
    if len(num_cols) >= 2:
        corr = df[num_cols].corr().round(2).to_dict()
        profile["correlations"] = corr

    sample = df.head(max_sample).where(pd.notnull(df), other=None)
    profile["sample_rows"] = json.loads(sample.to_json(orient="records", date_format="iso"))

    return profile


_MAX_SHEETS = 10  # guard against workbooks with dozens of sheets


def _build_profile(
    df_or_sheets: "pd.DataFrame | dict[str, pd.DataFrame]",
    filename: str,
    max_sample: int = 100,
) -> dict:
    """Build a compact dataset profile for the AI prompt.

    Accepts either a single DataFrame (CSV / single-sheet Excel) or a dict of
    {sheet_name: DataFrame} for multi-sheet workbooks.
    """
    if not isinstance(df_or_sheets, dict):
        # Single-sheet / CSV path — unchanged behaviour
        profile = _build_sheet_profile(df_or_sheets, max_sample)
        profile["filename"] = filename
        return profile

    # Multi-sheet Excel path
    sheets_raw = {k: v for k, v in df_or_sheets.items() if not v.empty}
    if len(sheets_raw) > _MAX_SHEETS:
        sheets_raw = dict(list(sheets_raw.items())[:_MAX_SHEETS])

    # Scale sample size down so total prompt size stays roughly constant
    per_sheet_sample = max(20, max_sample // len(sheets_raw))

    sheets: dict = {}
    all_col_names: list[str] = []
    total_rows = 0

    for sheet_name, df in sheets_raw.items():
        sp = _build_sheet_profile(df, per_sheet_sample)
        sheets[sheet_name] = sp
        total_rows += sp["total_rows"]
        for c in sp["columns"]:
            if c["name"] not in all_col_names:
                all_col_names.append(c["name"])

    return {
        "filename":       filename,
        "total_rows":     total_rows,
        "total_columns":  len(all_col_names),
        "sheet_count":    len(sheets),
        # flat columns list kept for meta compatibility; full per-sheet detail is in "sheets"
        "columns":        [{"name": n} for n in all_col_names],
        "sheets":         sheets,
    }


def _extract_json(text: str) -> dict:
    """Strip optional markdown fences and parse JSON from Gemini response."""
    # Remove ```json ... ``` or ``` ... ``` wrappers
    clean = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    return json.loads(clean)


@router.get("/ai-models")
def list_active_ai_models(
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    """Return all active AI models (no API keys) so the frontend can populate a selector."""
    models = (
        db.query(AiModel)
        .filter(AiModel.is_active == True)  # noqa: E712
        .order_by(AiModel.is_default.desc(), AiModel.name.asc())
        .all()
    )
    return {
        "items": [
            {
                "id":         m.id,
                "name":       m.name,
                "provider":   m.provider,
                "model_id":   m.model_id,
                "is_default": m.is_default,
            }
            for m in models
        ]
    }


def _run_analysis(raw: bytes, fname: str, user: "User", db: "Session", ai_model_id: "int | None") -> dict:
    """
    Core analysis pipeline — parse bytes, profile data, call AI, return chart spec.
    Shared by the file-upload endpoint and the saved-output re-analyse endpoint.
    """
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""

    try:
        if ext == "csv":
            for _enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
                try:
                    df = pd.read_csv(io.BytesIO(raw), encoding=_enc, on_bad_lines="skip")
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(422, "Could not decode CSV — try saving the file as UTF-8")
        elif ext in ("xlsx", "xlsm"):
            sheets = pd.read_excel(io.BytesIO(raw), engine="openpyxl", sheet_name=None)
            non_empty = {k: v for k, v in sheets.items() if not v.empty}
            df = next(iter(non_empty.values())) if len(non_empty) == 1 else non_empty
        elif ext == "xls":
            sheets = pd.read_excel(io.BytesIO(raw), engine="xlrd", sheet_name=None)
            non_empty = {k: v for k, v in sheets.items() if not v.empty}
            df = next(iter(non_empty.values())) if len(non_empty) == 1 else non_empty
        else:
            # Saved run outputs have no extension in display_name — treat as CSV
            for _enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
                try:
                    df = pd.read_csv(io.BytesIO(raw), encoding=_enc, on_bad_lines="skip")
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(422, f"Unsupported or unreadable file type: .{ext}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not parse file: {exc}") from exc

    is_empty = df.empty if isinstance(df, pd.DataFrame) else not df
    if is_empty:
        raise HTTPException(422, "File is empty or could not be read")

    profile = _build_profile(df, fname)
    sheet_count = profile.get("sheet_count", 1)
    log.info(
        "analyze  user=%s  file=%s  rows=%d  cols=%d  sheets=%d",
        user.id[:8], fname, profile["total_rows"], profile["total_columns"], sheet_count,
    )

    masker = PIIMasker()
    masked_profile, n_masked = masker.mask_profile(profile)
    log.info("analyze  pii_masked=%d  spacy=%s  user=%s", n_masked, masker.spacy_active, user.id[:8])

    if ai_model_id is not None:
        db_model = db.query(AiModel).filter(
            AiModel.id == ai_model_id, AiModel.is_active == True  # noqa: E712
        ).first()
        if not db_model:
            raise HTTPException(404, "Selected AI model not found or not active")
    else:
        db_model = db.query(AiModel).filter(
            AiModel.is_default == True, AiModel.is_active == True  # noqa: E712
        ).first()

    if db_model:
        provider = db_model.provider
        model_id = db_model.model_id
        api_key  = decrypt(db_model.api_key_enc) if db_model.api_key_enc else ""
        base_url = db_model.base_url or ""
    else:
        provider = "gemini"
        model_id = "gemini-1.5-flash"
        api_key  = os.environ.get("GEMINI_API_KEY", "").strip()
        base_url = ""

    if not api_key:
        raise HTTPException(503, "No AI model API key configured. Add one in Admin → AI Models.")

    prompt = _CHART_PROMPT.format(
        profile=json.dumps(masked_profile, indent=2, default=str),
        colors=", ".join(_GEMINI_COLORS),
    )

    prompt_tokens = completion_tokens = reasoning_tokens = cached_tokens = 0

    try:
        if provider == "gemini":
            gc = _genai.Client(api_key=api_key)
            response = gc.models.generate_content(
                model=model_id,
                contents=prompt,
                config=_genai_types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            chart_spec = _extract_json(response.text)
            if response.usage_metadata:
                u = response.usage_metadata
                prompt_tokens     = u.prompt_token_count or 0
                completion_tokens = u.candidates_token_count or 0
                cached_tokens     = u.cached_content_token_count or 0

        elif provider in ("openai", "grok", "generic"):
            client_kwargs: dict = {"api_key": api_key}
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
            if resp.usage:
                prompt_tokens     = resp.usage.prompt_tokens or 0
                completion_tokens = resp.usage.completion_tokens or 0

        elif provider == "anthropic":
            ant = _anthropic_sdk.Anthropic(api_key=api_key)
            msg = ant.messages.create(
                model=model_id,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            chart_spec = _extract_json(msg.content[0].text)
            if msg.usage:
                prompt_tokens     = msg.usage.input_tokens or 0
                completion_tokens = msg.usage.output_tokens or 0

        else:
            raise HTTPException(400, f"Unknown provider: {provider}")

    except HTTPException:
        raise
    except json.JSONDecodeError as exc:
        log.error("AI non-JSON provider=%s", provider)
        raise HTTPException(502, f"AI provider returned invalid JSON: {exc}") from exc
    except Exception as exc:
        log.error("AI call failed provider=%s: %s", provider, exc)
        raise HTTPException(502, f"AI provider error: {exc}") from exc

    if masker.masked_count:
        chart_spec = masker.demask_obj(chart_spec)
        log.info("analyze  pii_demasked=%d  user=%s", masker.masked_count, user.id[:8])

    conversation_id = None
    try:
        from routers.conversations import record_analysis_conversation
        conv = record_analysis_conversation(
            db,
            user_id=user.id,
            filename=fname,
            provider=provider,
            model_id_str=model_id,
            ai_model_db_id=db_model.id if db_model else None,
            prompt=prompt[:500],
            response_text=json.dumps(chart_spec.get("summary", ""))[:500],
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            reasoning_tokens=reasoning_tokens,
            cached_tokens=cached_tokens,
        )
        conversation_id = conv.id
    except Exception as exc:
        log.warning("conversation record failed (non-fatal): %s", exc)

    chart_spec["meta"] = {
        "filename":         fname,
        "total_rows":       profile["total_rows"],
        "total_columns":    profile["total_columns"],
        "sheet_count":      sheet_count,
        "columns":          [c["name"] for c in profile["columns"]],
        "conversation_id":  conversation_id,
        "pii_protected":    masker.masked_count > 0,
        "pii_masked_count": masker.masked_count,
        "pii_spacy":        masker.spacy_active,
        "token_usage": {
            "prompt":     prompt_tokens,
            "completion": completion_tokens,
            "total":      prompt_tokens + completion_tokens,
        },
    }

    log.info(
        "analyze  user=%s  charts=%d  tokens=%d",
        user.id[:8], len(chart_spec.get("charts", [])), prompt_tokens + completion_tokens,
    )
    return chart_spec


@router.post("/analyze-file")
async def analyze_file(
    file:        UploadFile = File(...),
    user:        User = Depends(get_current_user),
    db:          Session = Depends(get_db),
    ai_model_id: int | None = Query(None),
):
    """Accept a CSV or Excel upload and return AI chart specs."""
    raw   = await file.read()
    fname = file.filename or "upload"
    return _run_analysis(raw, fname, user, db, ai_model_id)


# ── PDF generation endpoints ──────────────────────────────────────────────────

class AnalysisPdfRequest(BaseModel):
    filename: str = "report"
    summary:  str = ""
    charts:   list[dict] = []
    meta:     dict = {}


class RunPdfRequest(BaseModel):
    kpi:  dict | None = None
    runs: list[dict] = []


class FunctionalPdfRequest(BaseModel):
    filename: str = 'report'
    data:     dict = {}


class OperationalPdfRequest(BaseModel):
    runs: list[dict] = []


@router.post("/generate-pdf")
def generate_pdf(
    body: AnalysisPdfRequest,
    user: User = Depends(get_current_user),
):
    """Generate a professional AI Analysis PDF (matplotlib charts + ReportLab layout)."""
    log.info("generate_pdf  user=%s  charts=%d", user.id[:8], len(body.charts))
    try:
        pdf_bytes = generate_analysis_pdf(
            filename=body.filename,
            summary=body.summary,
            charts=body.charts,
            meta=body.meta,
        )
    except Exception as exc:
        log.error("generate_pdf failed  user=%s  error=%s", user.id[:8], exc)
        raise HTTPException(500, f"PDF generation failed: {exc}") from exc

    safe = (body.filename or "report").rsplit(".", 1)[0].replace(" ", "_")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}_analysis.pdf"'},
    )


@router.post("/generate-run-pdf")
def generate_run_pdf_endpoint(
    body: RunPdfRequest,
    user: User = Depends(get_current_user),
):
    """Generate a Run Dashboard PDF (KPI summary + styled runs table)."""
    log.info("generate_run_pdf  user=%s  runs=%d", user.id[:8], len(body.runs))
    try:
        pdf_bytes = generate_run_pdf(kpi=body.kpi, runs=body.runs)
    except Exception as exc:
        log.error("generate_run_pdf failed  user=%s  error=%s", user.id[:8], exc)
        raise HTTPException(500, f"PDF generation failed: {exc}") from exc

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="run_dashboard.pdf"'},
    )


@router.post("/generate-functional-pdf")
def generate_functional_pdf_endpoint(
    body: FunctionalPdfRequest,
    user: User = Depends(get_current_user),
):
    """Generate a Functional Dashboard PDF (module adoption charts + module table)."""
    log.info("generate_functional_pdf  user=%s  file=%s", user.id[:8], body.filename)
    try:
        pdf_bytes = generate_functional_pdf(filename=body.filename, data=body.data)
    except Exception as exc:
        log.error("generate_functional_pdf failed  user=%s  error=%s", user.id[:8], exc)
        raise HTTPException(500, f"PDF generation failed: {exc}") from exc

    safe = (body.filename or 'functional').rsplit('.', 1)[0].replace(' ', '_')
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}_functional.pdf"'},
    )


@router.post("/generate-operational-pdf")
def generate_operational_pdf_endpoint(
    body: OperationalPdfRequest,
    user: User = Depends(get_current_user),
):
    """Generate an Operational Dashboard PDF (run KPIs + charts + recent runs table)."""
    log.info("generate_operational_pdf  user=%s  runs=%d", user.id[:8], len(body.runs))
    try:
        pdf_bytes = generate_operational_pdf(runs=body.runs)
    except Exception as exc:
        log.error("generate_operational_pdf failed  user=%s  error=%s", user.id[:8], exc)
        raise HTTPException(500, f"PDF generation failed: {exc}") from exc

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="operational_dashboard.pdf"'},
    )
