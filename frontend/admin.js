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
const songGameMode = document.querySelector("#songGameMode");
const songModeFields = document.querySelector("#songModeFields");
const userStoreKey = "ptMusicUser";

const state = {
  user: loadUser(),
  songs: [],
  topicOptions: [],
  topicComboOpen: false
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

  songGameMode.addEventListener("change", renderSongModeFields);
  setupSelectComboFields();
  renderSongModeFields();
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
    progressResults.innerHTML = `<p class="empty-state">Nenhuma tentativa registrada para este usuário.</p>`;
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

function renderSongModeFields() {
  const mode = songGameMode.value;
  if (!mode) {
    songModeFields.innerHTML = `<p class="empty-state">Selecione um modo de jogo para configurar os campos da música.</p>`;
    return;
  }

  const templates = {
    "lyric-order": `
      <section class="song-mode-card">
        <div>
          <p class="eyebrow">Ordenar letras</p>
          <h3>Campos para blocos reordenáveis</h3>
          <p class="admin-muted">Placeholder para título, artista, link do YouTube e blocos de letras em ordem correta.</p>
        </div>
        <label for="orderPlaceholder">Blocos da letra</label>
        <textarea id="orderPlaceholder" rows="7" placeholder="Exemplo:\nBom dia, boa tarde\nBoa noite amor\nMinha vida inteira..." disabled></textarea>
        <button class="primary-action" type="button" disabled>Salvar jogo de ordenar letras</button>
      </section>
    `,
    "complete-lyrics": `
      <section class="song-mode-card">
        <div>
          <p class="eyebrow">Completar letras</p>
          <h3>Campos para lacunas</h3>
          <p class="admin-muted">Placeholder para letras com espaços em branco e respostas esperadas por lacuna.</p>
        </div>
        <label for="clozePlaceholder">Letra com lacunas</label>
        <textarea id="clozePlaceholder" rows="7" placeholder="Exemplo:\nEu moro em ____\nResposta esperada: Lisboa" disabled></textarea>
        <button class="primary-action" type="button" disabled>Salvar jogo de completar letras</button>
      </section>
    `,
    "word-select": `
      <section class="song-mode-card">
        <div>
          <p class="eyebrow">Selecionar palavras</p>
          <h3>Campos para seleção lexical</h3>
          <p class="admin-muted">Placeholder para texto completo, categoria gramatical e palavras corretas para seleção.</p>
        </div>
        <label for="selectPlaceholder">Palavras-alvo</label>
        <textarea id="selectPlaceholder" rows="7" placeholder="Exemplo:\nCategoria: verbos no passado\nPalavras corretas: fui, cantou, chegou" disabled></textarea>
        <button class="primary-action" type="button" disabled>Salvar jogo de selecionar palavras</button>
      </section>
    `
  };

  songModeFields.innerHTML = `
    ${renderCommonSongFields()}
    ${renderSongInstructionFields()}
    ${templates[mode]}
  `;
  setupYoutubeWatchLinkValidation();
  setupTopicCombobox();
  setupSelectComboFields(songModeFields);
}

function setupSelectComboFields(root = document) {
  root.querySelectorAll(".select-combo-field").forEach((field) => {
    if (field.dataset.selectComboReady) return;
    field.dataset.selectComboReady = "true";
    const select = field.querySelector("select");
    const toggle = field.querySelector(".select-combo-toggle");
    if (!select || !toggle) return;

    toggle.addEventListener("click", () => {
      select.focus();
      if (typeof select.showPicker === "function") {
        select.showPicker();
        return;
      }
      select.click();
    });
  });
}

function renderCommonSongFields() {
  return `
    <section class="song-common-fields">
      <div class="field-grid">
        <label>
          <span>Título</span>
          <input id="songTitle" name="songTitle" type="text" placeholder="Exemplo: Bom dia, boa tarde, boa noite amor" required />
        </label>
        <label>
          <span>Autor</span>
          <input id="songAuthor" name="songAuthor" type="text" placeholder="Exemplo: Jorge Ben Jor" required />
        </label>
        <label>
          <span>Curso</span>
          <span class="select-combo-field">
            <select id="songCourse" name="course" required>
              <option value="">Selecione um curso</option>
              <option>Português I</option>
              <option>Português II</option>
              <option>Português III</option>
              <option>Português IV</option>
            </select>
            <button class="select-combo-toggle" type="button" aria-label="Mostrar cursos"></button>
          </span>
        </label>
        <label>
          <span>Tópico</span>
          <span class="combo-field">
            <input id="songTopic" name="topic" type="text" placeholder="Exemplo: vocabulário - partes do corpo, pretérito perfeito" role="combobox" aria-expanded="false" aria-controls="songTopicOptions" autocomplete="off" required />
            <button id="songTopicToggle" class="combo-toggle" type="button" aria-label="Mostrar tópicos"></button>
            <div id="songTopicOptions" class="combo-options" role="listbox" hidden></div>
          </span>
        </label>
      </div>
      <label>
        <span>Link do YouTube</span>
        <input id="youtubeWatchLink" name="youtubeWatchLink" type="url" placeholder="https://www.youtube.com/watch?v=<código>" required />
      </label>
      <p id="youtubeWatchFeedback" class="field-feedback" aria-live="polite"></p>
    </section>
  `;
}

function renderSongInstructionFields() {
  return `
    <section class="song-instruction-fields">
      <div>
        <p class="eyebrow">Instruções</p>
        <h3>Orientação para esta atividade</h3>
        <p class="admin-muted">Texto mostrado ao estudante antes de iniciar o jogo.</p>
      </div>
      <label>
        <span>Título das instruções</span>
        <input id="songInstructionTitle" name="instructionTitle" type="text" placeholder="Exemplo: Antes de começar" required />
      </label>
      <label>
        <span>Texto das instruções</span>
        <textarea id="songInstructionText" name="instructionText" rows="5" placeholder="Exemplo: Escute a música uma vez e depois complete a atividade." required></textarea>
      </label>
    </section>
  `;
}

function setupTopicCombobox() {
  const input = document.querySelector("#songTopic");
  const toggle = document.querySelector("#songTopicToggle");
  const options = document.querySelector("#songTopicOptions");
  if (!input || !toggle || !options) return;

  state.topicOptions = getTopicOptions();
  input.addEventListener("input", () => renderTopicOptions(input, options, true));
  input.addEventListener("focus", () => renderTopicOptions(input, options, true));
  toggle.addEventListener("click", () => {
    state.topicComboOpen = options.hidden;
    renderTopicOptions(input, options, state.topicComboOpen);
    input.focus();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".combo-field") && !options.contains(event.target)) {
      closeTopicOptions(input, options);
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTopicOptions(input, options);
  });
}

