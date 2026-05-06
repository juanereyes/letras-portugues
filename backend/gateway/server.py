from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import base64
import json
import os
import re
import sqlite3


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_ROOT = Path(os.environ.get("FRONTEND_ROOT", PROJECT_ROOT / "frontend"))
DATA_ROOT = Path(os.environ.get("DATA_ROOT", PROJECT_ROOT / "data"))
CATALOG_DB_PATH = Path(os.environ.get("CATALOG_DB_PATH", DATA_ROOT / "catalog.sqlite3"))
ASSET_ROOT = FRONTEND_ROOT / "assets"
THUMBNAIL_UPLOAD_ROOT = ASSET_ROOT / "uploads"
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

            CREATE TABLE IF NOT EXISTS deleted_songs (
              song_id TEXT PRIMARY KEY,
              deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    deleted_ids = {row["song_id"] for row in db.execute("SELECT song_id FROM deleted_songs").fetchall()}
    seed_ids = [game["id"] for game in seed_catalog]

    if deleted_ids:
        placeholders = ", ".join("?" for _ in deleted_ids)
        db.execute(f"DELETE FROM songs WHERE id IN ({placeholders})", list(deleted_ids))

    if seed_ids:
        placeholders = ", ".join("?" for _ in seed_ids)
        db.execute(
            f"DELETE FROM songs WHERE game_kind = 'preview' AND id NOT IN ({placeholders})",
            seed_ids,
        )

    for index, game in enumerate(seed_catalog):
        if game["id"] in deleted_ids:
            continue
        db.execute(
            """
            INSERT INTO songs (
              id, song_title, artist, course, topic, game_type, game_kind,
              highlighted, thumbnail, game_url, youtube_watch_url, description,
              instruction_title, instruction_text, audio_src, sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING
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

        if db.execute("SELECT changes() AS changes_count").fetchone()["changes_count"] == 0:
            continue

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


MODE_CONFIG = {
    "lyric-order": {
        "game_type": "Ordenar a letra",
        "description": "Organize os trechos da letra antes de ouvir a música.",
        "mode_field": "lyricChunks",
    },
    "complete-lyrics": {
        "game_type": "Completar a letra",
        "description": "Ouça a música e complete as palavras que faltam.",
        "mode_field": "clozeLyrics",
    },
    "word-select": {
        "game_type": "Selecionar palavras",
        "description": "Ouça a música e selecione palavras de uma categoria.",
        "mode_field": "selectableLyrics",
    },
}

IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}


def clean_text(value):
    return str(value or "").strip()


def validate_song_payload(payload):
    if not isinstance(payload, dict):
        return None, "Dados da música inválidos."

    game_kind = clean_text(payload.get("gameKind"))
    config = MODE_CONFIG.get(game_kind)
    if not config:
        return None, "Modo de jogo inválido."

    required_fields = [
        "id",
        "songTitle",
        "artist",
        "course",
        "topic",
        "youtubeWatchUrl",
        "instructionTitle",
        "instructionText",
    ]
    cleaned = {field: clean_text(payload.get(field)) for field in required_fields}
    if any(not cleaned[field] for field in required_fields):
        return None, "Complete todos os campos obrigatórios."

    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", cleaned["id"]):
        return None, "Identificador da música inválido."

    if not re.fullmatch(r"https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]+", cleaned["youtubeWatchUrl"]):
        return None, "Use um link do YouTube no formato correto."

    song = {
        "id": cleaned["id"],
        "songTitle": cleaned["songTitle"],
        "artist": cleaned["artist"],
        "course": cleaned["course"],
        "topic": cleaned["topic"],
        "gameType": config["game_type"],
        "gameKind": game_kind,
        "highlighted": bool(payload.get("highlighted", True)),
        "thumbnail": clean_text(payload.get("thumbnail")) or "assets/thumb-default.svg",
        "gameUrl": f"{game_kind}.html?song={cleaned['id']}",
        "youtubeWatchUrl": cleaned["youtubeWatchUrl"],
        "description": clean_text(payload.get("description")) or config["description"],
        "instructionTitle": cleaned["instructionTitle"],
        "instructionText": cleaned["instructionText"],
    }

    if game_kind == "lyric-order":
        chunks = payload.get("lyricChunks")
        if not isinstance(chunks, list) or not chunks or any(not clean_text(chunk) for chunk in chunks):
            return None, "Preencha todos os blocos da letra."
        song["lyricChunks"] = [clean_text(chunk) for chunk in chunks]
    elif game_kind == "complete-lyrics":
        cloze_lyrics = clean_text(payload.get("clozeLyrics"))
        if not cloze_lyrics or "[" not in cloze_lyrics or "]" not in cloze_lyrics:
            return None, "Envie a letra com as lacunas confirmadas."
        song["clozeLyrics"] = cloze_lyrics
    elif game_kind == "word-select":
        selectable_lyrics = clean_text(payload.get("selectableLyrics"))
        if not selectable_lyrics or "[" not in selectable_lyrics or "]" not in selectable_lyrics:
            return None, "Envie a letra com as palavras confirmadas."
        song["selectableLyrics"] = selectable_lyrics

    return song, None


def save_thumbnail(song_id, thumbnail):
    if not thumbnail or thumbnail == "assets/thumb-default.svg":
        return "assets/thumb-default.svg"

    if not thumbnail.startswith("data:image/"):
        is_asset_path = re.fullmatch(r"assets/[A-Za-z0-9_./-]+\.(svg|png|jpe?g|gif|webp)", thumbnail)
        if not is_asset_path or ".." in thumbnail:
            raise ValueError("Caminho da miniatura inválido.")
        return thumbnail

    header, separator, encoded = thumbnail.partition(",")
    if not separator:
        raise ValueError("Imagem da miniatura inválida.")

    mime_match = re.fullmatch(r"data:(image/[A-Za-z0-9.+-]+);base64", header)
    if not mime_match:
        raise ValueError("Formato da miniatura inválido.")

    mime_type = mime_match.group(1).lower()
    extension = IMAGE_EXTENSIONS.get(mime_type)
    if not extension:
        raise ValueError("Formato de imagem não aceito para a miniatura.")

    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except ValueError as error:
        raise ValueError("Imagem da miniatura inválida.") from error

    if len(image_bytes) > 2 * 1024 * 1024:
        raise ValueError("A miniatura deve ter no máximo 2 MB.")

    THUMBNAIL_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    file_name = f"{song_id}.{extension}"
    (THUMBNAIL_UPLOAD_ROOT / file_name).write_bytes(image_bytes)
    return f"assets/uploads/{file_name}"


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
        if route == "/api/admin/progress":
            admin = self.require_admin()
            if not admin:
                return
            username = str(parse_qs(urlparse(self.path).query).get("username", [""])[0]).strip().lower()
            if not username:
                self.send_json({"error": "Informe um nome de usuario."}, HTTPStatus.BAD_REQUEST)
                return
            target_user = self.find_user_by_username(username)
            if not target_user:
                return
            query = urlencode({"userId": target_user["id"]})
            status, progress, _ = self.service_request("GET", PROGRESS_BASE_URL, f"/internal/progress?{query}")
            progress["user"] = target_user
            self.send_json(progress, status)
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
        if route == "/api/admin/promote":
            admin = self.require_admin()
            if not admin:
                return
            payload = self.read_json_body()
            if payload is None:
                return
            self.delegate_auth("POST", "/internal/auth/promote", payload)
            return
        if route == "/api/admin/songs":
            admin = self.require_admin()
            if not admin:
                return
            payload = self.read_json_body()
            if payload is None:
                return
            self.handle_admin_song_create(payload)
            return
        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        route = urlparse(self.path).path
        if route.startswith("/api/admin/songs/"):
            admin = self.require_admin()
            if not admin:
                return
            song_id = route.rsplit("/", 1)[-1]
            payload = self.read_json_body()
            if payload is None:
                return
            self.handle_admin_song_update(song_id, payload)
            return
        self.send_json({"error": "Rota não encontrada."}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        route = urlparse(self.path).path
        if route.startswith("/api/admin/songs/"):
            admin = self.require_admin()
            if not admin:
                return
            song_id = route.rsplit("/", 1)[-1]
            self.handle_admin_song_delete(song_id)
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

    def require_admin(self):
        user = self.require_user()
        if not user:
            return None
        if user.get("role") != "admin":
            self.send_json({"error": "Acesso restrito a professores."}, HTTPStatus.FORBIDDEN)
            return None
        return user

    def find_user_by_username(self, username):
        query = urlencode({"username": username})
        status, body, _ = self.service_request("GET", AUTH_BASE_URL, f"/internal/auth/users/by-username?{query}")
        if status != HTTPStatus.OK or not body.get("user"):
            self.send_json(body, status)
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

    def handle_admin_song_create(self, payload):
        song, error = validate_song_payload(payload)
        if error:
            self.send_json({"error": error}, HTTPStatus.BAD_REQUEST)
            return

        try:
            song["thumbnail"] = save_thumbnail(song["id"], song.get("thumbnail"))
        except ValueError as thumbnail_error:
            self.send_json({"error": str(thumbnail_error)}, HTTPStatus.BAD_REQUEST)
            return
        except OSError:
            self.send_json({"error": "Não foi possível salvar a miniatura."}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        try:
            with connect_catalog_db() as db:
                if db.execute("SELECT 1 FROM songs WHERE id = ?", (song["id"],)).fetchone():
                    self.send_json({"error": "Já existe uma música com esse identificador."}, HTTPStatus.CONFLICT)
                    return
                next_order = db.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM songs").fetchone()[
                    "sort_order"
                ]
                db.execute("DELETE FROM deleted_songs WHERE song_id = ?", (song["id"],))
                self.save_song_record(db, song, next_order)
        except sqlite3.Error:
            self.send_json({"error": "Não foi possível registrar a música."}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_json({"song": song}, HTTPStatus.CREATED)

    def handle_admin_song_update(self, song_id, payload):
        song, error = validate_song_payload(payload)
        if error:
            self.send_json({"error": error}, HTTPStatus.BAD_REQUEST)
            return
        if song["id"] != song_id:
            self.send_json({"error": "O identificador da música não pode mudar durante a edição."}, HTTPStatus.BAD_REQUEST)
            return

        try:
            song["thumbnail"] = save_thumbnail(song["id"], song.get("thumbnail"))
        except ValueError as thumbnail_error:
            self.send_json({"error": str(thumbnail_error)}, HTTPStatus.BAD_REQUEST)
            return
        except OSError:
            self.send_json({"error": "Não foi possível salvar a miniatura."}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        try:
            with connect_catalog_db() as db:
                existing = db.execute("SELECT sort_order FROM songs WHERE id = ?", (song["id"],)).fetchone()
                if not existing:
                    self.send_json({"error": "Música não encontrada."}, HTTPStatus.NOT_FOUND)
                    return
                db.execute("DELETE FROM songs WHERE id = ?", (song["id"],))
                db.execute("DELETE FROM deleted_songs WHERE song_id = ?", (song["id"],))
                self.save_song_record(db, song, existing["sort_order"])
        except sqlite3.Error:
            self.send_json({"error": "Não foi possível atualizar a música."}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_json({"song": song})

    def handle_admin_song_delete(self, song_id):
        song_id = clean_text(song_id)
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", song_id):
            self.send_json({"error": "Identificador da música inválido."}, HTTPStatus.BAD_REQUEST)
            return

        try:
            with connect_catalog_db() as db:
                existing = db.execute("SELECT id FROM songs WHERE id = ?", (song_id,)).fetchone()
                if not existing:
                    self.send_json({"error": "Música não encontrada."}, HTTPStatus.NOT_FOUND)
                    return
                db.execute("DELETE FROM songs WHERE id = ?", (song_id,))
                db.execute(
                    "INSERT OR REPLACE INTO deleted_songs (song_id, deleted_at) VALUES (?, CURRENT_TIMESTAMP)",
                    (song_id,),
                )
        except sqlite3.Error:
            self.send_json({"error": "Não foi possível excluir a música."}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_json({"ok": True, "id": song_id})

    def save_song_record(self, db, song, sort_order):
        db.execute(
            """
            INSERT INTO songs (
              id, song_title, artist, course, topic, game_type, game_kind,
              highlighted, thumbnail, game_url, youtube_watch_url, description,
              instruction_title, instruction_text, audio_src, sort_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                song["id"],
                song["songTitle"],
                song["artist"],
                song["course"],
                song["topic"],
                song["gameType"],
                song["gameKind"],
                1 if song.get("highlighted") else 0,
                song["thumbnail"],
                song["gameUrl"],
                song["youtubeWatchUrl"],
                song["description"],
                song["instructionTitle"],
                song["instructionText"],
                song.get("audioSrc"),
                sort_order,
            ),
        )

        if song["gameKind"] == "lyric-order":
            for chunk_index, chunk in enumerate(song["lyricChunks"]):
                db.execute(
                    "INSERT INTO lyric_chunks (song_id, chunk_order, text) VALUES (?, ?, ?)",
                    (song["id"], chunk_index, chunk),
                )
        elif song["gameKind"] == "complete-lyrics":
            db.execute(
                "INSERT INTO cloze_lyrics (song_id, lyrics) VALUES (?, ?)",
                (song["id"], song["clozeLyrics"]),
            )
        elif song["gameKind"] == "word-select":
            db.execute(
                "INSERT INTO selectable_lyrics (song_id, lyrics) VALUES (?, ?)",
                (song["id"], song["selectableLyrics"]),
            )


if __name__ == "__main__":
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    init_catalog_db()
    server = ThreadingHTTPServer((HOST, PORT), GatewayHandler)
    print(f"Gateway em http://{HOST}:{PORT}/", flush=True)
    server.serve_forever()
