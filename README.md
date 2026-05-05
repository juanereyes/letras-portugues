# Portuguese Through Music

Portuguese Through Music is a small learning platform for MIT Portuguese classes. Students practice songs through interactive games, sign in with local accounts, and track their progress across attempts.

The current app is intentionally lightweight: plain HTML/CSS/JavaScript on the frontend, Python standard-library HTTP services on the backend, and SQLite for local persistence.

## Current Features

- Main song catalog with filters for course, topic, and game type.
- Random carousel showing four highlighted songs on each page load.
- Separate game pages for each reusable game mode.
- Student login and registration with HTTP-only session cookies.
- Per-student progress tracking in SQLite.
- Dedicated progress page showing last score and total attempts per song.
- Docker and non-Docker local development options.

## Game Modes

### `lyric-order`

Students order chunks of lyrics before listening. After submitting, they can review with the YouTube link and restart the activity.

Template:

```text
frontend/lyric-order.html
frontend/lyric-order.js
```

Song data uses:

- `lyricChunks`

### `complete-lyrics`

Students open the YouTube song first, then fill in missing words. Answers are graded as exact, accent-only mismatch, or incorrect.

Template:

```text
frontend/complete-lyrics.html
frontend/complete-lyrics.js
```

Song data uses:

- `clozeLyrics`

### `word-select`

Students open the YouTube song first, then select words in the lyrics that match a song-specific category. Scores are based on correct selections relative to the larger of selected words or expected words.

Template:

```text
frontend/word-select.html
frontend/word-select.js
```

Song data uses:

- `selectableLyrics`

## Project Layout

```text
frontend/              Browser-facing HTML, CSS, JS, SVG thumbnails, and seed JSON
backend/gateway/       Public gateway, static-file server, song catalog API, API proxy
backend/auth/          Private authentication service
backend/progress/      Private progress and attempts service
data/                  Local SQLite databases, ignored by git
Dockerfile             Shared Python image for containerized services
docker-compose.yml     Gateway/auth/progress container wiring
run_backend.sh         Local Linux/WSL startup script
run_backend.ps1        Local PowerShell startup script
```

## Run Locally

From the project root in WSL/Linux:

```bash
./run_backend.sh
```

If port `8000` is already in use:

```bash
PORT=8001 ./run_backend.sh
```

Then open the matching gateway URL:

```text
http://127.0.0.1:8000/
```

From PowerShell:

```powershell
.\run_backend.ps1
```

Or on another port:

```powershell
.\run_backend.ps1 -Port 8001
```

## Run With Docker Compose

```bash
docker compose up --build
```

Then open:

```text
http://127.0.0.1:8000/
```

Compose starts:

- `gateway`: public service exposed to the browser
- `auth`: private auth service
- `progress`: private progress service

Only the gateway should be opened in the browser.

## Data Storage

SQLite databases are created automatically in `data/`:

- `data/catalog.sqlite3`: songs and game metadata
- `data/auth.sqlite3`: users and sessions
- `data/progress.sqlite3`: attempts and scores

The gateway seeds and updates the catalog from:

```text
frontend/songs.seed.json
```

Restart the backend after editing `songs.seed.json` so the active catalog database is updated.

## Song Data

Each song object should include:

- `id`: stable ID used for progress records
- `songTitle`
- `artist`
- `course`: `Português I`, `Português II`, `Português III`, or `Português IV`
- `topic`
- `gameType`: visible game label
- `gameKind`: template key such as `complete-lyrics`
- `highlighted`: whether it can appear in the carousel
- `thumbnail`: SVG/image path under `frontend/assets/`
- `gameUrl`: template URL with the song ID
- `youtubeWatchUrl`
- `description`
- `instructionTitle`
- `instructionText`

Then add the game-mode-specific field:

- `lyricChunks` for lyric ordering
- `clozeLyrics` for fill-in-the-blank games
- `selectableLyrics` for word-selection games

## Authentication

The gateway exposes:

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/me`

The gateway delegates auth work to the private auth service. Passwords are stored as salted PBKDF2 hashes, and sessions use HTTP-only cookies.

Future authentication work should add password recovery for forgotten passwords, including verified email addresses, confirmation emails, expiring reset tokens, and the email/MFA setup needed to confirm account ownership before password changes.

## Progress Tracking

Progress is only tracked for logged-in students.

Game pages save attempts through:

```text
POST /api/attempts
```

The progress page uses:

```text
GET /api/progress
```

It shows each song with:

- song title
- topic
- activity type
- last attempt score
- total attempts

Scores are color-coded:

- green: `>= 90%`
- yellow: `60-89%`
- red: `< 60%`
- grey: no attempts

## Next Steps

Good next improvements include:

0. Check the general text shown in the site as much of it was developed as placeholder text.
1. Replace the generated SVG thumbnails with actual pictures or approved artwork for each song.
2. Add more songs for all four Portuguese courses.
3. Add admin/professor vs. student account roles and permissions.
4. Build an `Área docente` page for instructors.
5. Let admins/professors add songs directly from the website using the existing game modes.
6. Add form-based editors for `lyric-order`, `complete-lyrics`, and `word-select` song data.
7. Add password reset with verified email and MFA setup.
8. Add course enrollment so students only see the course sections relevant to them.
9. Deploy the webpage.
