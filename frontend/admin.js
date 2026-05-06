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
const songBuilderForm = document.querySelector("#songBuilderForm");
const previewSongButton = document.querySelector("#previewSongButton");
const songBuilderFeedback = document.querySelector("#songBuilderFeedback");
const songPreviewPanel = document.querySelector("#songPreviewPanel");
const confirmSongButton = document.querySelector("#confirmSongButton");
const editSongButton = document.querySelector("#editSongButton");
const songPreviewFeedback = document.querySelector("#songPreviewFeedback");
const songManagementList = document.querySelector("#songManagementList");
const songManagementFeedback = document.querySelector("#songManagementFeedback");
const songTitleSearch = document.querySelector("#songTitleSearch");
const songBuilderPageTitle = document.querySelector("#songBuilderPageTitle");
const songBuilderPanelTitle = document.querySelector("#songBuilderPanelTitle");
const userStoreKey = "ptMusicUser";
const pageParams = new URLSearchParams(window.location.search);

const state = {
  user: loadUser(),
  songs: [],
  topicOptions: [],
  topicComboOpen: false,
  wordSelectTokens: [],
  wordSelectConfirmed: false,
  completeLyricsTokens: [],
  completeLyricsConfirmed: false,
  thumbnailPreviewUrl: "assets/thumb-default.svg",
  thumbnailLoading: false,
  pendingSong: null,
  editingSongId: pageParams.get("edit")
};

const modeMeta = {
  "lyric-order": {
    gameType: "Ordenar a letra",
    idSuffix: "order",
    description: "Organize os trechos da letra antes de ouvir a música."
  },
  "complete-lyrics": {
    gameType: "Completar a letra",
    idSuffix: "complete",
    description: "Ouça a música e complete as palavras que faltam."
  },
  "word-select": {
    gameType: "Selecionar palavras",
    idSuffix: "word-select",
    description: "Ouça a música e selecione palavras de uma categoria."
  }
};

function loadUser() {
  const stored = localStorage.getItem(userStoreKey);
  return stored ? JSON.parse(stored) : null;
}

function renderAuth() {
  if (!loginLabel || !loginButton) return;
  renderAuthLabel(state.user, loginLabel, loginButton);
}

function setupAuth() {
  if (!loginButton) return;
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
  if (loginRequired) loginRequired.hidden = Boolean(state.user);
  if (forbidden) forbidden.hidden = !state.user || state.user.role === "admin";
  if (adminContent) adminContent.hidden = state.user?.role !== "admin";
}

function setupForms() {
  if (progressLookupForm) {
    progressLookupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await lookupProgress();
    });
  }

  if (openPromoteModalButton && promoteModal) {
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

  if (songGameMode && songBuilderForm) {
    songGameMode.addEventListener("change", renderSongModeFields);
    songBuilderForm.addEventListener("input", resetSongPreview);
    songBuilderForm.addEventListener("change", resetSongPreview);
    previewSongButton.addEventListener("click", previewSongSubmission);
    confirmSongButton.addEventListener("click", confirmSongSubmission);
    editSongButton.addEventListener("click", () => {
      songPreviewPanel.hidden = true;
      songPreviewFeedback.textContent = "";
    });
    setupSongBuilderMode();
  }

  if (songManagementList) {
    songTitleSearch?.addEventListener("input", renderSongManagementList);
    renderSongManagementList();
  }
  setupSelectComboFields();
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
      const song = document.createElement("span");
      song.className = "progress-song";
      const title = document.createElement("strong");
      title.textContent = row.songTitle;
      const artist = document.createElement("small");
      artist.textContent = row.artist;
      song.append(title, artist);
      const gameType = document.createElement("span");
      gameType.textContent = row.gameType;
      const score = document.createElement("span");
      score.className = `score-pill ${getScoreClass(row.lastScore)}`;
      score.textContent = row.lastScore === null ? "Sem nota" : `${row.lastScore}%`;
      const attempts = document.createElement("span");
      attempts.textContent = `Tentativas: ${row.attemptCount}`;
      item.append(song, gameType, score, attempts);
      list.append(item);
    });
  progressResults.append(list);
}

