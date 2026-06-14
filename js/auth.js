// ===== Autenticación simple (cliente) =====

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function login(username, password) {
  const user = CONFIG.users[username.trim().toLowerCase()];
  if (!user) return null;
  const hash = await sha256(password);
  if (hash !== user.passwordHash) return null;
  const session = { username: username.trim().toLowerCase(), role: user.role, ts: Date.now() };
  sessionStorage.setItem("luanna_session", JSON.stringify(session));
  return session;
}

// Invitados: sin contraseña, solo un nombre obligatorio.
function loginGuest(name) {
  const clean = (name || "").trim().slice(0, 24);
  if (!clean) return null;
  const session = {
    username: "guest",
    role: "guest",
    name: clean,
    guestId: "g" + Math.random().toString(36).slice(2, 8),
    ts: Date.now()
  };
  sessionStorage.setItem("luanna_session", JSON.stringify(session));
  return session;
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem("luanna_session"));
  } catch {
    return null;
  }
}

function logout() {
  sessionStorage.removeItem("luanna_session");
  window.location.href = "index.html";
}

// Protege una página: redirige al login si no hay sesión o el rol no alcanza.
function requireAuth(roles) {
  const s = getSession();
  if (!s || (roles && !roles.includes(s.role))) {
    window.location.href = "index.html";
    return null;
  }
  return s;
}
