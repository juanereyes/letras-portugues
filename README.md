# Portuguese Through Music

Portuguese Through Music is a lightweight learning platform for MIT Portuguese classes. Students practice songs through interactive games, sign in with local accounts, and track progress across attempts. Professors can manage the song catalog and review student progress from an admin-only area.

The app intentionally uses a small stack: plain HTML/CSS/JavaScript on the frontend, Python standard-library HTTP services on the backend, and SQLite for local persistence.

## Current Features

- Song catalog with filters for course, topic, and game type.
- Random carousel showing highlighted songs on each page load.
- Three reusable game modes: lyric ordering, fill-in-the-blank lyrics, and word selection.
- Student login and registration with HTTP-only session cookies.
- Student/admin role separation. The UI labels admin access as Professor.
- Per-student progress tracking in SQLite.
- Dedicated progress page showing last score and total attempts per song.
- Admin progress lookup by username.
- Admin-controlled account promotion.
- Admin song management:
  - add new songs from the browser
  - preview the thumbnail and game page before submission
  - upload optional thumbnail images
  - edit existing songs
  - delete songs from the catalog
  - search manageable songs by title
- Backend catalog persistence for song creation, editing, deletion, and uploaded thumbnails.
- Basic XSS hardening for admin-entered song data when rendered back into the app.
- Docker and non-Docker local development options.

## Game Modes

### `lyric-order`

Students order chunks of lyrics before listening. After submitting, they can review with the YouTube link and restart the activity.

Files:

```text
frontend/lyric-order.html
frontend/lyric-order.js
```

Song data uses:

- `lyricChunks`: array of lyric blocks in the correct order.

### `complete-lyrics`

Students open the YouTube song first, then fill in missing words. Answers are graded as exact, accent-only mismatch, or incorrect.

Files:

```text
frontend/complete-lyrics.html
frontend/complete-lyrics.js
```

Song data uses:

- `clozeLyrics`: lyrics where answers are wrapped in brackets, for example `[sou]`.

### `word-select`

Students open the YouTube song first, then select words in the lyrics that match a song-specific category. Scores are based on correct selections relative to the larger of selected words or expected words.

Files:

```text
frontend/word-select.html
frontend/word-select.js
```

Song data uses:

- `selectableLyrics`: lyrics where target words are wrapped in brackets.

## Project Layout

```text
frontend/                    Browser-facing HTML, CSS, JS, thumbnails, and seed JSON
frontend/admin.html           Admin hub
frontend/admin-song-add.html  Add/edit song form with preview
frontend/admin-song-manage.html
                             Edit/delete song list
backend/gateway/             Public gateway, static-file server, catalog API, API proxy
backend/auth/                Private authentication service
backend/progress/            Private progress and attempts service
data/                        Local SQLite databases, ignored by git
Dockerfile                   Shared Python image for containerized services
docker-compose.yml           Gateway/auth/progress container wiring
run_backend.sh               Local Linux/WSL startup script
run_backend.ps1              Local PowerShell startup script
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

- `data/catalog.sqlite3`: songs, game metadata, mode-specific lyrics, and deleted-song markers
- `data/auth.sqlite3`: users and sessions
- `data/progress.sqlite3`: attempts and scores

The gateway seeds the catalog from:

```text
frontend/songs.seed.json
```

Seed songs are inserted only when they are not already present in the catalog. That lets admin edits persist in SQLite instead of being overwritten on restart. If an admin deletes a seed song, the gateway records the deletion in `deleted_songs` so the song does not reappear on restart.

Uploaded thumbnails are written under:

```text
frontend/assets/uploads/
```

If no thumbnail is uploaded, the app uses:

```text
frontend/assets/thumb-default.svg
```

## Song Data

Each song object includes:

- `id`: stable ID used for progress records
- `songTitle`
- `artist`
- `course`: `Português I`, `Português II`, `Português III`, or `Português IV`
- `topic`
- `gameType`: visible game label
- `gameKind`: template key such as `complete-lyrics`
- `highlighted`: whether it can appear in the carousel
- `thumbnail`: image path under `frontend/assets/`, or an uploaded thumbnail path
- `gameUrl`: template URL with the song ID
- `youtubeWatchUrl`: `https://www.youtube.com/watch?v=<code>`
- `description`
- `instructionTitle`
- `instructionText`