function renderSongManagementList() {
  if (!songManagementList) return;
  songManagementList.innerHTML = "";

  const query = normalize(songTitleSearch?.value || "");
  const songs = state.songs.filter((song) => !query || normalize(song.songTitle).includes(query));

  if (!songs.length) {
    songManagementList.innerHTML = `<p class="empty-state">Nenhuma música cadastrada.</p>`;
    return;
  }

  songs
    .slice()
    .sort((a, b) => a.songTitle.localeCompare(b.songTitle, "pt-BR"))
    .forEach((song) => {
      const item = document.createElement("article");
      item.className = "song-management-row";
      const image = document.createElement("img");
      image.src = getSafeImageSrc(song.thumbnail);
      image.alt = `Miniatura de ${song.songTitle}`;
      const details = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = song.songTitle;
      const meta = document.createElement("small");
      meta.textContent = `${song.artist} / ${song.course} / ${song.gameType}`;
      const topic = document.createElement("small");
      topic.textContent = song.topic;
      details.append(title, meta, topic);
      const actions = document.createElement("span");
      actions.className = "song-management-actions";
      const editLink = document.createElement("a");
      editLink.className = "secondary-action";
      editLink.href = `admin-song-add.html?edit=${encodeURIComponent(song.id)}`;
      editLink.textContent = "Editar";
      const deleteButton = document.createElement("button");
      deleteButton.className = "danger-action";
      deleteButton.type = "button";
      deleteButton.dataset.deleteSong = song.id;
      deleteButton.textContent = "Excluir";
      actions.append(editLink, deleteButton);
      item.append(image, details, actions);
      songManagementList.append(item);
    });

  songManagementList.querySelectorAll("[data-delete-song]").forEach((button) => {
    button.addEventListener("click", () => deleteSong(button.dataset.deleteSong));
  });
}

async function deleteSong(songId) {
  const song = state.songs.find((candidate) => candidate.id === songId);
  if (!song) return;
  const confirmed = window.confirm(`Excluir "${song.songTitle}" do catálogo? Esta ação não pode ser desfeita.`);
  if (!confirmed) return;

  songManagementFeedback.textContent = "Excluindo música...";
  try {
    await window.backend.deleteAdminSong(songId);
    state.songs = state.songs.filter((candidate) => candidate.id !== songId);
    renderSongManagementList();
    songManagementFeedback.textContent = "Música excluída do catálogo.";
  } catch (error) {
    songManagementFeedback.textContent = error.message;
  }
}

function renderSongModeFields() {
  const mode = songGameMode.value;
  resetSongBuilderState();
  resetSongPreview();
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

function setupSongBuilderMode() {
  if (state.editingSongId) {
    const song = state.songs.find((candidate) => candidate.id === state.editingSongId);
    if (!song) {
      songBuilderFeedback.textContent = "Música não encontrada para edição.";
      return;
    }
    if (songBuilderPageTitle) songBuilderPageTitle.textContent = "Editar música.";
    if (songBuilderPanelTitle) songBuilderPanelTitle.textContent = "Editar música";
    confirmSongButton.textContent = "Confirmar edição";
    populateSongBuilder(song);
    return;
  }
  renderSongModeFields();
}

function populateSongBuilder(song) {
  songGameMode.value = song.gameKind;
  renderSongModeFields();

  document.querySelector("#songTitle").value = song.songTitle || "";
  document.querySelector("#songAuthor").value = song.artist || "";
  document.querySelector("#songCourse").value = song.course || "";
  document.querySelector("#songTopic").value = song.topic || "";
  document.querySelector("#youtubeWatchLink").value = song.youtubeWatchUrl || "";
  document.querySelector("#songInstructionTitle").value = song.instructionTitle || "";
  document.querySelector("#songInstructionText").value = song.instructionText || "";
  state.thumbnailPreviewUrl = song.thumbnail || "assets/thumb-default.svg";
  document.querySelector("#songThumbnailPreview").src = getSafeImageSrc(state.thumbnailPreviewUrl);
  document.querySelector("#songThumbnailFeedback").textContent =
    song.thumbnail && song.thumbnail !== "assets/thumb-default.svg"
      ? "Miniatura atual cadastrada."
      : "Sem imagem enviada. A miniatura usará o fundo preto padrão.";

  if (song.gameKind === "lyric-order") {
    const countInput = document.querySelector("#lyricBlockCount");
    const fields = document.querySelector("#lyricBlockFields");
    const feedback = document.querySelector("#lyricBlockFeedback");
    countInput.value = song.lyricChunks?.length || 1;
    renderLyricOrderBlocks(countInput, fields, feedback);
    [...fields.querySelectorAll("textarea")].forEach((textarea, index) => {
      textarea.value = song.lyricChunks[index] || "";
    });
  }

  if (song.gameKind === "complete-lyrics") {
    state.completeLyricsTokens = parseBracketedLyricsToTokens(song.clozeLyrics || "");
    state.completeLyricsConfirmed = state.completeLyricsTokens.some((token) => token.type === "word" && token.selected);
    document.querySelector("#completeLyricsText").value = tokensToPlainLyrics(state.completeLyricsTokens);
    document.querySelector("#submitCompleteLyricsBlanks").disabled = false;
    document.querySelector("#completeLyricsFeedback").textContent = "Lacunas carregadas para edição.";
    renderAdminCompleteLyrics();
  }

  if (song.gameKind === "word-select") {
    state.wordSelectTokens = parseBracketedLyricsToTokens(song.selectableLyrics || "");
    state.wordSelectConfirmed = state.wordSelectTokens.some((token) => token.type === "word" && token.selected);
    document.querySelector("#wordSelectLyrics").value = tokensToPlainLyrics(state.wordSelectTokens);
    document.querySelector("#submitWordSelectionTargets").disabled = false;
    document.querySelector("#wordSelectFeedback").textContent = "Seleção carregada para edição.";
    renderAdminSelectableLyrics();
  }
}

function parseBracketedLyricsToTokens(text) {
  const tokens = [];
  const pattern = /\[([^\]]+)\]/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) tokens.push({ type: "text", value: text.slice(cursor, match.index) });
    tokens.push({
      type: "word",
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      value: match[1],
      selected: true
    });
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) tokens.push({ type: "text", value: text.slice(cursor) });
  return tokens;
}

