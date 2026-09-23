"""Backend settings from environment variables (see .env.example). No secrets are required."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_dotenv():
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_dotenv()

DB_PATH = os.environ.get("SOA_DB_PATH", os.path.join(ROOT, "backend", "database", "soa.db"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("SOA_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
DEMO_OPERATOR = os.environ.get("SOA_DEMO_OPERATOR", "OP1007")
DEMO_MACHINE = os.environ.get("SOA_DEMO_MACHINE", "EXC-204")
# Task progress runs faster than wall-clock in the demo so a started task visibly advances.
DEMO_TIME_SCALE = float(os.environ.get("SOA_DEMO_TIME_SCALE", "30"))
SITE_NAME = os.environ.get("SOA_SITE_NAME", "Riverside Interchange")
