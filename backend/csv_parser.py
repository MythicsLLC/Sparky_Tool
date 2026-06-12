import io
import math
import re
from typing import Any
import pandas as pd


def _f(val) -> float | None:
    """float() that maps NaN/Inf to None so JSON serialisation never fails."""
    f = float(val)
    return None if not math.isfinite(f) else f


def _split_fields(line: str) -> list[str]:
    """Split a line into fields: tabs if present, else 2+ spaces."""
    if '\t' in line:
        return [f.strip() for f in line.split('\t') if f.strip()]
    return [f.strip() for f in re.split(r'  +', line.strip()) if f.strip()]


def _is_multi_section(text: str) -> bool:
    """True when the file looks like a PeopleSoft multi-section report.

    Criteria: 4+ blank-line-separated groups AND fewer than 30 % of
    non-blank lines contain a comma (standard CSVs are comma-heavy).
    """
    non_blank = [l for l in text.splitlines() if l.strip()]
    if not non_blank:
        return False
    groups = 0
    in_group = False
    for line in text.splitlines():
        if line.strip():
            if not in_group:
                groups += 1
                in_group = True
        else:
            in_group = False
    if groups < 4:
        return False
    comma_ratio = sum(1 for l in non_blank if ',' in l) / len(non_blank)
    return comma_ratio < 0.3


def _parse_multi_section(text: str) -> list[dict]:
    """Parse a PeopleSoft flat report into typed sections."""
    sections: list[dict] = []

    # Group lines by blank-line separators
    groups: list[list[str]] = []
    current: list[str] = []
    for line in text.splitlines():
        if line.strip():
            current.append(line)
        elif current:
            groups.append(current)
            current = []
    if current:
        groups.append(current)

    for group in groups:
        rows = [_split_fields(line) for line in group]
        rows = [r for r in rows if r]
        if not rows:
            continue

        # KV section: most rows have a field ending with ':'
        kv_count = sum(1 for r in rows if r and r[0].endswith(':'))
        if kv_count >= len(rows) * 0.4:
            title = None
            data: dict[str, str] = {}
            for r in rows:
                if r[0].endswith(':'):
                    key = r[0].rstrip(':').strip()
                    data[key] = r[1].strip() if len(r) > 1 else ''
                elif len(r) == 1:
                    title = r[0]
            if data or title:
                sections.append({
                    'title': title or 'Configuration',
                    'type': 'kv',
                    'data': data,
                })
            continue

        # Table section
        title = None
        start = 0
        if len(rows[0]) == 1:
            title = rows[0][0]
            start = 1

        if start >= len(rows):
            continue

        headers = rows[start]
        if not headers:
            continue

        data_rows: list[dict] = []
        for r in rows[start + 1:]:
            row_dict = {col: (r[i] if i < len(r) else '') for i, col in enumerate(headers)}
            data_rows.append(row_dict)

        if data_rows:
            sections.append({
                'title': title or headers[0],
                'type': 'table',
                'columns': headers,
                'rows': data_rows,
            })

    return sections


def parse_and_compute(csv_bytes: bytes) -> dict[str, Any]:
    text = csv_bytes.decode('utf-8', errors='replace')

    if _is_multi_section(text):
        sections = _parse_multi_section(text)

        all_rows: list[dict] = []
        all_cols: list[str] = []
        kpis: dict[str, Any] = {}

        for sec in sections:
            if sec['type'] != 'table':
                continue
            kpis[sec['title']] = {
                'type': 'categorical',
                'count': len(sec['rows']),
                'unique_count': len(sec['rows']),
                'value_counts': {},
            }
            for col in sec['columns']:
                if col not in all_cols:
                    all_cols.append(col)
            all_rows.extend(sec['rows'])

        return {
            'report_type': 'multi_section',
            'sections': sections,
            'kpis': kpis,
            'rows': all_rows,
            'columns': all_cols,
            'row_count': sum(len(s['rows']) for s in sections if s['type'] == 'table'),
        }

    # Standard CSV
    df = pd.read_csv(io.BytesIO(csv_bytes))
    kpis: dict[str, Any] = {}
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            kpis[col] = {
                'type': 'numeric',
                'count': int(df[col].count()),
                'sum': _f(df[col].sum()),
                'mean': _f(df[col].mean()),
                'min': _f(df[col].min()),
                'max': _f(df[col].max()),
            }
        else:
            kpis[col] = {
                'type': 'categorical',
                'count': int(df[col].count()),
                'unique_count': int(df[col].nunique()),
                'value_counts': {
                    str(k): int(v)
                    for k, v in df[col].value_counts().head(10).items()
                },
            }
    return {
        'kpis': kpis,
        'rows': df.astype(object).where(pd.notna(df), None).to_dict(orient='records'),
        'columns': list(df.columns),
        'row_count': len(df),
    }
