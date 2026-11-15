"""Environment configuration; secrets are used only by the backend."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv

# Direct uvicorn and migration runs read the project configuration as well.
# Explicit process environment variables still take precedence.
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

PRODUCTION = os.getenv('APP_ENV', 'development') == 'production'
PUBLIC_ORIGIN = os.getenv('PUBLIC_ORIGIN', 'http://127.0.0.1:8000').rstrip('/')
FRONTEND_URL = os.getenv('FRONTEND_URL', PUBLIC_ORIGIN).rstrip('/')
ALLOWED_ORIGINS = [x.strip().rstrip('/') for x in os.getenv(
    'ALLOWED_ORIGINS', 'http://localhost:4173,http://127.0.0.1:4173,http://127.0.0.1:8000').split(',') if x.strip()]
CLIENT_ID = os.getenv('TELEGRAM_CLIENT_ID', '')
CLIENT_SECRET = os.getenv('TELEGRAM_CLIENT_SECRET', '')
CALLBACK_URL = os.getenv('TELEGRAM_CALLBACK_URL', PUBLIC_ORIGIN + '/api/v1/auth/telegram/callback')
ISSUER = 'https://oauth.telegram.org'
SESSION_COOKIE = 'openmusic_session'
STATE_COOKIE = 'openmusic_oauth'
SESSION_SECONDS = 30 * 24 * 60 * 60
if PRODUCTION:
    if (urlsplit(PUBLIC_ORIGIN).scheme != 'https' or FRONTEND_URL != PUBLIC_ORIGIN
            or CALLBACK_URL != PUBLIC_ORIGIN + '/api/v1/auth/telegram/callback'
            or ALLOWED_ORIGINS != [PUBLIC_ORIGIN]):
        raise RuntimeError('Production requires one explicit HTTPS origin for frontend, API and callback')
