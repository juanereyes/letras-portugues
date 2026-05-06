const progressStoreKey = "ptMusicProgress";
const userStoreKey = "ptMusicUser";
const params = new URLSearchParams(window.location.search);
const songId = params.get("song");
const songGames = [];
let game = null;

const state = {
  order: [],
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
  game = songGames.find((item) => item.id === songId && item.gameKind === "lyric-order");

  if (!game) {
    document.querySelector("#gamePage").innerHTML = `
      <section class="game-shell">
        <p class="eyebrow">Jogo não encontrado</p>
        <h1>Jogo de ordenar a letra não encontrado.</h1>
        <p class="game-subtitle">Volte à lista de músicas e escolha um jogo de ordenar a letra.</p>
        <a class="play-link" href="index.html#songs">Voltar para músicas</a>
      </section>
    `;
    throw new Error(`Jogo de ordenar a letra desconhecido: ${songId}`);
  }

  state.order = shuffle(game.lyricChunks.map((text, index) => ({ text, correctIndex: index })));
  document.title = `${game.songTitle} | Português com Música`;
  document.querySelector("#gameCourse").textContent = `${game.course} / ${game.gameType}`;
  document.querySelector("#lyricGameTitle").textContent = game.songTitle;
  document.querySelector("#gameArtist").textContent = game.artist;
  document.querySelector("#lyricAudio").src = getSafeAudioSrc(game.audioSrc);
  document.querySelector("#playSongButton").textContent = game.audioSrc ? "Ouvir para revisar" : "Abrir YouTube";
  applyInstructions();
}

