const filters = {
  search: document.querySelector("#progressSearch"),
  course: document.querySelector("#courseFilter"),
  topic: document.querySelector("#topicFilter"),
  gameType: document.querySelector("#gameTypeFilter")
};

const loginButton = document.querySelector("#loginButton");
const loginLabel = document.querySelector("#loginLabel");
const authRequired = document.querySelector("#authRequired");
const progressContent = document.querySelector("#progressContent");
const progressGroups = document.querySelector("#progressGroups");
const progressTitle = document.querySelector("#progressTitle");
const progressResultCount = document.querySelector("#progressResultCount");
const userStoreKey = "ptMusicUser";
const courseOrder = ["Português I", "Português II", "Português III", "Português IV"];
const songGames = [];

const state = {
  user: loadUser(),
  progress: { completed: {}, attempts: [] }
};

async function hydrateSongs() {
  if (!window.backend) return;
  const { songs } = await window.backend.getSongs();
  if (Array.isArray(songs)) {
    songGames.splice(0, songGames.length, ...songs);
  }
}

async function hydrateUser() {
  if (!window.backend) return null;
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

async function hydrateProgress() {
  state.progress = await window.backend.getProgress();
}

function setupFilters() {
  fillSelect(filters.course, "cursos", uniqueValues("course", courseOrder));
  fillSelect(filters.topic, "temas", uniqueValues("topic"));
  fillSelect(filters.gameType, "tipos de jogo", uniqueValues("gameType"));

  Object.values(filters).forEach((control) => {
    control.addEventListener("input", renderProgressRows);
    control.addEventListener("change", renderProgressRows);
  });
}

function uniqueValues(key, preferredOrder = []) {
  const values = [...new Set(songGames.map((game) => game[key]))];
  return values.sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a);
    const bIndex = preferredOrder.indexOf(b);
    if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    return a.localeCompare(b, "pt-BR");
  });
}

function fillSelect(select, label, values) {
  select.innerHTML = "";
  select.append(new Option(`Todos: ${label}`, "all"));
  values.forEach((value) => select.append(new Option(value, value)));
}

function getFilteredGames() {
  const query = normalize(filters.search.value);
  return songGames.filter((game) => {
    const matchesFilters = ["course", "topic", "gameType"].every((key) => {
      return filters[key].value === "all" || game[key] === filters[key].value;
    });
    const matchesSearch = !query || normalize(`${game.songTitle} ${game.artist}`).includes(query);
    return matchesFilters && matchesSearch;
  });
}

function normalize(value) {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function groupByCourse(games) {
  return games.reduce((groups, game) => {
    groups[game.course] ||= [];
    groups[game.course].push(game);
    return groups;
  }, {});
}

function getSortedGroups(groups) {
  return Object.entries(groups).sort(([courseA], [courseB]) => getCourseRank(courseA) - getCourseRank(courseB));
}

function getSortedGames(games) {
  return [...games].sort((a, b) => {
    const typeCompare = a.gameType.localeCompare(b.gameType, "pt-BR");
    if (typeCompare !== 0) return typeCompare;
    return a.songTitle.localeCompare(b.songTitle, "pt-BR");
  });
}

function getCourseRank(course) {
  const index = courseOrder.indexOf(course);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function renderProgressRows() {
  const games = getFilteredGames();
  const groups = groupByCourse(games);
  progressGroups.innerHTML = "";
  progressTitle.textContent = filters.course.value === "all" ? "Todos os cursos" : filters.course.value;
  progressResultCount.textContent = `${games.length} ${games.length === 1 ? "atividade" : "atividades"}`;

  if (!games.length) {
    progressGroups.innerHTML = `<p class="empty-state">Nenhuma atividade encontrada com esses filtros.</p>`;
    return;
  }

  getSortedGroups(groups).forEach(([course, courseGames]) => {
    const section = document.createElement("section");
    section.className = "progress-course-group";
    section.innerHTML = `
      <div class="group-header">
        <h3>${course}</h3>
        <p>${courseGames.length} ${courseGames.length === 1 ? "atividade" : "atividades"}</p>
      </div>
      <div class="progress-row-list"></div>
    `;

    const list = section.querySelector(".progress-row-list");
    getSortedGames(courseGames).forEach((game) => list.append(createProgressRow(game)));
    progressGroups.append(section);
  });
}

function createProgressRow(game) {
  const record = state.progress.completed?.[game.id] || null;
  const score = record?.lastScore ?? record?.score ?? null;
  const attempts = record?.attemptCount ?? 0;
  const attemptLabel = `${attempts === 1 ? "Tentativa" : "Tentativas"}: ${attempts}`;
  const row = document.createElement("a");
  row.className = "progress-row";
  row.href = game.gameUrl || "#";
  row.innerHTML = `
    <span class="progress-song">
      <strong>${game.songTitle}</strong>
      <small>${game.artist}</small>
    </span>
    <span>${game.topic}</span>
    <span>${game.gameType}</span>
    <span class="score-pill ${getScoreClass(score)}">${score === null ? "Sem tentativa" : `${score}%`}</span>
    <span>${attemptLabel}</span>
  `;
  return row;
}

function getScoreClass(score) {
  if (score === null || score === undefined) return "score-empty";
  if (score >= 90) return "score-high";
  if (score >= 60) return "score-mid";
  return "score-low";
}

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
      if (!state.user) {
        state.progress = { completed: {}, attempts: [] };
        progressGroups.innerHTML = "";
        showLoginPrompt();
      }
    });
  });
}

function showLoginPrompt() {
  const next = encodeURIComponent("progress.html");
  document.querySelector("#progressLoginLink").href = `login.html?next=${next}`;
  authRequired.hidden = false;
  progressContent.hidden = true;
}

function showProgress() {
  authRequired.hidden = true;
  progressContent.hidden = false;
}

async function initProgressPage() {
  setupAuth();
  renderAuth();
  await hydrateSongs();
  const user = await hydrateUser();
  if (!user) {
    showLoginPrompt();
    return;
  }
  await hydrateProgress();
  setupFilters();
  showProgress();
  renderProgressRows();
}

initProgressPage().catch((error) => {
  console.warn(error);
  showLoginPrompt();
});
