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
  topicComboOpen: false,
  wordSelectTokens: [],
  completeLyricsTokens: []
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
          <h3>Blocos da letra</h3>
          <p class="admin-muted">Primeiro, selecione quantos blocos o jogo vai ter. Depois, preencha os blocos abaixo na ordem correta.</p>
        </div>
        <label for="lyricBlockCount">Quantidade de blocos</label>
        <input id="lyricBlockCount" name="lyricBlockCount" type="number" min="1" step="1" inputmode="numeric" placeholder="Exemplo: 4" />
        <p id="lyricBlockFeedback" class="field-feedback" aria-live="polite"></p>
        <div id="lyricBlockFields" class="lyric-block-fields"></div>
        <button class="primary-action" type="button" disabled>Salvar jogo de ordenar letras</button>
      </section>
    `,
    "complete-lyrics": `
      <section class="song-mode-card">
        <div>
          <p class="eyebrow">Completar letras</p>
          <h3>Lacunas da letra</h3>
          <p class="admin-muted">Adicione a letra com as dicas, clique em preparar letra, escolha as palavras que devem virar lacunas e depois envie a seleção.</p>
        </div>
        <label for="completeLyricsText">Letra da música</label>
        <textarea id="completeLyricsText" rows="8" placeholder="Cole a letra completa aqui, incluindo as dicas"></textarea>
        <label class="confirm-row complete-global-hints-row" for="completeUsesGlobalHints">
          <input id="completeUsesGlobalHints" type="checkbox" />
          <span>As dicas são globais para a atividade inteira.</span>
        </label>
        <label id="completeGlobalHintsField" hidden>
          <span>Dicas globais</span>
          <input id="completeGlobalHints" name="completeGlobalHints" type="text" placeholder="Exemplo: ser (3x), chamar, subir, ficar" />
        </label>
        <div class="game-actions">
          <button id="stageCompleteLyrics" class="secondary-action" type="button">Preparar letra</button>
          <button id="submitCompleteLyricsBlanks" class="primary-action" type="button" disabled>Enviar lacunas</button>
        </div>
        <p id="completeLyricsFeedback" class="field-feedback" aria-live="polite"></p>
        <div id="completeLyricsPreview" class="cloze-lyrics admin-cloze-preview" hidden></div>
      </section>
    `,
    "word-select": `
      <section class="song-mode-card">
        <div>
          <p class="eyebrow">Selecionar palavras</p>
          <h3>Seleção de palavras</h3>
          <p class="admin-muted">Adicione a letra, clique em preparar letra, escolha as palavras que os estudantes devem selecionar e depois envie a seleção.</p>
        </div>
        <label for="wordSelectLyrics">Letra da música</label>
        <textarea id="wordSelectLyrics" rows="8" placeholder="Cole a letra completa aqui"></textarea>
        <div class="game-actions">
          <button id="stageWordSelectLyrics" class="secondary-action" type="button">Preparar letra</button>
          <button id="submitWordSelectionTargets" class="primary-action" type="button" disabled>Enviar seleção</button>
        </div>
        <p id="wordSelectFeedback" class="field-feedback" aria-live="polite"></p>
        <div id="wordSelectPreview" class="selectable-lyrics admin-selectable-preview" hidden></div>
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
  setupThumbnailUploadPreview();
  if (mode === "lyric-order") setupLyricOrderBlockBuilder();
  if (mode === "complete-lyrics") setupCompleteLyricsBuilder();
  if (mode === "word-select") setupWordSelectBuilder();
}

function setupCompleteLyricsBuilder() {
  const lyricsInput = document.querySelector("#completeLyricsText");
  const stageButton = document.querySelector("#stageCompleteLyrics");
  const submitButton = document.querySelector("#submitCompleteLyricsBlanks");
  const feedback = document.querySelector("#completeLyricsFeedback");
  if (!lyricsInput || !stageButton || !submitButton || !feedback) return;

  state.completeLyricsTokens = [];
  setupCompleteGlobalHintsToggle();
  stageButton.addEventListener("click", () => stageCompleteLyrics(lyricsInput, submitButton, feedback));
  submitButton.addEventListener("click", () => submitCompleteLyricsBlanks(feedback));
}