function tokensToPlainLyrics(tokens) {
  return tokens.map((token) => token.value).join("");
}

function setupCompleteLyricsBuilder() {
  const lyricsInput = document.querySelector("#completeLyricsText");
  const stageButton = document.querySelector("#stageCompleteLyrics");
  const submitButton = document.querySelector("#submitCompleteLyricsBlanks");
  const feedback = document.querySelector("#completeLyricsFeedback");
  if (!lyricsInput || !stageButton || !submitButton || !feedback) return;

  state.completeLyricsTokens = [];
  state.completeLyricsConfirmed = false;
  lyricsInput.addEventListener("input", () => {
    state.completeLyricsTokens = [];
    state.completeLyricsConfirmed = false;
    submitButton.disabled = true;
    document.querySelector("#completeLyricsPreview").hidden = true;
  });
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
  state.completeLyricsConfirmed = false;
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
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = token.value;
      input.disabled = true;
      input.setAttribute("aria-label", `Lacuna para ${token.value}`);
      const result = document.createElement("span");
      result.className = "blank-result";
      result.setAttribute("aria-label", "Remover lacuna");
      result.textContent = "x";
      wrapper.append(input, result);
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
  state.completeLyricsConfirmed = false;
  renderAdminCompleteLyrics();
}

function submitCompleteLyricsBlanks(feedback) {
  const blankCount = state.completeLyricsTokens.filter((token) => token.type === "word" && token.selected).length;
  if (!blankCount) {
    feedback.textContent = "Selecione pelo menos uma palavra para virar lacuna.";
    return;
  }
  state.completeLyricsConfirmed = true;
  feedback.textContent = `${blankCount} ${blankCount === 1 ? "lacuna selecionada" : "lacunas selecionadas"} para o jogo.`;
}

function setupWordSelectBuilder() {
  const lyricsInput = document.querySelector("#wordSelectLyrics");
  const stageButton = document.querySelector("#stageWordSelectLyrics");
  const submitButton = document.querySelector("#submitWordSelectionTargets");
  const feedback = document.querySelector("#wordSelectFeedback");
  if (!lyricsInput || !stageButton || !submitButton || !feedback) return;

  state.wordSelectTokens = [];
  state.wordSelectConfirmed = false;
  lyricsInput.addEventListener("input", () => {
    state.wordSelectTokens = [];
    state.wordSelectConfirmed = false;
    submitButton.disabled = true;
    document.querySelector("#wordSelectPreview").hidden = true;
  });
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
  state.wordSelectConfirmed = false;
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
  state.wordSelectConfirmed = false;
  renderAdminSelectableLyrics();
}