function getTopicOptions() {
  return [...new Map(state.songs.map((song) => [song.topic.toLocaleLowerCase("pt-BR"), song.topic])).values()].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

function renderTopicOptions(input, options, shouldOpen) {
  const query = input.value.trim().toLocaleLowerCase("pt-BR");
  const matches = state.topicOptions.filter((topic) => topic.toLocaleLowerCase("pt-BR").includes(query));
  options.innerHTML = "";

  matches.forEach((topic) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "combo-option";
    option.setAttribute("role", "option");
    option.textContent = topic;
    option.addEventListener("click", () => {
      input.value = topic;
      closeTopicOptions(input, options);
    });
    options.append(option);
  });

  const hasOptions = matches.length > 0;
  options.hidden = !shouldOpen || !hasOptions;
  input.setAttribute("aria-expanded", String(!options.hidden));
}

function closeTopicOptions(input, options) {
  options.hidden = true;
  input.setAttribute("aria-expanded", "false");
}

function setupYoutubeWatchLinkValidation() {
  const input = document.querySelector("#youtubeWatchLink");
  const feedback = document.querySelector("#youtubeWatchFeedback");
  if (!input || !feedback) return;

  input.addEventListener("blur", () => normalizeYoutubeWatchLink(input, feedback));
  input.addEventListener("input", () => {
    input.setCustomValidity("");
    feedback.textContent = "";
  });
}

function normalizeYoutubeWatchLink(input, feedback) {
  const rawValue = input.value.trim();
  if (!rawValue) return;

  const croppedValue = rawValue.split("&")[0];
  input.value = croppedValue;

  const isWatchLink = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+$/.test(croppedValue);
  if (!isWatchLink) {
    input.setCustomValidity("Use um link no formato https://www.youtube.com/watch?v=<código>.");
    feedback.textContent = "Use um link no formato https://www.youtube.com/watch?v=<código>.";
    return;
  }

  input.setCustomValidity("");
  feedback.textContent = rawValue === croppedValue ? "Link válido." : "Link válido. Parâmetros extras foram removidos.";
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
    promoteFeedback.textContent = `${user.username} agora tem permissão de professor.`;
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