Then add the game-mode-specific field:

- `lyricChunks` for lyric ordering
- `clozeLyrics` for fill-in-the-blank games
- `selectableLyrics` for word-selection games

## Professor Area

The Professor area is admin-only and starts at:

```text
frontend/admin.html
```

It currently includes:

- student progress lookup by username
- account promotion
- song-management entry points

Song creation and editing happens at:

```text
frontend/admin-song-add.html
```

The form requires all visible fields before preview. For `complete-lyrics` and `word-select`, the professor must stage the lyrics and confirm the selected words before preview. Confirmation submits the complete song payload to the backend.

Song editing and deletion happens at:

```text
frontend/admin-song-manage.html
```

The list can be searched by song title. Editing opens the same add-song form in edit mode. Deletion removes the song from the SQLite catalog and records a tombstone for seeded songs.

## Backend API

Public gateway endpoints include:

- `GET /api/songs`
- `GET /api/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/progress`
- `POST /api/attempts`
- `GET /api/admin/progress?username=<username>`
- `POST /api/admin/promote`
- `POST /api/admin/songs`
- `PUT /api/admin/songs/<song-id>`
- `DELETE /api/admin/songs/<song-id>`

Admin endpoints require an authenticated user with role `admin`.

## Authentication

The gateway delegates auth work to the private auth service. Passwords are stored as salted PBKDF2 hashes, and sessions use HTTP-only cookies.

Accounts have one of two roles:

- `student`: can play games and save personal progress.
- `admin`: has student capabilities plus access to Professor tools.

The first registered account becomes `admin`; later registrations become `student`. After that, the only application-supported way to create another admin is for an existing admin to promote a username from the Professor page.

This is intentionally pragmatic, but it is not ideal from a separation-of-duties perspective because admins can grant admin access to other accounts. For the current intended use, the class professor is expected to be the only admin and there is no separate person available to fulfill an independent account-administration role. If the app later grows beyond that single-professor model, admin promotion should move to a separate operational process or a distinct higher-trust role.

Future authentication work should add password recovery for forgotten passwords, including verified email addresses, confirmation emails, expiring reset tokens, and the email/MFA setup needed to confirm account ownership before password changes.

## Progress Tracking

Progress is tracked for logged-in students.

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

Admins can use the Professor page to look up a specific user's progress by username. This lookup is username-based for now; it should move to email or Kerberos identity when institutional authentication is added.

## Security Notes

Admin song input is treated as untrusted when rendered. The frontend uses DOM construction, `textContent`, safe URL checks, and safe image/audio source checks for catalog and game rendering. The backend validates YouTube watch links, internal game URLs, song IDs, thumbnail paths, and uploaded thumbnail data.

This is still a local teaching app, not a hardened production deployment. Recommended future security improvements include:

- add a Content Security Policy header
- add CSRF protection for state-changing endpoints
- require HTTPS outside local development
- add rate limiting for authentication endpoints
- move authentication to Kerberos or another institutional identity provider

## Next Steps

Good next improvements include:

1. Review the instructional text throughout the site and replace remaining placeholder copy.
2. Replace generated SVG thumbnails with actual pictures or approved artwork for each song.
3. Add more songs for all four Portuguese courses.
4. Add course enrollment so students only see relevant course sections.
5. Add password reset with verified email and MFA setup.
6. Add CSRF protection and a Content Security Policy.
7. Add automated tests for song CRUD, auth, progress, and XSS-sensitive rendering.
8. Deploy the webpage.
