const loginButton = document.querySelector("#loginButton");
const loginLabel = document.querySelector("#loginLabel");
const loginRequired = document.querySelector("#adminLoginRequired");
const forbidden = document.querySelector("#adminForbidden");
const adminContent = document.querySelector("#adminContent");
const progressLookupForm = document.querySelector("#progressLookupForm");
const progressUsername = document.querySelector("#progressUsername");
const progressFeedback = document.querySelector("#progressLookupFeedback");
const progressResults = document.querySelector("#adminProgressResults");
const openPromoteModalButton = document.querySelector("#openPromoteModal");
const promoteModal = document.querySelector("#promoteModal");
const closePromoteModalButton = document.querySelector("#closePromoteModal");
const cancelPromoteButton = document.querySelector("#cancelPromote");
const promoteForm = document.querySelector("#promoteForm");
const promoteUsername = document.querySelector("#promoteUsername");
const promoteConfirm = document.querySelector("#promoteConfirm");
const confirmPromoteButton = document.querySelector("#confirmPromote");
const promoteModalFeedback = document.querySelector("#promoteModalFeedback");
const promoteFeedback = document.querySelector("#promoteFeedback");
const userStoreKey = "ptMusicUser";

const state = {
  user: loadUser(),
  songs: []
};

function loadUser() {
  const stored = localStorage.getItem(userStoreKey);
  return stored ? JSON.parse(stored) : null;
}

function renderAuth() {
  renderAuthLabel(state.user, loginLabel, loginButton);
}

function setupAuth() {
  loginButton.addEventListener("click", () => {
    handleAuthClick(state, () => {
      renderAuth();
      renderAccess();
    });
  });
}

async function hydrateUser() {
  const { user } = await window.backend.getMe();
  state.user = user || null;
  if (state.user) {
    localStorage.setItem(userStoreKey, JSON.stringify(state.user));
  } else {
    localStorage.removeItem(userStoreKey);
  }
  renderAuth();
  return state.user;
}

async function hydrateSongs() {
  const { songs } = await window.backend.getSongs();
  state.songs = Array.isArray(songs) ? songs : [];
}

function renderAccess() {
  loginRequired.hidden = Boolean(state.user);
  forbidden.hidden = !state.user || state.user.role === "admin";
  adminContent.hidden = state.user?.role !== "admin";
}

function setupForms() {
  progressLookupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await lookupProgress();
  });

  openPromoteModalButton.addEventListener("click", openPromoteModal);
  closePromoteModalButton.addEventListener("click", closePromoteModal);
  cancelPromoteButton.addEventListener("click", closePromoteModal);
  promoteModal.addEventListener("click", (event) => {
    if (event.target === promoteModal) closePromoteModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !promoteModal.hidden) closePromoteModal();
  });
  promoteUsername.addEventListener("input", updatePromoteConfirmation);
  promoteConfirm.addEventListener("change", updatePromoteConfirmation);

  promoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await promoteAccount();
  });
}

function openPromoteModal() {
  promoteForm.reset();
  promoteModalFeedback.textContent = "";
  updatePromoteConfirmation();
  promoteModal.hidden = false;
  promoteUsername.focus();
}

function closePromoteModal() {
  promoteModal.hidden = true;
}

function updatePromoteConfirmation() {
  confirmPromoteButton.disabled = !promoteUsername.value.trim() || !promoteConfirm.checked;
}

async function lookupProgress() {
  const username = progressUsername.value.trim().toLowerCase();
  if (!username) return;

  progressFeedback.textContent = "Buscando progresso...";
  progressResults.innerHTML = "";
  adminContent.classList.remove("has-progress-results");
  try {
    const progress = await window.backend.getAdminProgress(username);
    progressFeedback.textContent = `Progresso de ${progress.user.username}.`;
    adminContent.classList.add("has-progress-results");
    renderProgress(progress);
  } catch (error) {
    progressFeedback.textContent = error.message;
  }
}

function renderProgress(progress) {
  const completed = progress.completed || {};
  const rows = Object.entries(completed).map(([gameId, record]) => {
    const song = state.songs.find((candidate) => candidate.id === gameId);
    return {
      songTitle: song?.songTitle || gameId,
      artist: song?.artist || "Atividade",
      gameType: song?.gameType || "Jogo",
      lastScore: record.lastScore ?? record.score ?? null,
      attemptCount: record.attemptCount ?? 0
    };
  });

  if (!rows.length) {
    progressResults.innerHTML = `<p class="empty-state">Nenhuma tentativa registrada para este usuario.</p>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "progress-row-list";
  rows
    .sort((a, b) => a.songTitle.localeCompare(b.songTitle, "pt-BR"))
    .forEach((row) => {
    const item = document.createElement("div");
      item.className = "progress-row admin-progress-row";
      item.innerHTML = `
        <span class="progress-song">
          <strong>${row.songTitle}</strong>
          <small>${row.artist}</small>
        </span>
        <span>${row.gameType}</span>
        <span class="score-pill ${getScoreClass(row.lastScore)}">${row.lastScore === null ? "Sem nota" : `${row.lastScore}%`}</span>
        <span>Tentativas: ${row.attemptCount}</span>
      `;
      list.append(item);
    });
  progressResults.append(list);
}

function getScoreClass(score) {
  if (score === null || score === undefined) return "score-empty";
  if (score >= 90) return "score-high";
  if (score >= 60) return "score-mid";
  return "score-low";
}

async function promoteAccount() {
  const username = promoteUsername.value.trim().toLowerCase();
  if (!username || !promoteConfirm.checked) return;

  promoteModalFeedback.textContent = "Promovendo conta...";
  try {
    const { user } = await window.backend.promoteUser(username);
    promoteFeedback.textContent = `${user.username} agora tem permissao de professor.`;
    closePromoteModal();
  } catch (error) {
    promoteModalFeedback.textContent = error.message;
  }
}

async function initAdminPage() {
  setupAuth();
  setupForms();
  renderAuth();
  await hydrateSongs();
  await hydrateUser();
  renderAccess();
}

initAdminPage().catch((error) => {
  console.warn(error);
  renderAccess();
});
