let authMenu = null;

function renderAuthLabel(user, label, button) {
  label.textContent = user ? user.username : "Entrar";
  button.classList.toggle("signed-in", Boolean(user));
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", user ? "menu" : "false");
  renderAdminNav(user);
  if (!user) closeAuthMenu();
}

function renderAdminNav(user) {
  const nav = document.querySelector(".topnav");
  if (!nav) return;

  let adminLink = nav.querySelector("[data-admin-link]");
  if (user?.role !== "admin") {
    adminLink?.remove();
    return;
  }

  if (!adminLink) {
    adminLink = document.createElement("a");
    adminLink.dataset.adminLink = "true";
    adminLink.href = "admin.html";
    adminLink.textContent = "Professor";
    nav.append(adminLink);
  }
}

function getReturnUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

async function handleAuthClick(state, renderAuth) {
  if (state.user) {
    toggleAuthMenu(state, renderAuth);
    return;
  }

  window.location.href = `login.html?next=${encodeURIComponent(getReturnUrl())}`;
}

function toggleAuthMenu(state, renderAuth) {
  if (authMenu) {
    closeAuthMenu();
    return;
  }

  const button = document.querySelector("#loginButton");
  if (!button) return;

  const menu = document.createElement("div");
  menu.className = "auth-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button class="auth-menu-item" type="button" role="menuitem">
      <svg class="auth-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
        <path d="M10 17l5-5-5-5"></path>
        <path d="M15 12H3"></path>
      </svg>
      <span>Sair</span>
    </button>
  `;

  button.insertAdjacentElement("afterend", menu);
  button.setAttribute("aria-expanded", "true");
  authMenu = menu;

  menu.querySelector(".auth-menu-item").addEventListener("click", async () => {
    await logoutUser(state, renderAuth);
  });

  setTimeout(() => {
    document.addEventListener("click", closeAuthMenuFromOutside);
    document.addEventListener("keydown", closeAuthMenuOnEscape);
  }, 0);
}

async function logoutUser(state, renderAuth) {
  await window.backend?.logout().catch(() => {});
  localStorage.removeItem("ptMusicUser");
  localStorage.removeItem("ptMusicProgress");
  state.user = null;
  state.progress = { completed: {}, attempts: [], streak: 0 };
  closeAuthMenu();
  renderAuth();
  window.location.href = "index.html#songs";
}

function closeAuthMenu() {
  authMenu?.remove();
  authMenu = null;
  document.querySelector("#loginButton")?.setAttribute("aria-expanded", "false");
  document.removeEventListener("click", closeAuthMenuFromOutside);
  document.removeEventListener("keydown", closeAuthMenuOnEscape);
}

function closeAuthMenuFromOutside(event) {
  if (authMenu?.contains(event.target) || document.querySelector("#loginButton")?.contains(event.target)) return;
  closeAuthMenu();
}

function closeAuthMenuOnEscape(event) {
  if (event.key === "Escape") closeAuthMenu();
}
