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

window.backend = {
  async getMe() {
    return apiRequest("/api/me");
  },

  async getSongs() {
    try {
      return await apiRequest("/api/songs");
    } catch (error) {
      const response = await fetch("songs.seed.json", { cache: "no-store" });
      if (!response.ok) throw error;
      return response.json();
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
  }
};
