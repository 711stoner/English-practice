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

export async function loginWithCredentials(name, password) {
  const cleanName = String(name || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanName || !cleanPassword) return null;

  try {
    const response = await fetch("/api/user-data/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: cleanName.toLowerCase().replace(/\s+/g, "_"),
        password: cleanPassword,
      }),
    });

    if (response.status === 404) {
      alert("用户不存在");
      return null;
    }
    if (response.status === 401) {
      alert("密码错误");
      return null;
    }
    if (!response.ok) {
      alert("登陆失败");
      return null;
    }

    const data = await response.json();
    const user = {
      id: data.userId,
      name: data.name || cleanName,
      password: cleanPassword,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    notifyChanged();
    return user;
  } catch (err) {
    alert("登陆失败: " + err.message);
    return null;
  }
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
