const params = new URLSearchParams(window.location.search);
const nextUrl = params.get("next") || "index.html#home";
const form = document.querySelector("#authForm");
const feedback = document.querySelector("#authFeedback");
const usernameInput = document.querySelector("#authUsername");
const passwordInput = document.querySelector("#authPassword");

function normalizeNext(url) {
  if (!url || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")) {
    return "index.html#home";
  }
  return url;
}

async function submitAuth(mode) {
  feedback.textContent = "";
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  try {
    const result = mode === "register"
      ? await window.backend.register(username, password)
      : await window.backend.login(username, password);
    localStorage.setItem("ptMusicUser", JSON.stringify(result.user));
    window.location.href = normalizeNext(nextUrl);
  } catch (error) {
    feedback.textContent = error.message;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth("login");
});

document.querySelector("#registerButton").addEventListener("click", () => submitAuth("register"));
usernameInput.focus();
