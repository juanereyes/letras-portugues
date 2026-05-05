const filters = {
  course: document.querySelector("#courseFilter"),
  topic: document.querySelector("#topicFilter"),
  gameType: document.querySelector("#gameTypeFilter")
};

const gameGroups = document.querySelector("#gameGroups");
const resultCount = document.querySelector("#resultCount");
const browserTitle = document.querySelector("#browserTitle");
const loginButton = document.querySelector("#loginButton");
const loginLabel = document.querySelector("#loginLabel");
const progressStoreKey = "ptMusicProgress";
const userStoreKey = "ptMusicUser";
const songGames = [];
const courseOrder = ["Português I", "Português II", "Português III", "Português IV"];
const featuredGames = [];
let featuredIndex = 0;

const state = {
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

function uniqueValues(key, preferredOrder = []) {
  const values = [...new Set(songGames.map((game) => game[key]))];
  return values.sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    return a.localeCompare(b);
  });
}

function fillSelect(select, label, values) {
  select.innerHTML = "";
  select.append(new Option(`Todos: ${label}`, "all"));
  values.forEach((value) => select.append(new Option(value, value)));
}

function setupFilters() {
  fillSelect(filters.course, "cursos", uniqueValues("course", courseOrder));
  fillSelect(filters.topic, "temas", uniqueValues("topic"));
  fillSelect(filters.gameType, "tipos de jogo", uniqueValues("gameType"));

  Object.values(filters).forEach((select) => {
    select.addEventListener("change", renderGames);
  });
}

function getFilteredGames() {
  return songGames.filter((game) => {
    return Object.entries(filters).every(([key, select]) => select.value === "all" || game[key] === select.value);
  });
}

function groupGames(games) {
  return games.reduce((groups, game) => {
    const key = game.gameKind;
    groups[key] ||= {
      heading: game.gameType,
      gameTypes: new Set(),
      games: []
    };
    groups[key].gameTypes.add(game.gameType);
    groups[key].games.push(game);
    return groups;
  }, {});
}

function renderGames() {
  const games = getFilteredGames();
  const groups = groupGames(games);
  const activeCourse = filters.course.value === "all" ? "Todos os jogos" : filters.course.value;
  browserTitle.textContent = activeCourse;
  resultCount.textContent = `${games.length} ${games.length === 1 ? "jogo" : "jogos"}`;
  gameGroups.innerHTML = "";

  if (!games.length) {
    gameGroups.innerHTML = `<p class="empty-state">Ainda não há jogos com esses filtros.</p>`;
    return;
  }

  Object.values(groups).forEach((group) => {
    const gameTypes = [...group.gameTypes].sort((a, b) => a.localeCompare(b));
    const section = document.createElement("section");
    section.className = "game-group";
    section.innerHTML = `
      <div class="group-header">
        <h3>${gameTypes[0] || group.heading}</h3>
      </div>
      <div class="card-grid"></div>
    `;

    const grid = section.querySelector(".card-grid");
    getSortedGames(group.games).forEach((game) => grid.append(createGameCard(game)));
    gameGroups.append(section);
  });
}

function getSortedGames(games) {
  return [...games].sort((a, b) => {
    const courseCompare = getCourseRank(a.course) - getCourseRank(b.course);
    if (courseCompare !== 0) return courseCompare;
    return a.songTitle.localeCompare(b.songTitle, "pt-BR");
  });
}

function getCourseRank(course) {
  const index = courseOrder.indexOf(course);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function createGameCard(game) {
  const record = state.progress.completed?.[game.id] || null;
  const score = record?.lastScore ?? record?.score ?? null;
  const card = document.createElement("a");
  card.className = "game-card";
  card.href = game.gameUrl || "#";

  if (!game.gameUrl) {
    card.setAttribute("aria-disabled", "true");
    card.addEventListener("click", (event) => event.preventDefault());
  }

  card.innerHTML = `
    <span class="thumb-wrap">
      <img src="${game.thumbnail}" alt="Miniatura de ${game.songTitle}" />
      ${score === null ? "" : `<span class="thumbnail-score ${getScoreClass(score)}">${score}%</span>`}
    </span>
    <span class="card-body">
      <span class="card-meta">${game.course} / ${game.topic}</span>
      <strong>${game.songTitle}</strong>
      <span>${game.artist}</span>
    </span>
  `;
  return card;
}

function getScoreClass(score) {
  if (score >= 90) return "score-high";
  if (score >= 60) return "score-mid";
  return "score-low";
}

function setupCarousel() {
  featuredGames.splice(0, featuredGames.length, ...getRandomFeaturedGames(4));
  const dots = document.querySelector("#featureDots");
  dots.innerHTML = "";

  if (!featuredGames.length) return;

  featuredGames.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Mostrar música em destaque ${index + 1}`);
    dot.addEventListener("click", () => {
      featuredIndex = index;
      renderFeatured();
    });
    dots.append(dot);
  });

  document.querySelector("#previousFeature").addEventListener("click", () => moveFeature(-1));
  document.querySelector("#nextFeature").addEventListener("click", () => moveFeature(1));

  setInterval(() => moveFeature(1), 6500);
  renderFeatured();
}

function moveFeature(direction) {
  if (!featuredGames.length) return;
  featuredIndex = (featuredIndex + direction + featuredGames.length) % featuredGames.length;
  renderFeatured();
}

function renderFeatured() {
  if (!featuredGames.length) return;

  const game = featuredGames[featuredIndex];
  const featuredLink = document.querySelector("#featuredLink");
  document.querySelector("#featuredImage").src = game.thumbnail;
  document.querySelector("#featuredImage").alt = `Arte de ${game.songTitle}`;
  document.querySelector("#featuredCourse").textContent = `${game.course} / ${game.gameType}`;
  document.querySelector("#featuredTitle").textContent = game.songTitle;
  document.querySelector("#featuredMeta").textContent = `${game.artist} - ${game.topic}`;
  featuredLink.href = game.gameUrl || "#";
  featuredLink.toggleAttribute("aria-disabled", !game.gameUrl);
  featuredLink.onclick = (event) => {
    if (!game.gameUrl) event.preventDefault();
  };

  [...document.querySelectorAll("#featureDots button")].forEach((dot, index) => {
    dot.classList.toggle("active", index === featuredIndex);
  });
}

function getRandomFeaturedGames(limit) {
  const highlighted = songGames.filter((game) => game.highlighted);
  const pool = highlighted.length ? highlighted : songGames;
  return shuffleItems(pool).slice(0, limit);
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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

function renderProgress() {
  if (!document.querySelector("#completedCount")) return;
  const completions = Object.values(state.progress.completed);
  const scores = completions.map((item) => item.score);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  document.querySelector("#completedCount").textContent = completions.length;
  document.querySelector("#averageScore").textContent = `${average}%`;
  document.querySelector("#streakCount").textContent = state.progress.streak || 0;
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
  renderAuthLabel(state.user, loginLabel, loginButton);
}

function setupAuth() {
  loginButton.addEventListener("click", () => {
    handleAuthClick(state, () => {
      renderAuth();
      renderProgress();
      renderGames();
    });
  });
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
    renderProgress();
    renderGames();
  } catch (error) {
    console.warn(error);
  }
}

async function initApp() {
  await hydrateSongs();
  setupFilters();
  setupCarousel();
  setupAuth();
  renderAuth();
  renderProgress();
  renderGames();
  hydrateAuth();
}

initApp();