function submitWordSelectionTargets(feedback) {
  const selectedCount = state.wordSelectTokens.filter((token) => token.type === "word" && token.selected).length;
  if (!selectedCount) {
    feedback.textContent = "Selecione pelo menos uma palavra antes de enviar.";
    return;
  }
  state.wordSelectConfirmed = true;
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
      state.thumbnailPreviewUrl = "assets/thumb-default.svg";
      state.thumbnailLoading = false;
      preview.src = state.thumbnailPreviewUrl;
      feedback.textContent = "Sem imagem enviada. A miniatura usará o fundo preto padrão.";
      return;
    }

    state.thumbnailLoading = true;
    feedback.textContent = `Carregando arquivo: ${file.name}`;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      state.thumbnailPreviewUrl = reader.result;
      preview.src = state.thumbnailPreviewUrl;
      state.thumbnailLoading = false;
      feedback.textContent = `Arquivo selecionado: ${file.name}`;
    });
    reader.addEventListener("error", () => {
      state.thumbnailPreviewUrl = "assets/thumb-default.svg";
      preview.src = state.thumbnailPreviewUrl;
      state.thumbnailLoading = false;
      feedback.textContent = "Não foi possível carregar a imagem. A miniatura usará o fundo preto padrão.";
    });
    reader.readAsDataURL(file);
  });
}

function resetSongBuilderState() {
  state.wordSelectTokens = [];
  state.wordSelectConfirmed = false;
  state.completeLyricsTokens = [];
  state.completeLyricsConfirmed = false;
  state.thumbnailPreviewUrl = "assets/thumb-default.svg";
  state.thumbnailLoading = false;
  state.pendingSong = null;
}

function resetSongPreview() {
  state.pendingSong = null;
  if (songPreviewPanel) songPreviewPanel.hidden = true;
  if (songPreviewFeedback) songPreviewFeedback.textContent = "";
  if (songBuilderFeedback) songBuilderFeedback.textContent = "";
}

