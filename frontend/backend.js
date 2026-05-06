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
    const error = new Error(payload.error || "Erro no servidor.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

const adminSongStoreKey = "ptMusicAdminSongs";
const adminDeletedSongStoreKey = "ptMusicDeletedSongs";

function loadAdminSongs() {
  return JSON.parse(localStorage.getItem(adminSongStoreKey) || "[]");
}

function loadDeletedSongIds() {
  return JSON.parse(localStorage.getItem(adminDeletedSongStoreKey) || "[]");
}

function saveDeletedSongIds(songIds) {
  localStorage.setItem(adminDeletedSongStoreKey, JSON.stringify([...new Set(songIds)]));
}

function rememberDeletedSong(songId) {
  saveDeletedSongIds([...loadDeletedSongIds(), songId]);
}

function forgetDeletedSong(songId) {
  saveDeletedSongIds(loadDeletedSongIds().filter((candidate) => candidate !== songId));
}

function filterDeletedSongs(payload) {
  const deletedIds = new Set(loadDeletedSongIds());
  const songs = Array.isArray(payload.songs) ? payload.songs.filter((song) => !deletedIds.has(song.id)) : [];
  return { ...payload, songs };
}

function mergeAdminSongs(payload) {
  const deletedIds = new Set(loadDeletedSongIds());
  const baseSongs = Array.isArray(payload.songs) ? payload.songs.filter((song) => !deletedIds.has(song.id)) : [];
  const adminSongs = loadAdminSongs();
  const merged = new Map(baseSongs.map((song) => [song.id, song]));
  adminSongs.filter((song) => !deletedIds.has(song.id)).forEach((song) => merged.set(song.id, song));
  return { ...payload, songs: [...merged.values()] };
}

window.backend = {
  async getMe() {
    return apiRequest("/api/me");
  },

  async getSongs() {
    try {
      return filterDeletedSongs(await apiRequest("/api/songs"));
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
    try {
      return await apiRequest("/api/admin/songs", {
        method: "POST",
        body: JSON.stringify(song)
      });
    } catch (error) {
      if (error.status && ![404, 405, 501].includes(error.status)) throw error;
      const songs = loadAdminSongs().filter((candidate) => candidate.id !== song.id);
      songs.push(song);
      localStorage.setItem(adminSongStoreKey, JSON.stringify(songs));
      forgetDeletedSong(song.id);
      return { song };
    }
  },

  async updateAdminSong(song) {
    try {
      return await apiRequest(`/api/admin/songs/${encodeURIComponent(song.id)}`, {
        method: "PUT",
        body: JSON.stringify(song)
      });
    } catch (error) {
      if (error.status && ![404, 405, 501].includes(error.status)) throw error;
      const songs = loadAdminSongs().filter((candidate) => candidate.id !== song.id);
      songs.push(song);
      localStorage.setItem(adminSongStoreKey, JSON.stringify(songs));
      forgetDeletedSong(song.id);
      return { song };
    }
  },

  async deleteAdminSong(songId) {
    try {
      const result = await apiRequest(`/api/admin/songs/${encodeURIComponent(songId)}`, { method: "DELETE" });
      rememberDeletedSong(songId);
      return result;
    } catch (error) {
      if (error.status && ![404, 405, 501].includes(error.status)) throw error;
      const songs = loadAdminSongs().filter((candidate) => candidate.id !== songId);
      localStorage.setItem(adminSongStoreKey, JSON.stringify(songs));
      rememberDeletedSong(songId);
      return { ok: true, id: songId };
    }
  }
};
