from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import os
import secrets
import sqlite3
import time


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_ROOT = os.environ.get("DATA_ROOT", os.path.join(PROJECT_ROOT, "data"))
DB_PATH = os.environ.get("AUTH_DB_PATH", os.path.join(DATA_ROOT, "auth.sqlite3"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("AUTH_PORT", "8101"))
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token-change-me")
SESSION_COOKIE = "pt_music_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 14
PBKDF2_ITERATIONS = 200_000


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              password_salt TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expires_at INTEGER NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return salt, digest.hex()


def verify_password(password, salt, expected_hash):
    _, password_hash = hash_password(password, salt)
    return secrets.compare_digest(password_hash, expected_hash)


def user_payload(row):
    return {"id": row["id"], "username": row["username"]}


class AuthHandler(BaseHTTPRequestHandler):
    server_version = "PortugueseMusicAuth/0.1"

    def do_GET(self):
        if not self.is_internal():
            return
        if self.path == "/internal/auth/me":
            self.handle_me()
            return
        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if not self.is_internal():
            return
        if self.path == "/internal/auth/register":
            self.handle_register()
            return
        if self.path == "/internal/auth/login":
            self.handle_login()
            return
        if self.path == "/internal/auth/logout":
            self.handle_logout()
            return
        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def is_internal(self):
        if self.headers.get("X-Internal-Token") == INTERNAL_TOKEN:
            return True
        self.send_json({"error": "Proibido."}, HTTPStatus.FORBIDDEN)
        return False

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self.send_json({"error": "JSON inválido."}, HTTPStatus.BAD_REQUEST)
            return None

    def send_json(self, payload, status=HTTPStatus.OK, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for name, value in extra_headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def get_cookie(self, name):
        raw_cookie = self.headers.get("Cookie", "")
        for pair in raw_cookie.split(";"):
            key, _, value = pair.strip().partition("=")
            if key == name:
                return value
        return None

    def current_user(self):
        token = self.get_cookie(SESSION_COOKIE)
        if not token:
            return None
        with connect_db() as db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            return db.execute(
                """
                SELECT users.id, users.username
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ? AND sessions.expires_at > ?
                """,
                (token, int(time.time())),
            ).fetchone()

    def validate_credentials(self, payload):
        username = str(payload.get("username", "")).strip().lower()
        password = str(payload.get("password", ""))
        if not username or not username.replace("_", "").replace("-", "").isalnum():
            return None, None, "Digite um nome de usuário válido."
        if len(password) < 8:
            return None, None, "A senha precisa ter pelo menos 8 caracteres."
        return username, password, None

    def start_session(self, db, user):
        token = secrets.token_urlsafe(32)
        expires_at = int(time.time()) + SESSION_TTL_SECONDS
        db.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token, user["id"], expires_at))
        cookie = f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL_SECONDS}"
        self.send_json({"user": user_payload(user)}, extra_headers={"Set-Cookie": cookie})

    def handle_me(self):
        user = self.current_user()
        self.send_json({"user": user_payload(user) if user else None})

    def handle_register(self):
        payload = self.read_json()
        if payload is None:
            return
        username, password, error = self.validate_credentials(payload)
        if error:
            self.send_json({"error": error}, HTTPStatus.BAD_REQUEST)
            return

        salt, password_hash = hash_password(password)
        with connect_db() as db:
            if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
                self.send_json({"error": "Esse nome de usuário já existe."}, HTTPStatus.CONFLICT)
                return
            db.execute(
                "INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?)",
                (username, password_hash, salt),
            )
            user = db.execute("SELECT id, username FROM users WHERE username = ?", (username,)).fetchone()
            self.start_session(db, user)

    def handle_login(self):
        payload = self.read_json()
        if payload is None:
            return
        username = str(payload.get("username", "")).strip().lower()
        password = str(payload.get("password", ""))
        with connect_db() as db:
            user = db.execute(
                "SELECT id, username, password_hash, password_salt FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if not user or not verify_password(password, user["password_salt"], user["password_hash"]):
                self.send_json({"error": "Usuário ou senha incorretos."}, HTTPStatus.UNAUTHORIZED)
                return
            db.execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", (user["id"],))
            self.start_session(db, user)

    def handle_logout(self):
        token = self.get_cookie(SESSION_COOKIE)
        if token:
            with connect_db() as db:
                db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        cookie = f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        self.send_json({"ok": True}, extra_headers={"Set-Cookie": cookie})


if __name__ == "__main__":
    os.makedirs(DATA_ROOT, exist_ok=True)
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), AuthHandler)
    print(f"Auth service em http://{HOST}:{PORT}/")
    server.serve_forever()
