const USERS_STORAGE_KEY = "sentence_memo_users";
const SENTENCES_STORAGE_KEY = "sentence_memo_sentences_";
const HISTORY_STORAGE_KEY = "sentence_memo_history_";

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function getAllUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function registerUser(userId, name, password) {
  if (!userId || !name || !password) {
    return { success: false, error: "缺少必要信息" };
  }

  const users = getAllUsers();
  if (users[userId]) {
    return { success: false, error: "用户已存在" };
  }

  const passwordHash = simpleHash(password);
  users[userId] = {
    name,
    password_hash: passwordHash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveAllUsers(users);
  localStorage.setItem(SENTENCES_STORAGE_KEY + userId, JSON.stringify([]));
  localStorage.setItem(HISTORY_STORAGE_KEY + userId, JSON.stringify([]));

  return { success: true, data: { userId, name } };
}

export function loginUser(userId, password) {
  if (!userId || !password) {
    return { success: false, error: "缺少必要信息" };
  }

  const users = getAllUsers();
  const user = users[userId];

  if (!user) {
    return { success: false, error: "用户不存在" };
  }

  const passwordHash = simpleHash(password);
  if (user.password_hash !== passwordHash) {
    return { success: false, error: "密码错误" };
  }

  return {
    success: true,
    data: {
      userId,
      name: user.name,
      sentences: JSON.parse(localStorage.getItem(SENTENCES_STORAGE_KEY + userId) || "[]"),
      history: JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY + userId) || "[]"),
      updated_at: user.updated_at,
    },
  };
}

export function resetPassword(userId, oldPassword, newPassword) {
  if (!userId || !oldPassword || !newPassword) {
    return { success: false, error: "缺少必要信息" };
  }

  const users = getAllUsers();
  const user = users[userId];

  if (!user) {
    return { success: false, error: "用户不存在" };
  }

  const oldPasswordHash = simpleHash(oldPassword);
  if (user.password_hash !== oldPasswordHash) {
    return { success: false, error: "旧密码错误" };
  }

  const newPasswordHash = simpleHash(newPassword);
  users[userId] = {
    ...user,
    password_hash: newPasswordHash,
    updated_at: new Date().toISOString(),
  };

  saveAllUsers(users);
  return { success: true, data: { userId, message: "密码重置成功" } };
}
