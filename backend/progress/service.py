from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
import json
import os
import sqlite3


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_ROOT = os.environ.get("DATA_ROOT", os.path.join(PROJECT_ROOT, "data"))
DB_PATH = os.environ.get("PROGRESS_DB_PATH", os.path.join(DATA_ROOT, "progress.sqlite3"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PROGRESS_PORT", "8102"))
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token-change-me")


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS attempts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              game_id TEXT NOT NULL,
              score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
              details TEXT,
              completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_attempts_user_game
              ON attempts(user_id, game_id, completed_at);
            """
        )


class ProgressHandler(BaseHTTPRequestHandler):
    server_version = "PortugueseMusicProgress/0.1"

    def do_GET(self):
        if not self.is_internal():
            return
        route = urlparse(self.path)
        if route.path == "/internal/progress":
            self.handle_progress(route)
            return
        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if not self.is_internal():
            return
        if self.path == "/internal/attempts":
            self.handle_attempt()
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

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_attempt(self):
        payload = self.read_json()
        if payload is None:
            return

        try:
            user_id = int(payload.get("userId"))
            score = int(payload.get("score"))
        except (TypeError, ValueError):
            self.send_json({"error": "Tentativa inválida."}, HTTPStatus.BAD_REQUEST)
            return

        game_id = str(payload.get("gameId", "")).strip()
        if not game_id or score < 0 or score > 100:
            self.send_json({"error": "Tentativa inválida."}, HTTPStatus.BAD_REQUEST)
            return

        details = payload.get("details")
        details_json = json.dumps(details, ensure_ascii=False) if details is not None else None
        with connect_db() as db:
            db.execute(
                "INSERT INTO attempts (user_id, game_id, score, details) VALUES (?, ?, ?, ?)",
                (user_id, game_id, score, details_json),
            )
        self.send_json({"ok": True})

    def handle_progress(self, route):
        try:
            user_id = int(parse_qs(route.query).get("userId", [""])[0])
        except ValueError:
            self.send_json({"error": "Usuário inválido."}, HTTPStatus.BAD_REQUEST)
            return

        with connect_db() as db:
            rows = db.execute(
                """
                SELECT
                  attempts.game_id,
                  COUNT(*) AS attempt_count,
                  (
                    SELECT latest.score
                    FROM attempts AS latest
                    WHERE latest.user_id = attempts.user_id
                      AND latest.game_id = attempts.game_id
                    ORDER BY datetime(latest.completed_at) DESC, latest.id DESC
                    LIMIT 1
                  ) AS last_score,
                  (
                    SELECT latest.completed_at
                    FROM attempts AS latest
                    WHERE latest.user_id = attempts.user_id
                      AND latest.game_id = attempts.game_id
                    ORDER BY datetime(latest.completed_at) DESC, latest.id DESC
                    LIMIT 1
                  ) AS last_completed_at
                FROM attempts
                WHERE user_id = ?
                GROUP BY game_id
                """,
                (user_id,),
            ).fetchall()

        completed = {
            row["game_id"]: {
                "score": row["last_score"],
                "lastScore": row["last_score"],
                "attemptCount": row["attempt_count"],
                "completedAt": row["last_completed_at"],
                "lastCompletedAt": row["last_completed_at"],
            }
            for row in rows
        }
        attempts = [
            {
                "gameId": row["game_id"],
                "lastScore": row["last_score"],
                "attemptCount": row["attempt_count"],
                "lastCompletedAt": row["last_completed_at"],
            }
            for row in rows
        ]
        self.send_json({"completed": completed, "attempts": attempts, "streak": 1})


if __name__ == "__main__":
    os.makedirs(DATA_ROOT, exist_ok=True)
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), ProgressHandler)
    print(f"Progress service em http://{HOST}:{PORT}/")
    server.serve_forever()
