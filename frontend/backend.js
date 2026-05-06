async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Erro no servidor.");
  }
  return payload;
}

const adminSongStoreKey = "ptMusicAdminSongs";

function loadAdminSongs() {
  return JSON.parse(localStorage.getItem(adminSongStoreKey) || "[]");
}

function mergeAdminSongs(payload) {
  const baseSongs = Array.isArray(payload.songs) ? payload.songs : [];
  const adminSongs = loadAdminSongs();
  const merged = new Map(baseSongs.map((song) => [song.id, song]));
  adminSongs.forEach((song) => merged.set(song.id, song));
  return { ...payload, songs: [...merged.values()] };
}

window.backend = {
  async getMe() {
    return apiRequest("/api/me");
  },

  async getSongs() {
    try {
      return mergeAdminSongs(await apiRequest("/api/songs"));
    } catch (error) {
      const response = await fetch("songs.seed.json", { cache: "no-store" });
      if (!response.ok) throw error;
      return mergeAdminSongs(await response.json());
    }
  },

  async login(username, password) {
    return apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },

  async register(username, password) {
    return apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },

  async logout() {
    return apiRequest("/api/auth/logout", { method: "POST" });
  },

  async getProgress() {
    return apiRequest("/api/progress");
  },

  async saveAttempt(gameId, score, details = null) {
    return apiRequest("/api/attempts", {
      method: "POST",
      body: JSON.stringify({ gameId, score, details })
    });
  },

  async getAdminProgress(username) {
    return apiRequest(`/api/admin/progress?username=${encodeURIComponent(username)}`);
  },

  async promoteUser(username) {
    return apiRequest("/api/admin/promote", {
      method: "POST",
      body: JSON.stringify({ username })
    });
  },

  async saveAdminSong(song) {
    const songs = loadAdminSongs().filter((candidate) => candidate.id !== song.id);
    songs.push(song);
    localStorage.setItem(adminSongStoreKey, JSON.stringify(songs));
    return { song };
  }
};
