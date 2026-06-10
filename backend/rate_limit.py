from slowapi import Limiter
from slowapi.util import get_remote_address

# Single shared limiter instance imported by main.py and individual routers.
# Key by remote IP; individual endpoints can override the default.
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])