function previewSongSubmission() {
  const song = buildSongFromForm();
  if (!song) return;

  state.pendingSong = song;
  renderSongPreview(song);
  songPreviewPanel.hidden = false;
  songPreviewFeedback.textContent = "Confira a miniatura e a atividade antes de confirmar.";
  songPreviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function confirmSongSubmission() {
  if (!state.pendingSong) {
    songPreviewFeedback.textContent = "Gere a prévia antes de confirmar o envio.";
    return;
  }

  confirmSongButton.disabled = true;
  songPreviewFeedback.textContent = state.editingSongId ? "Atualizando música..." : "Registrando música...";
  try {
    const { song } = state.editingSongId
      ? await window.backend.updateAdminSong(state.pendingSong)
      : await window.backend.saveAdminSong(state.pendingSong);
    state.songs = [...state.songs.filter((candidate) => candidate.id !== song.id), song];
    state.topicOptions = getTopicOptions();
    songPreviewFeedback.textContent = state.editingSongId
      ? "Música atualizada com todos os campos necessários."
      : "Música registrada com todos os campos necessários.";
  } catch (error) {
    confirmSongButton.disabled = false;
    songPreviewFeedback.textContent = error.message;
  }
}

function buildSongFromForm() {
  songBuilderFeedback.textContent = "";
  const youtubeInput = document.querySelector("#youtubeWatchLink");
  const youtubeFeedback = document.querySelector("#youtubeWatchFeedback");
  if (youtubeInput && youtubeFeedback) normalizeYoutubeWatchLink(youtubeInput, youtubeFeedback);
  if (state.thumbnailLoading) {
    songBuilderFeedback.textContent = "Aguarde a imagem da miniatura carregar antes de gerar a prévia.";
    return null;
  }

  if (!songBuilderForm.reportValidity()) {
    songBuilderFeedback.textContent = "Complete todos os campos obrigatórios antes de gerar a prévia.";
    return null;
  }

  const gameKind = songGameMode.value;
  const meta = modeMeta[gameKind];
  if (!meta) {
    songBuilderFeedback.textContent = "Selecione um modo de jogo.";
    return null;
  }

  const title = document.querySelector("#songTitle").value.trim();
  const songId = state.editingSongId || createSongId(title, gameKind);
  const song = {
    id: songId,
    songTitle: title,
    artist: document.querySelector("#songAuthor").value.trim(),
    course: document.querySelector("#songCourse").value,
    topic: document.querySelector("#songTopic").value.trim(),
    gameType: meta.gameType,
    gameKind,
    highlighted: true,
    thumbnail: getThumbnailPath(),
    gameUrl: `${gameKind}.html?song=${songId}`,
    youtubeWatchUrl: youtubeInput.value.trim(),
    description: meta.description,
    instructionTitle: document.querySelector("#songInstructionTitle").value.trim(),
    instructionText: document.querySelector("#songInstructionText").value.trim()
  };

  const modeFields = buildModeSpecificFields(gameKind);
  if (!modeFields) return null;
  return { ...song, ...modeFields };
}

function buildModeSpecificFields(gameKind) {
  if (gameKind === "lyric-order") return buildLyricOrderFields();
  if (gameKind === "complete-lyrics") return buildCompleteLyricsFields();
  if (gameKind === "word-select") return buildWordSelectFields();
  return null;
}

function buildLyricOrderFields() {
  const countInput = document.querySelector("#lyricBlockCount");
  const feedback = document.querySelector("#lyricBlockFeedback");
  const blockCount = Number(countInput?.value);
  if (!Number.isInteger(blockCount) || blockCount < 1) {
    songBuilderFeedback.textContent = "Informe um número inteiro positivo para a quantidade de blocos.";
    countInput?.focus();
    return null;
  }

  const chunks = [...document.querySelectorAll("#lyricBlockFields textarea")].map((field) => field.value.trim());
  if (chunks.length !== blockCount || chunks.some((chunk) => !chunk)) {
    songBuilderFeedback.textContent = "Preencha todos os blocos da letra antes de gerar a prévia.";
    feedback.textContent = "Todos os blocos precisam estar preenchidos.";
    return null;
  }

  return { lyricChunks: chunks };
}

function buildCompleteLyricsFields() {
  const selectedCount = state.completeLyricsTokens.filter((token) => token.type === "word" && token.selected).length;
  if (!state.completeLyricsTokens.length) {
    songBuilderFeedback.textContent = "Prepare a letra antes de gerar a prévia.";
    document.querySelector("#completeLyricsText")?.focus();
    return null;
  }
  if (!selectedCount) {
    songBuilderFeedback.textContent = "Selecione pelo menos uma palavra para virar lacuna.";
    return null;
  }
  if (!state.completeLyricsConfirmed) {
    songBuilderFeedback.textContent = "Envie as lacunas selecionadas antes de gerar a prévia.";
    return null;
  }

  const usesGlobalHints = document.querySelector("#completeUsesGlobalHints")?.checked;
  const globalHints = document.querySelector("#completeGlobalHints")?.value.trim() || "";
  if (usesGlobalHints && !globalHints) {
    songBuilderFeedback.textContent = "Preencha as dicas globais antes de gerar a prévia.";
    document.querySelector("#completeGlobalHints")?.focus();
    return null;
  }

  const clozeLyrics = tokensToSeedLyrics(state.completeLyricsTokens);
  return { clozeLyrics: usesGlobalHints ? `${globalHints}\n\n${clozeLyrics}` : clozeLyrics };
}

function buildWordSelectFields() {
  const selectedCount = state.wordSelectTokens.filter((token) => token.type === "word" && token.selected).length;
  if (!state.wordSelectTokens.length) {
    songBuilderFeedback.textContent = "Prepare a letra antes de gerar a prévia.";
    document.querySelector("#wordSelectLyrics")?.focus();
    return null;
  }
  if (!selectedCount) {
    songBuilderFeedback.textContent = "Selecione pelo menos uma palavra para a atividade.";
    return null;
  }
  if (!state.wordSelectConfirmed) {
    songBuilderFeedback.textContent = "Envie a seleção de palavras antes de gerar a prévia.";
    return null;
  }

  return { selectableLyrics: tokensToSeedLyrics(state.wordSelectTokens) };
}

function tokensToSeedLyrics(tokens) {
  return tokens.map((token) => (token.type === "word" && token.selected ? `[${token.value}]` : token.value)).join("");
}

function getThumbnailPath() {
  const input = document.querySelector("#songThumbnail");
  const [file] = input?.files || [];
  if (!file) return state.thumbnailPreviewUrl || "assets/thumb-default.svg";
  return state.thumbnailPreviewUrl;
}

function createSongId(title, gameKind) {
  const base = `${slugify(title)}-${modeMeta[gameKind].idSuffix}`;
  let suffix = 1;
  let candidate = `${base}-${suffix}`;
  const existingIds = new Set(state.songs.map((song) => song.id));
  while (existingIds.has(candidate) && state.pendingSong?.id !== candidate) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "musica";
}

function renderSongPreview(song) {
  confirmSongButton.disabled = false;
  document.querySelector("#previewThumbnail").src = getSafeImageSrc(state.thumbnailPreviewUrl);
  document.querySelector("#previewCardTitle").textContent = song.songTitle;
  document.querySelector("#previewCardMeta").textContent = `${song.course} / ${song.gameType}`;
  document.querySelector("#previewCardTopic").textContent = `${song.artist} - ${song.topic}`;
  document.querySelector("#previewGameCourse").textContent = `${song.course} / ${song.gameType}`;
  document.querySelector("#previewGameTitle").textContent = song.songTitle;
  document.querySelector("#previewGameArtist").textContent = song.artist;
  document.querySelector("#previewInstructionTitle").textContent = song.instructionTitle;
  document.querySelector("#previewInstructionText").textContent = song.instructionText;

  const body = document.querySelector("#previewGameBody");
  body.innerHTML = "";
  if (song.gameKind === "lyric-order") renderLyricOrderPreview(body, song);
  if (song.gameKind === "complete-lyrics") renderCompleteLyricsPreview(body, song);
  if (song.gameKind === "word-select") renderWordSelectPreview(body, song);
  renderSeedObjectPreview(body, song);
}

function renderLyricOrderPreview(container, song) {
  const section = document.createElement("section");
  section.className = "song-preview-mode";
  const title = document.createElement("h4");
  title.textContent = "Blocos em ordem correta";
  const list = document.createElement("ol");
  list.className = "preview-lyric-blocks";
  song.lyricChunks.forEach((chunk) => {
    const item = document.createElement("li");
    item.textContent = chunk;
    list.append(item);
  });
  section.append(title, list);
  container.append(section);
}

function renderCompleteLyricsPreview(container, song) {
  const section = document.createElement("section");
  section.className = "song-preview-mode";
  const title = document.createElement("h4");
  title.textContent = "Prévia das lacunas";
  const lyrics = document.createElement("div");
  lyrics.className = "cloze-lyrics admin-cloze-preview";
  renderBracketedLyrics(lyrics, song.clozeLyrics, "complete");
  section.append(title, lyrics);
  container.append(section);
}

function renderWordSelectPreview(container, song) {
  const section = document.createElement("section");
  section.className = "song-preview-mode";
  const title = document.createElement("h4");
  title.textContent = "Prévia das palavras selecionadas";
  const lyrics = document.createElement("div");
  lyrics.className = "selectable-lyrics admin-selectable-preview";
  renderBracketedLyrics(lyrics, song.selectableLyrics, "select");
  section.append(title, lyrics);
  container.append(section);
}

function renderBracketedLyrics(container, text, mode) {
  const pattern = /\[([^\]]+)\]/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) container.append(document.createTextNode(text.slice(cursor, match.index)));
    if (mode === "complete") {
      const blank = document.createElement("span");
      blank.className = "cloze-blank admin-cloze-blank";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = match[1];
      input.disabled = true;
      const result = document.createElement("span");
      result.className = "blank-result";
      result.textContent = "x";
      blank.append(input, result);
      container.append(blank);
    } else {
      const word = document.createElement("button");
      word.type = "button";
      word.className = "selectable-word is-selected";
      word.disabled = true;
      word.textContent = match[1];
      container.append(word);
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function renderSeedObjectPreview(container, song) {
  const details = document.createElement("details");
  details.className = "seed-preview";
  const summary = document.createElement("summary");
  summary.textContent = "Objeto que será registrado";
  const code = document.createElement("pre");
  code.textContent = JSON.stringify(song, null, 2);
  details.append(summary, code);
  container.append(details);
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

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getSafeImageSrc(src) {
  const value = String(src || "");
  if (/^assets\/[A-Za-z0-9_./-]+\.(svg|png|jpe?g|gif|webp)$/.test(value) && !value.includes("..")) return value;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  return "assets/thumb-default.svg";
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
  renderAuth();
  await hydrateSongs();
  setupForms();
  await hydrateUser();
  renderAccess();
}

initAdminPage().catch((error) => {
  console.warn(error);
  renderAccess();
});
