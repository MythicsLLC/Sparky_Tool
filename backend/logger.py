import logging
import sys
import os


def setup_logging() -> logging.Logger:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    fmt = "%(asctime)s | %(levelname)-8s | %(name)-28s | %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(fmt, datefmt=datefmt))
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