function applyInstructions() {
  if (game.instructionTitle) {
    document.querySelector("#instructionTitle").textContent = game.instructionTitle;
  }
  if (game.instructionText) {
    document.querySelector("#instructionText").textContent = game.instructionText;
  }
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function renderLyricChunks() {
  const list = document.querySelector("#lyricList");
  list.innerHTML = "";

  state.order.forEach((chunk, index) => {
    const item = document.createElement("li");
    item.className = "lyric-chunk";
    item.draggable = !state.submitted;
    item.dataset.correctIndex = chunk.correctIndex;
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.setAttribute("aria-hidden", "true");
    handle.textContent = "::";
    const position = document.createElement("span");
    position.className = "chunk-position";
    position.textContent = index + 1;
    const text = document.createElement("span");
    text.className = "chunk-text";
    appendMultilineText(text, chunk.text);
    const result = document.createElement("span");
    result.className = "chunk-result";
    result.setAttribute("aria-live", "polite");
    item.append(handle, position, text, result);

    if (state.submitted) {
      const correct = chunk.correctIndex === index;
      item.classList.add(correct ? "is-correct" : "is-wrong");
      item.querySelector(".chunk-result").textContent = correct ? "Correto" : `Deveria ser ${chunk.correctIndex + 1}`;
    }

    item.addEventListener("dragstart", handleDragStart);
    item.addEventListener("dragover", handleDragOver);
    item.addEventListener("drop", handleDrop);
    item.addEventListener("dragend", handleDragEnd);
    list.append(item);
  });
}

function appendMultilineText(container, value) {
  String(value || "")
    .split("\n")
    .forEach((line, index) => {
      if (index > 0) container.append(document.createElement("br"));
      container.append(document.createTextNode(line));
    });
}

function handleDragStart(event) {
  if (state.submitted) return;
  event.currentTarget.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", event.currentTarget.dataset.correctIndex);
}

function handleDragOver(event) {
  event.preventDefault();
  const dragging = document.querySelector(".lyric-chunk.is-dragging");
  const target = event.currentTarget;
  if (!dragging || dragging === target) return;

  const list = document.querySelector("#lyricList");
  const targetBox = target.getBoundingClientRect();
  const afterTarget = event.clientY > targetBox.top + targetBox.height / 2;
  list.insertBefore(dragging, afterTarget ? target.nextSibling : target);
}

function handleDrop(event) {
  event.preventDefault();
  syncLyricOrderFromDom();
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("is-dragging");
  syncLyricOrderFromDom();
  renderLyricChunks();
}

function syncLyricOrderFromDom() {
  const items = [...document.querySelectorAll("#lyricList .lyric-chunk")];
  state.order = items.map((item) => {
    return state.order.find((chunk) => String(chunk.correctIndex) === item.dataset.correctIndex);
  });
}

function playReview() {
  if (!state.submitted) return;
  const youtubeWatchUrl = getSafeYouTubeUrl(game.youtubeWatchUrl);
  if (youtubeWatchUrl !== "#" && !game.audioSrc) {
    window.open(youtubeWatchUrl, "_blank", "noopener");
    return;
  }
  playSong();
}

function playSong() {
  const audio = document.querySelector("#lyricAudio");
  if (!game.audioSrc) {
    showAudioNotice();
    return;
  }

  audio.currentTime = 0;
  audio.play().catch(showAudioNotice);
}

function showReviewPlayer() {
  if (getSafeYouTubeUrl(game.youtubeWatchUrl) !== "#" && !game.audioSrc) {
    showYouTubeReviewInstructions();
    return;
  }

  if (game.audioSrc) {
    document.querySelector("#audioNotice").hidden = false;
    document.querySelector("#audioNotice").textContent = "Pressione Ouvir para revisar para escutar a música.";
    return;
  }

  showAudioNotice();
}

function showYouTubeReviewInstructions() {
  document.querySelector("#reviewInstructions").hidden = false;
  document.querySelector("#audioNotice").hidden = true;
}

function showAudioNotice() {
  const notice = document.querySelector("#audioNotice");
  notice.hidden = false;
  notice.innerHTML = "Adicione <code>audioSrc</code> para reprodução controlada ou <code>youtubeWatchUrl</code> para um link de revisão no YouTube no banco de dados.";
}

function getSafeYouTubeUrl(url) {
  const value = String(url || "");
  return /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+$/.test(value) ? value : "#";
}

function getSafeAudioSrc(src) {
  const value = String(src || "");
  return /^assets\/[A-Za-z0-9_./-]+\.(mp3|ogg|wav)$/.test(value) && !value.includes("..") ? value : "";
}

function resetLyricOrder() {
  if (state.submitted) return;
  state.order = shuffle(game.lyricChunks.map((text, index) => ({ text, correctIndex: index })));
  document.querySelector("#gameFeedback").textContent = "";
  renderLyricChunks();
}

function submitLyricOrder() {
  if (state.submitted) return;
  state.submitted = true;
  syncLyricOrderFromDom();
  const correctCount = state.order.filter((chunk, index) => chunk.correctIndex === index).length;
  const total = state.order.length;
  const score = Math.round((correctCount / total) * 100);
  document.querySelector("#gameFeedback").textContent = `${correctCount} de ${total} pontos. Ouça agora para revisar ou recomece a atividade para tentar de novo.`;

  saveAttempt(game.id, score, { correctCount, total });
  renderLyricChunks();
  document.querySelector("#submitLyricOrder").hidden = true;
  document.querySelector("#resetLyricOrder").hidden = true;
  document.querySelector("#playSongButton").hidden = false;
  document.querySelector("#restartActivityButton").hidden = false;
  document.querySelector("#listenStatus").textContent = "Enviado. Abra o YouTube para revisar.";
  showReviewPlayer();
  document.querySelector(".listen-panel").scrollIntoView({ behavior: "smooth", block: "center" });
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

document.querySelector("#playSongButton").addEventListener("click", playReview);
document.querySelector("#submitLyricOrder").addEventListener("click", submitLyricOrder);
document.querySelector("#resetLyricOrder").addEventListener("click", resetLyricOrder);
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
  renderLyricChunks();
  hydrateAuth();
}

initGame();
