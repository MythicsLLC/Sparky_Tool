"""Data quality rule execution engine."""
import io
from datetime import datetime, timezone

import pandas as pd

from logger import get_logger

log = get_logger("quality_checker")


def run_checks(*, db, config_id: int, run_log_id: int, csv_bytes: bytes) -> list[dict]:
    """Execute all active DQ rules for config_id. Stores results; returns summary list."""
    from models import DataQualityRule, DataQualityResult

    rules = (
        db.query(DataQualityRule)
        .filter(DataQualityRule.config_id == config_id, DataQualityRule.is_active == True)
        .all()
    )
    if not rules:
        return []

    try:
        df = pd.read_csv(io.BytesIO(csv_bytes), low_memory=False)
    except Exception as exc:
        log.warning("DQ check: could not parse CSV: %s", exc)
        return []

    summaries = []
    for rule in rules:
        passed, actual, message = _evaluate(rule, df)
        db.add(DataQualityResult(
            run_log_id   = run_log_id,
            rule_id      = rule.id,
            rule_name    = rule.name,
            rule_type    = rule.rule_type,
            passed       = passed,
            actual_value = str(actual),
            message      = message,
            checked_at   = datetime.now(timezone.utc),
        ))
        summaries.append({
            "rule_id":   rule.id,
            "rule_name": rule.name,
            "rule_type": rule.rule_type,
            "passed":    passed,
            "actual":    str(actual),
            "message":   message,
        })
        if not passed:
            log.warning("DQ FAIL  run_log=%d  rule=%r  %s", run_log_id, rule.name, message)

    db.commit()
    failed = sum(1 for s in summaries if not s["passed"])
    log.info("DQ checks  config=%d  run_log=%d  total=%d  failed=%d",
             config_id, run_log_id, len(summaries), failed)
    return summaries


def _evaluate(rule, df: pd.DataFrame):
    """Returns (passed, actual_value, message)."""
    params    = rule.parameters or {}
    rt        = rule.rule_type
    row_count = len(df)

    try:
        if rt == "row_count_gt":
            t = int(params.get("threshold", 0))
            ok = row_count > t
            return ok, row_count, f"Row count {row_count:,} {'>' if ok else 'not >'} {t:,}"

        if rt == "row_count_lt":
            t = int(params.get("threshold", 0))
            ok = row_count < t
            return ok, row_count, f"Row count {row_count:,} {'<' if ok else 'not <'} {t:,}"

        if rt == "row_count_between":
            lo, hi = int(params.get("min", 0)), int(params.get("max", 0))
            ok = lo <= row_count <= hi
            return ok, row_count, (
                f"Row count {row_count:,} in [{lo:,}, {hi:,}]" if ok
                else f"Row count {row_count:,} outside [{lo:,}, {hi:,}]"
            )

        if rt == "column_not_null":
            col = params.get("column", "")
            if col not in df.columns:
                return False, "column not found", f"Column '{col}' does not exist"
            nulls = int(df[col].isna().sum() + (df[col].astype(str).str.strip() == "").sum())
            ok = nulls == 0
            return ok, nulls, (
                f"Column '{col}' has no nulls/blanks" if ok
                else f"Column '{col}' has {nulls} null/blank value(s)"
            )

        if rt == "value_must_exist":
            col, val = params.get("column", ""), str(params.get("value", ""))
            if col not in df.columns:
                return False, "column not found", f"Column '{col}' does not exist"
            found = val in df[col].astype(str).values
            return found, val, (
                f"Value '{val}' found in '{col}'" if found
                else f"Value '{val}' not found in '{col}'"
            )

        if rt == "column_unique":
            col = params.get("column", "")
            if col not in df.columns:
                return False, "column not found", f"Column '{col}' does not exist"
            dups = int(df[col].duplicated().sum())
            ok = dups == 0
            return ok, dups, (
                f"Column '{col}' all unique" if ok
                else f"Column '{col}' has {dups} duplicate value(s)"
            )

        return False, "n/a", f"Unknown rule type: {rt}"

    except Exception as exc:
        return False, "error", f"Rule evaluation error: {exc}"