function setupCompleteGlobalHintsToggle() {
  const checkbox = document.querySelector("#completeUsesGlobalHints");
  const field = document.querySelector("#completeGlobalHintsField");
  const input = document.querySelector("#completeGlobalHints");
  if (!checkbox || !field || !input) return;

  checkbox.addEventListener("change", () => {
    field.hidden = !checkbox.checked;
    input.required = checkbox.checked;
    if (!checkbox.checked) input.value = "";
  });
}

function stageCompleteLyrics(lyricsInput, submitButton, feedback) {
  const lyrics = lyricsInput.value.trim();
  if (!lyrics) {
    feedback.textContent = "Cole a letra antes de prepará-la.";
    return;
  }

  state.completeLyricsTokens = parseAdminSelectableLyrics(lyrics);
  submitButton.disabled = false;
  feedback.textContent = "Letra preparada. Clique nas palavras que devem virar lacunas.";
  renderAdminCompleteLyrics();
}

function renderAdminCompleteLyrics() {
  const preview = document.querySelector("#completeLyricsPreview");
  if (!preview) return;
  preview.hidden = false;
  preview.innerHTML = "";

  state.completeLyricsTokens.forEach((token) => {
    if (token.type === "text") {
      preview.append(document.createTextNode(token.value));
      return;
    }

    if (token.selected) {
      const wrapper = document.createElement("span");
      wrapper.className = "cloze-blank admin-cloze-blank";
      wrapper.innerHTML = `
        <input type="text" placeholder="${token.value}" disabled aria-label="Lacuna para ${token.value}" />
        <span class="blank-result" aria-label="Remover lacuna">x</span>
      `;
      wrapper.addEventListener("click", () => toggleAdminCompleteBlank(token.id));
      preview.append(wrapper);
      return;
    }

    const word = document.createElement("button");
    word.type = "button";
    word.className = "selectable-word";
    word.textContent = token.value;
    word.setAttribute("aria-pressed", "false");
    word.addEventListener("click", () => toggleAdminCompleteBlank(token.id));
    preview.append(word);
  });
}

function toggleAdminCompleteBlank(tokenId) {
  const token = state.completeLyricsTokens.find((item) => item.id === tokenId);
  if (!token || token.type !== "word") return;
  token.selected = !token.selected;
  renderAdminCompleteLyrics();
}

function submitCompleteLyricsBlanks(feedback) {
  const blankCount = state.completeLyricsTokens.filter((token) => token.type === "word" && token.selected).length;
  if (!blankCount) {
    feedback.textContent = "Selecione pelo menos uma palavra para virar lacuna.";
    return;
  }
  feedback.textContent = `${blankCount} ${blankCount === 1 ? "lacuna selecionada" : "lacunas selecionadas"} para o jogo.`;
}

function setupWordSelectBuilder() {
  const lyricsInput = document.querySelector("#wordSelectLyrics");
  const stageButton = document.querySelector("#stageWordSelectLyrics");
  const submitButton = document.querySelector("#submitWordSelectionTargets");
  const feedback = document.querySelector("#wordSelectFeedback");
  if (!lyricsInput || !stageButton || !submitButton || !feedback) return;

  state.wordSelectTokens = [];
  stageButton.addEventListener("click", () => stageWordSelectLyrics(lyricsInput, submitButton, feedback));
  submitButton.addEventListener("click", () => submitWordSelectionTargets(feedback));
}

function stageWordSelectLyrics(lyricsInput, submitButton, feedback) {
  const lyrics = lyricsInput.value.trim();
  if (!lyrics) {
    feedback.textContent = "Cole a letra antes de prepará-la.";
    return;
  }

  state.wordSelectTokens = parseAdminSelectableLyrics(lyrics);
  submitButton.disabled = false;
  feedback.textContent = "Letra preparada. Clique nas palavras que os estudantes devem selecionar.";
  renderAdminSelectableLyrics();
}

