const AUTH_STORAGE_KEY = "sentence_memo_auth_user";
const AUTH_CHANGE_EVENT = "auth-user-changed";

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeUser(input) {
  if (!input || typeof input !== "object") return null;
  const id = String(input.id || "").trim();
  const name = String(input.name || "").trim();
  const password = String(input.password || "");
  if (!id || !name || !password) return null;
  return { id, name, password };
}

function notifyChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function loadAuthUser() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  const parsed = safeParse(raw);
  return normalizeUser(parsed);
}

export function loginWithCredentials(name, password) {
  const cleanName = String(name || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanName || !cleanPassword) return null;
  const user = {
    id: `u_${cleanName.toLowerCase().replace(/\s+/g, "_")}`,
    name: cleanName,
    password: cleanPassword,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  notifyChanged();
  return user;
}

export function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  notifyChanged();
}

export function subscribeAuthUser(callback) {
  const handleLocal = () => {
    callback(loadAuthUser());
  };

  const handleStorage = (e) => {
    if (e.key === AUTH_STORAGE_KEY) {
      callback(loadAuthUser());
    }
  };

  window.addEventListener(AUTH_CHANGE_EVENT, handleLocal);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, handleLocal);
    window.removeEventListener("storage", handleStorage);
  };
}
