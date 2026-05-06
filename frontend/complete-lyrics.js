const progressStoreKey = "ptMusicProgress";
const userStoreKey = "ptMusicUser";
const params = new URLSearchParams(window.location.search);
const songId = params.get("song");
const songGames = [];
let game = null;

const state = {
  blanks: [],
  hasOpenedSong: false,
  submitted: false,
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
  game = songGames.find((item) => item.id === songId && item.gameKind === "complete-lyrics");

  if (!game) {
    document.querySelector("#gamePage").innerHTML = `
      <section class="game-shell">
        <p class="eyebrow">Jogo não encontrado</p>
        <h1>Jogo de completar a letra não encontrado.</h1>
        <p class="game-subtitle">Volte à lista de músicas e escolha um jogo de completar a letra.</p>
        <a class="play-link" href="index.html#songs">Voltar para músicas</a>
      </section>
    `;
    throw new Error(`Jogo de completar a letra desconhecido: ${songId}`);
  }

  document.title = `${game.songTitle} | Português com Música`;
  document.querySelector("#gameCourse").textContent = `${game.course} / ${game.gameType}`;
  document.querySelector("#completeGameTitle").textContent = game.songTitle;
  document.querySelector("#gameArtist").textContent = game.artist;
  document.querySelector("#watchSongButton").href = getSafeYouTubeUrl(game.youtubeWatchUrl);
  applyInstructions();
}

function getSafeYouTubeUrl(url) {
  const value = String(url || "");
  return /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+$/.test(value) ? value : "#";
}

function applyInstructions() {
  const title = game.instructionTitle || "Complete a letra.";
  const text = game.instructionText || "Primeiro, abra o link da música no YouTube. Os espaços serão liberados depois disso. Complete cada palavra que falta e verifique suas respostas. Verde significa resposta exata; amarelo significa que a palavra está certa, mas os acentos precisam de atenção; vermelho significa que vale revisar a letra de novo. Depois da correção, você pode mostrar as respostas exatas ou recomeçar sem revelá-las.";
  document.querySelector("#instructionTitle").textContent = title;
  document.querySelector("#instructionText").textContent = text;
}

function parseClozeLyrics(text) {
  const parts = [];
  const pattern = /\[([^\]]+)\]/g;
  let cursor = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, match.index) });
    }
    parts.push({ type: "blank", answer: match[1], index: state.blanks.length });
    state.blanks.push(match[1]);
    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });
  return parts;
}

function renderClozeLyrics() {
  const container = document.querySelector("#clozeLyrics");
  const parts = parseClozeLyrics(game.clozeLyrics);
  container.innerHTML = "";

  parts.forEach((part) => {
    if (part.type === "text") {
      container.append(document.createTextNode(part.value));
      return;
    }

    const wrapper = document.createElement("span");
    wrapper.className = "cloze-blank";
    wrapper.innerHTML = `
      <input
        id="blank-${part.index}"
        type="text"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        disabled
        aria-label="Palavra ${part.index + 1} que falta na letra" />
      <span class="blank-result" aria-live="polite"></span>
    `;
    container.append(wrapper);
  });
}

function enableBlanks() {
  if (state.hasOpenedSong) return;
  state.hasOpenedSong = true;
  document.querySelector("#listenStatus").textContent = "Música aberta. Complete os espaços.";
  document.querySelector("#submitCompleteLyrics").disabled = false;
  document.querySelectorAll(".cloze-blank input").forEach((input) => {
    input.disabled = false;
  });
  document.querySelector(".cloze-blank input")?.focus();
}

function normalizeCase(value) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function stripDiacritics(value) {
  return normalizeCase(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function gradeAnswer(value, answer) {
  const typed = normalizeCase(value);
  const expected = normalizeCase(answer);
  if (typed === expected) return { status: "correct", points: 1, label: "Correto" };
  if (typed && stripDiacritics(typed) === stripDiacritics(expected)) {
    return { status: "accent", points: 0.5, label: "Acento" };
  }
  return { status: "wrong", points: 0, label: "Revisar" };
}

function submitAnswers() {
  if (!state.hasOpenedSong || state.submitted) return;
  state.submitted = true;

  let points = 0;
  document.querySelectorAll(".cloze-blank").forEach((blank, index) => {
    const input = blank.querySelector("input");
    const result = gradeAnswer(input.value, state.blanks[index]);
    points += result.points;
    blank.classList.add(`is-${result.status}`);
    input.disabled = true;
    blank.querySelector(".blank-result").textContent = result.label;
  });

  const total = state.blanks.length;
  const score = Math.round((points / total) * 100);
  document.querySelector("#gameFeedback").textContent = `${points} de ${total} pontos.`;
  document.querySelector("#submitCompleteLyrics").disabled = true;
  document.querySelector("#showCompleteAnswers").hidden = false;

  saveAttempt(game.id, score, { points, total });
}

function showAnswers() {
  document.querySelectorAll(".cloze-blank").forEach((blank, index) => {
    const input = blank.querySelector("input");
    input.value = state.blanks[index];
  });
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

document.querySelector("#watchSongButton").addEventListener("click", enableBlanks);
document.querySelector("#submitCompleteLyrics").addEventListener("click", submitAnswers);
document.querySelector("#showCompleteAnswers").addEventListener("click", showAnswers);
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
  renderClozeLyrics();
  hydrateAuth();
}

initGame();