function parseAdminSelectableLyrics(text) {
  const tokens = [];
  const wordPattern = /[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*/gu;
  let cursor = 0;
  let match;

  while ((match = wordPattern.exec(text)) !== null) {
    if (match.index > cursor) tokens.push({ type: "text", value: text.slice(cursor, match.index) });
    tokens.push({
      type: "word",
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      value: match[0],
      selected: false
    });
    cursor = wordPattern.lastIndex;
  }

  if (cursor < text.length) tokens.push({ type: "text", value: text.slice(cursor) });
  return tokens;
}

function renderAdminSelectableLyrics() {
  const preview = document.querySelector("#wordSelectPreview");
  if (!preview) return;
  preview.hidden = false;
  preview.innerHTML = "";

  state.wordSelectTokens.forEach((token) => {
    if (token.type === "text") {
      preview.append(document.createTextNode(token.value));
      return;
    }

    const word = document.createElement("button");
    word.type = "button";
    word.className = "selectable-word";
    word.textContent = token.value;
    word.setAttribute("aria-pressed", String(token.selected));
    if (token.selected) word.classList.add("is-selected");
    word.addEventListener("click", () => toggleAdminSelectableWord(token.id));
    preview.append(word);
  });
}

function toggleAdminSelectableWord(tokenId) {
  const token = state.wordSelectTokens.find((item) => item.id === tokenId);
  if (!token || token.type !== "word") return;
  token.selected = !token.selected;
  renderAdminSelectableLyrics();
}

function submitWordSelectionTargets(feedback) {
  const selectedCount = state.wordSelectTokens.filter((token) => token.type === "word" && token.selected).length;
  if (!selectedCount) {
    feedback.textContent = "Selecione pelo menos uma palavra antes de enviar.";
    return;
  }
  feedback.textContent = `${selectedCount} ${selectedCount === 1 ? "palavra selecionada" : "palavras selecionadas"} para o jogo.`;
}

function setupLyricOrderBlockBuilder() {
  const countInput = document.querySelector("#lyricBlockCount");
  const fields = document.querySelector("#lyricBlockFields");
  const feedback = document.querySelector("#lyricBlockFeedback");
  if (!countInput || !fields || !feedback) return;

  countInput.addEventListener("input", () => renderLyricOrderBlocks(countInput, fields, feedback));
}

function renderLyricOrderBlocks(countInput, fields, feedback) {
  const rawCount = countInput.value.trim();
  fields.innerHTML = "";

  if (!rawCount) {
    feedback.textContent = "";
    return;
  }

  const blockCount = Number(rawCount);
  if (!Number.isInteger(blockCount) || blockCount < 1) {
    feedback.textContent = "Informe um número inteiro positivo.";
    return;
  }

  feedback.textContent = `${blockCount} ${blockCount === 1 ? "bloco" : "blocos"} para preencher.`;
  for (let index = 1; index <= blockCount; index += 1) {
    const label = document.createElement("label");
    label.className = "lyric-block-field";
    label.innerHTML = `
      <span>Bloco #${index}</span>
      <textarea name="lyricBlock${index}" rows="3" placeholder="Bloco #${index}" required></textarea>
    `;
    fields.append(label);
  }
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
      <label>
        <span>Imagem da miniatura</span>
        <input id="songThumbnail" name="thumbnail" type="file" accept="image/*" />
      </label>
      <div class="thumbnail-upload-preview">
        <img id="songThumbnailPreview" src="assets/thumb-default.svg" alt="Prévia da miniatura" />
        <p id="songThumbnailFeedback" class="field-feedback">Sem imagem enviada. A miniatura usará o fundo preto padrão.</p>
      </div>
    </section>
  `;
}

function setupThumbnailUploadPreview() {
  const input = document.querySelector("#songThumbnail");
  const preview = document.querySelector("#songThumbnailPreview");
  const feedback = document.querySelector("#songThumbnailFeedback");
  if (!input || !preview || !feedback) return;

  input.addEventListener("change", () => {
    const [file] = input.files;
    if (!file) {
      preview.src = "assets/thumb-default.svg";
      feedback.textContent = "Sem imagem enviada. A miniatura usará o fundo preto padrão.";
      return;
    }

    preview.src = URL.createObjectURL(file);
    feedback.textContent = `Arquivo selecionado: ${file.name}`;
  });
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
