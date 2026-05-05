const progressStoreKey = "ptMusicProgress";
const userStoreKey = "ptMusicUser";
const params = new URLSearchParams(window.location.search);
const songId = params.get("song");
const songGames = [];
let game = null;

const state = {
  tokens: [],
  hasOpenedSong: false,
  submitted: false,
  showingAnswers: false,
  progress: loadProgress(),
  user: loadUser()
};

async function hydrateSongs() {
  if (!window.backend) return;
  try {
    const { songs } = await window.backend.getSongs();
    if (Array.isArray(songs) && songs.length) {
      songGames.splice(0, songGames.length, ...songs);
    }
  } catch (error) {
    console.warn(error);
  }
}

function loadGame() {
  game = songGames.find((item) => item.id === songId && item.gameKind === "word-select");

  if (!game) {
    document.querySelector("#gamePage").innerHTML = `
      <section class="game-shell">
        <p class="eyebrow">Jogo não encontrado</p>
        <h1>Jogo de selecionar palavras não encontrado.</h1>
        <p class="game-subtitle">Volte à lista de músicas e escolha um jogo de selecionar palavras.</p>
        <a class="play-link" href="index.html#songs">Voltar para músicas</a>
      </section>
    `;
    throw new Error(`Jogo de selecionar palavras desconhecido: ${songId}`);
  }

  document.title = `${game.songTitle} | Português com Música`;
  document.querySelector("#gameCourse").textContent = `${game.course} / ${game.gameType}`;
  document.querySelector("#wordSelectTitle").textContent = game.songTitle;
  document.querySelector("#gameArtist").textContent = game.artist;
  document.querySelector("#watchSongButton").href = game.youtubeWatchUrl || "#";
  applyInstructions();
  state.tokens = parseSelectableLyrics(game.selectableLyrics || "");
}

function applyInstructions() {
  const title = game.instructionTitle || "Selecione as palavras pedidas.";
  const text = game.instructionText || "Primeiro, abra o link da música no YouTube. Depois, clique nas palavras que pertencem à categoria indicada. Clique de novo para desmarcar uma palavra. Envie sua seleção para ver a correção.";
  document.querySelector("#instructionTitle").textContent = title;
  document.querySelector("#instructionText").textContent = text;
  document.querySelector("#inlineInstructionTitle").textContent = title;
  document.querySelector("#inlineInstructionText").textContent = text;
}

function parseSelectableLyrics(text) {
  const tokens = [];
  const targetPattern = /\[([^\]]+)\]/g;
  let cursor = 0;
  let match;

  while ((match = targetPattern.exec(text)) !== null) {
    appendPlainTextTokens(tokens, text.slice(cursor, match.index));
    tokens.push(createWordToken(match[1], true));
    cursor = targetPattern.lastIndex;
  }

  appendPlainTextTokens(tokens, text.slice(cursor));
  return tokens;
}

function appendPlainTextTokens(tokens, text) {
  const wordPattern = /[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*/gu;
  let cursor = 0;
  let match;

  while ((match = wordPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, match.index) });
    }
    tokens.push(createWordToken(match[0], false));
    cursor = wordPattern.lastIndex;
  }

  if (cursor < text.length) tokens.push({ type: "text", value: text.slice(cursor) });
}

function createWordToken(value, isTarget) {
  return {
    type: "word",
    id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    value,
    isTarget,
    selected: false
  };
}

function renderSelectableLyrics() {
  const container = document.querySelector("#selectableLyrics");
  container.innerHTML = "";
  container.classList.toggle("is-disabled", !state.hasOpenedSong || state.submitted);

  state.tokens.forEach((token) => {
    if (token.type === "text") {
      container.append(document.createTextNode(token.value));
      return;
    }

    const word = document.createElement("button");
    word.type = "button";
    word.className = "selectable-word";
    word.textContent = token.value;
    word.dataset.tokenId = token.id;
    word.disabled = !state.hasOpenedSong || state.submitted;
    word.setAttribute("aria-pressed", String(token.selected));

    if (token.selected) word.classList.add("is-selected");
    if (state.submitted && token.selected && token.isTarget) word.classList.add("is-correct");
    if (state.submitted && token.selected && !token.isTarget) word.classList.add("is-wrong");
    if (state.showingAnswers && token.isTarget && !token.selected) word.classList.add("is-missed");

    word.addEventListener("click", () => toggleWord(token.id));
    container.append(word);
  });
}

