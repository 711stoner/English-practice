function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export class UserRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getUser(userId) {
    const users = await this.state.storage.get('users') || {};
    return users[userId] || null;
  }

  async registerUser(userId, name, password) {
    const users = await this.state.storage.get('users') || {};

    if (users[userId]) {
      return { error: 'User already exists' };
    }

    const passwordHash = simpleHash(password);
    users[userId] = {
      name,
      password_hash: passwordHash,
      sentences: [],
      history: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await this.state.storage.put('users', users);

    return {
      userId,
      name,
      sentences: [],
      history: [],
      updated_at: users[userId].updated_at,
    };
  }

  async loginUser(userId, password) {
    const user = await this.getUser(userId);

    if (!user) {
      return { error: 'User not found' };
    }

    const passwordHash = simpleHash(password);
    if (user.password_hash !== passwordHash) {
      return { error: 'Invalid password' };
    }

    return {
      userId,
      name: user.name || userId,
      sentences: user.sentences || [],
      history: user.history || [],
      updated_at: user.updated_at || null,
    };
  }

  async resetPassword(userId, oldPassword, newPassword) {
    const user = await this.getUser(userId);

    if (!user) {
      return { error: 'User not found' };
    }

    const oldPasswordHash = simpleHash(oldPassword);
    if (user.password_hash !== oldPasswordHash) {
      return { error: 'Old password incorrect' };
    }

    const users = await this.state.storage.get('users') || {};
    users[userId] = {
      ...user,
      password_hash: simpleHash(newPassword),
      updated_at: new Date().toISOString(),
    };

    await this.state.storage.put('users', users);

    return {
      ok: true,
      userId,
      message: 'Password reset successfully',
    };
  }

  async syncUser(userId, password) {
    const user = await this.getUser(userId);
    const passwordHash = simpleHash(password);

    if (user && user.password_hash !== passwordHash) {
      return { error: 'Invalid userId or password' };
    }

    if (!user) {
      const users = await this.state.storage.get('users') || {};
      users[userId] = {
        userId,
        password_hash: passwordHash,
        sentences: [],
        history: [],
        updated_at: new Date().toISOString(),
      };
      await this.state.storage.put('users', users);

      return {
        userId,
        sentences: [],
        history: [],
        updated_at: users[userId].updated_at,
      };
    }

    return {
      userId,
      sentences: user.sentences || [],
      history: user.history || [],
      updated_at: user.updated_at || null,
    };
  }

  async upsertUser(userId, password, sentences, history) {
    const user = await this.getUser(userId);
    const passwordHash = simpleHash(password);

    if (user && user.password_hash !== passwordHash) {
      return { error: 'Invalid userId or password' };
    }

    const users = await this.state.storage.get('users') || {};
    users[userId] = {
      userId,
      password_hash: user?.password_hash || passwordHash,
      sentences: sentences || user?.sentences || [],
      history: (history || user?.history || []).slice(0, 365),
      updated_at: new Date().toISOString(),
    };

    await this.state.storage.put('users', users);

    return {
      ok: true,
      userId,
      updated_at: users[userId].updated_at,
    };
  }
}
