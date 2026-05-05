from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json
import os
import sqlite3


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = Path(os.environ.get("FRONTEND_ROOT", PROJECT_ROOT / "frontend"))
DATA_ROOT = Path(os.environ.get("DATA_ROOT", PROJECT_ROOT / "data"))
CATALOG_DB_PATH = Path(os.environ.get("CATALOG_DB_PATH", DATA_ROOT / "catalog.sqlite3"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
AUTH_BASE_URL = os.environ.get("AUTH_BASE_URL", "http://127.0.0.1:8101")
PROGRESS_BASE_URL = os.environ.get("PROGRESS_BASE_URL", "http://127.0.0.1:8102")
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "dev-internal-token-change-me")


def connect_catalog_db():
    connection = sqlite3.connect(CATALOG_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_catalog_db():
    with connect_catalog_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS songs (
              id TEXT PRIMARY KEY,
              song_title TEXT NOT NULL,
              artist TEXT NOT NULL,
              course TEXT NOT NULL,
              topic TEXT NOT NULL,
              game_type TEXT NOT NULL,
              game_kind TEXT NOT NULL,
              highlighted INTEGER NOT NULL DEFAULT 0,
              thumbnail TEXT NOT NULL,
              game_url TEXT,
              youtube_watch_url TEXT,
              description TEXT,
              instruction_title TEXT,
              instruction_text TEXT,
              audio_src TEXT,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS lyric_chunks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
              chunk_order INTEGER NOT NULL,
              text TEXT NOT NULL,
              UNIQUE(song_id, chunk_order)
            );

            CREATE TABLE IF NOT EXISTS cloze_lyrics (
              song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
              lyrics TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS selectable_lyrics (
              song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
              lyrics TEXT NOT NULL
            );
            """
        )
        ensure_catalog_columns(db)
        seed_songs(db)


def ensure_catalog_columns(db):
    columns = {row["name"] for row in db.execute("PRAGMA table_info(songs)").fetchall()}
    if "instruction_title" not in columns:
        db.execute("ALTER TABLE songs ADD COLUMN instruction_title TEXT")
    if "instruction_text" not in columns:
        db.execute("ALTER TABLE songs ADD COLUMN instruction_text TEXT")


def seed_songs(db):
    seed_catalog = load_seed_catalog()
    seed_ids = [game["id"] for game in seed_catalog]

    if seed_ids:
        placeholders = ", ".join("?" for _ in seed_ids)
        db.execute(
            f"DELETE FROM songs WHERE game_kind = 'preview' AND id NOT IN ({placeholders})",
            seed_ids,
        )

    for index, game in enumerate(seed_catalog):
        db.execute(
            """
            INSERT INTO songs (
              id, song_title, artist, course, topic, game_type, game_kind,
              highlighted, thumbnail, game_url, youtube_watch_url, description,
              instruction_title, instruction_text, audio_src, sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              song_title = excluded.song_title,
              artist = excluded.artist,
              course = excluded.course,
              topic = excluded.topic,
              game_type = excluded.game_type,
              game_kind = excluded.game_kind,
              highlighted = excluded.highlighted,
              thumbnail = excluded.thumbnail,
              game_url = excluded.game_url,
              youtube_watch_url = excluded.youtube_watch_url,
              description = excluded.description,
              instruction_title = excluded.instruction_title,
              instruction_text = excluded.instruction_text,
              audio_src = excluded.audio_src,
              sort_order = excluded.sort_order,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                game["id"],
                game["songTitle"],
                game["artist"],
                game["course"],
                game["topic"],
                game["gameType"],
                game["gameKind"],
                1 if game.get("highlighted") else 0,
                game["thumbnail"],
                game.get("gameUrl"),
                game.get("youtubeWatchUrl"),
                game.get("description"),
                game.get("instructionTitle"),
                game.get("instructionText"),
                game.get("audioSrc"),
                index,
            ),
        )

        db.execute("DELETE FROM lyric_chunks WHERE song_id = ?", (game["id"],))
        for chunk_index, chunk in enumerate(game.get("lyricChunks", [])):
            db.execute(
                "INSERT INTO lyric_chunks (song_id, chunk_order, text) VALUES (?, ?, ?)",
                (game["id"], chunk_index, chunk),
            )

        db.execute("DELETE FROM cloze_lyrics WHERE song_id = ?", (game["id"],))
        if game.get("clozeLyrics"):
            db.execute(
                "INSERT INTO cloze_lyrics (song_id, lyrics) VALUES (?, ?)",
                (game["id"], game["clozeLyrics"]),
            )

        db.execute("DELETE FROM selectable_lyrics WHERE song_id = ?", (game["id"],))
        if game.get("selectableLyrics"):
            db.execute(
                "INSERT INTO selectable_lyrics (song_id, lyrics) VALUES (?, ?)",
                (game["id"], game["selectableLyrics"]),
            )


def load_seed_catalog():
    seed_path = FRONTEND_ROOT / "songs.seed.json"
    if not seed_path.exists():
        return []
    return json.loads(seed_path.read_text(encoding="utf-8"))["songs"]


def song_payload(row, lyric_chunks=None, cloze_lyrics=None, selectable_lyrics=None):
    payload = {
        "id": row["id"],
        "songTitle": row["song_title"],
        "artist": row["artist"],
        "course": row["course"],
        "topic": row["topic"],
        "gameType": row["game_type"],
        "gameKind": row["game_kind"],
        "highlighted": bool(row["highlighted"]),
        "thumbnail": row["thumbnail"],
        "description": row["description"],
    }
    optional_fields = {
        "gameUrl": row["game_url"],
        "youtubeWatchUrl": row["youtube_watch_url"],
        "audioSrc": row["audio_src"],
        "instructionTitle": row["instruction_title"],
        "instructionText": row["instruction_text"],
    }
    payload.update({key: value for key, value in optional_fields.items() if value})
    if lyric_chunks is not None:
        payload["lyricChunks"] = lyric_chunks
    if cloze_lyrics is not None:
        payload["clozeLyrics"] = cloze_lyrics
    if selectable_lyrics is not None:
        payload["selectableLyrics"] = selectable_lyrics
    return payload


class GatewayHandler(SimpleHTTPRequestHandler):
    server_version = "PortugueseMusicGateway/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_ROOT), **kwargs)

    def do_GET(self):
        route = urlparse(self.path).path
        if route == "/":
            self.path = "/index.html"
            super().do_GET()
            return
        if route == "/api/songs":
            self.handle_songs()
            return
        if route == "/api/me":
            self.delegate_auth("GET", "/internal/auth/me")
            return
        if route == "/api/progress":
            user = self.require_user()
            if not user:
                return
            query = urlencode({"userId": user["id"]})
            self.delegate_progress("GET", f"/internal/progress?{query}")
            return
        super().do_GET()

    def do_POST(self):
        route = urlparse(self.path).path
        if route == "/api/auth/register":
            self.delegate_auth("POST", "/internal/auth/register", self.read_json_body())
            return
        if route == "/api/auth/login":
            self.delegate_auth("POST", "/internal/auth/login", self.read_json_body())
            return
        if route == "/api/auth/logout":
            self.delegate_auth("POST", "/internal/auth/logout")
            return
        if route == "/api/attempts":
            user = self.require_user()
            if not user:
                return
            payload = self.read_json_body()
            if payload is None:
                return
            payload["userId"] = user["id"]
            self.delegate_progress("POST", "/internal/attempts", payload)
            return
        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def end_headers(self):
        self.send_header("X-Service", "PortugueseMusicGateway")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def read_json_body(self):
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

    def service_request(self, method, base_url, path, payload=None):
        data = None
        headers = {"X-Internal-Token": INTERNAL_TOKEN}
        if self.headers.get("Cookie"):
            headers["Cookie"] = self.headers["Cookie"]
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"

        request = Request(f"{base_url}{path}", data=data, method=method, headers=headers)
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8")), response.headers
        except HTTPError as error:
            body = error.read().decode("utf-8")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {"error": body or "Erro no serviço interno."}
            return error.code, payload, error.headers
        except URLError:
            return HTTPStatus.BAD_GATEWAY, {"error": "Serviço interno indisponível."}, {}

    def delegate_auth(self, method, path, payload=None):
        status, body, headers = self.service_request(method, AUTH_BASE_URL, path, payload)
        extra_headers = {}
        if headers.get("Set-Cookie"):
            extra_headers["Set-Cookie"] = headers["Set-Cookie"]
        self.send_json(body, status, extra_headers=extra_headers)

    def delegate_progress(self, method, path, payload=None):
        status, body, _ = self.service_request(method, PROGRESS_BASE_URL, path, payload)
        self.send_json(body, status)

    def require_user(self):
        status, body, _ = self.service_request("GET", AUTH_BASE_URL, "/internal/auth/me")
        if status != HTTPStatus.OK or not body.get("user"):
            self.send_json({"error": "É preciso entrar para continuar."}, HTTPStatus.UNAUTHORIZED)
            return None
        return body["user"]

    def handle_songs(self):
        with connect_catalog_db() as db:
            rows = db.execute("SELECT * FROM songs ORDER BY sort_order, song_title").fetchall()
            chunk_rows = db.execute("SELECT song_id, text FROM lyric_chunks ORDER BY song_id, chunk_order").fetchall()
            cloze_rows = db.execute("SELECT song_id, lyrics FROM cloze_lyrics").fetchall()
            selectable_rows = db.execute("SELECT song_id, lyrics FROM selectable_lyrics").fetchall()

        chunks_by_song = {}
        for chunk in chunk_rows:
            chunks_by_song.setdefault(chunk["song_id"], []).append(chunk["text"])
        cloze_by_song = {row["song_id"]: row["lyrics"] for row in cloze_rows}
        selectable_by_song = {row["song_id"]: row["lyrics"] for row in selectable_rows}
        songs = [
            song_payload(
                row,
                lyric_chunks=chunks_by_song.get(row["id"]) if row["id"] in chunks_by_song else None,
                cloze_lyrics=cloze_by_song.get(row["id"]),
                selectable_lyrics=selectable_by_song.get(row["id"]),
            )
            for row in rows
        ]
        self.send_json({"songs": songs})


if __name__ == "__main__":
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    init_catalog_db()
    server = ThreadingHTTPServer((HOST, PORT), GatewayHandler)
    print(f"Gateway em http://{HOST}:{PORT}/", flush=True)
    server.serve_forever()