function toggleWord(tokenId) {
  if (!state.hasOpenedSong || state.submitted) return;
  const token = state.tokens.find((item) => item.id === tokenId);
  if (!token || token.type !== "word") return;
  token.selected = !token.selected;
  renderSelectableLyrics();
}

function enableSelection() {
  if (state.hasOpenedSong) return;
  state.hasOpenedSong = true;
  document.querySelector("#listenStatus").textContent = "Música aberta. Selecione as palavras.";
  document.querySelector("#submitWordSelection").disabled = false;
  renderSelectableLyrics();
}

function submitSelection() {
  if (!state.hasOpenedSong || state.submitted) return;
  state.submitted = true;

  const wordTokens = state.tokens.filter((token) => token.type === "word");
  const selectedWords = wordTokens.filter((token) => token.selected);
  const targetWords = wordTokens.filter((token) => token.isTarget);
  const correctWords = selectedWords.filter((token) => token.isTarget);
  const denominator = Math.max(selectedWords.length, targetWords.length);
  const score = denominator ? Math.round((correctWords.length / denominator) * 100) : 0;

  document.querySelector("#gameFeedback").textContent = `${correctWords.length} de ${denominator} pontos.`;
  document.querySelector("#submitWordSelection").disabled = true;
  document.querySelector("#showWordAnswers").hidden = false;

  saveAttempt(game.id, score, {
    correctCount: correctWords.length,
    selectedCount: selectedWords.length,
    targetCount: targetWords.length,
    denominator
  });
  renderSelectableLyrics();
}

function showAnswers() {
  state.showingAnswers = true;
  document.querySelector("#showWordAnswers").hidden = true;
  renderSelectableLyrics();
}

function closeInstructions() {
  document.querySelector("#instructionOverlay").hidden = true;
}

function loadProgress() {
  if (!localStorage.getItem(userStoreKey)) return { completed: {}, streak: 1 };
  const stored = localStorage.getItem(progressStoreKey);
  return stored ? JSON.parse(stored) : { completed: {}, streak: 1 };
}

function saveProgress() {
  if (!state.user) return;
  localStorage.setItem(progressStoreKey, JSON.stringify(state.progress));
}

function loadUser() {
  const stored = localStorage.getItem(userStoreKey);
  return stored ? JSON.parse(stored) : null;
}

function saveUser(user) {
  state.user = user;
  localStorage.setItem(userStoreKey, JSON.stringify(user));
  renderAuth();
}

function renderAuth() {
  const label = document.querySelector("#loginLabel");
  const button = document.querySelector("#loginButton");
  renderAuthLabel(state.user, label, button);
}

function setupAuth() {
  document.querySelector("#loginButton").addEventListener("click", () => handleAuthClick(state, renderAuth));
}

async function hydrateAuth() {
  if (!window.backend) return;
  try {
    const { user } = await window.backend.getMe();
    if (!user) return;
    saveUser(user);
    await hydrateProgress();
  } catch (error) {
    console.warn(error);
  }
}

async function hydrateProgress() {
  if (!window.backend || !state.user) return;
  try {
    state.progress = await window.backend.getProgress();
    saveProgress();
  } catch (error) {
    console.warn(error);
  }
}

async function saveAttempt(gameId, score, details = null) {
  if (!window.backend || !state.user) return;
  try {
    await window.backend.saveAttempt(gameId, score, details);
    await hydrateProgress();
  } catch (error) {
    console.warn(error);
  }
}

document.querySelector("#watchSongButton").addEventListener("click", enableSelection);
document.querySelector("#submitWordSelection").addEventListener("click", submitSelection);
document.querySelector("#showWordAnswers").addEventListener("click", showAnswers);
document.querySelector("#restartActivityButton").addEventListener("click", () => window.location.reload());
document.querySelector("#closeInstructions").addEventListener("click", closeInstructions);
document.querySelector("#instructionOverlay").addEventListener("click", (event) => {
  if (event.target.id === "instructionOverlay") closeInstructions();
});

async function initGame() {
  await hydrateSongs();
  loadGame();
  setupAuth();
  renderAuth();
  renderSelectableLyrics();
  hydrateAuth();
}

initGame();
