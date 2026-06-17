import json
import logging
import sys
import os


class _JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line — parseable by Render/Datadog/CloudWatch."""
    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts":     self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S"),
            "level":  record.levelname,
            "logger": record.name,
            "msg":    record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging() -> logging.Logger:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    use_json = os.environ.get("LOG_FORMAT", "").lower() == "json"
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        if use_json:
            handler.setFormatter(_JsonFormatter())
        else:
            fmt = "%(asctime)s | %(levelname)-8s | %(name)-28s | %(message)s"
            handler.setFormatter(logging.Formatter(fmt, datefmt="%Y-%m-%d %H:%M:%S"))
        root.addHandler(handler)
    root.setLevel(level)

    # Keep third-party chatter at WARNING
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "httpx", "paramiko"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    return logging.getLogger("sparky")


# Module-level convenience — call setup_logging() once in main.py, then
# every other module can just do:  from logger import get_logger
# and get a child logger automatically.
def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"sparky.{name}")
