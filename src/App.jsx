import { useEffect, useRef, useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import SentenceBank from "./pages/SentenceBank.jsx";
import Practice from "./pages/Practice.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import {
  loadAuthUser,
  loginWithCredentials,
  logout,
  subscribeAuthUser,
} from "./storage/authStore.js";
import {
  pushUserDataToCloud,
  syncUserDataFromCloud,
} from "./storage/cloudSyncStore.js";

export default function App() {
  const [user, setUser] = useState(() => loadAuthUser());
  const [syncState, setSyncState] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingFromCloudRef = useRef(false);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    return subscribeAuthUser((nextUser) => {
      setUser(nextUser);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const currentUser = user;

    if (!currentUser) {
      setSyncState("");
      return () => {};
    }

    const run = async () => {
      syncingFromCloudRef.current = true;
      setIsSyncing(true);
      setSyncState("同步中");
      try {
        await syncUserDataFromCloud(currentUser);
        if (!cancelled) setSyncState("已同步");
      } catch {
        if (!cancelled) setSyncState("同步失败");
      } finally {
        syncingFromCloudRef.current = false;
        if (!cancelled) setIsSyncing(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const schedulePush = () => {
      if (!user || syncingFromCloudRef.current) return;
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = setTimeout(async () => {
        try {
          setIsSyncing(true);
          setSyncState("同步中");
          await pushUserDataToCloud(user);
          setSyncState("已同步");
        } catch {
          setSyncState("同步失败");
        } finally {
          setIsSyncing(false);
        }
      }, 900);
    };

    window.addEventListener("sentences-changed", schedulePush);
    window.addEventListener("history-changed", schedulePush);

    return () => {
      window.removeEventListener("sentences-changed", schedulePush);
      window.removeEventListener("history-changed", schedulePush);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [user]);

  function handleAuthClick() {
    if (user) {
      const shouldLogout = window.confirm(`确认退出登录吗？\n当前账号：${user.name}`);
      if (shouldLogout) {
        logout();
      }
      return;
    }

    const inputName = window.prompt("请输入登录名");
    if (!inputName) return;
    const inputPassword = window.prompt("请输入登录密码");
    if (!inputPassword) return;
    loginWithCredentials(inputName, inputPassword);
  }

  async function handleManualSync() {
    if (!user || isSyncing) return;
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    syncingFromCloudRef.current = true;
    setIsSyncing(true);
    setSyncState("同步中");
    try {
      await syncUserDataFromCloud(user);
      setSyncState("已同步");
    } catch {
      setSyncState("同步失败");
    } finally {
      syncingFromCloudRef.current = false;
      setIsSyncing(false);
    }
  }

  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true" />
          <div className="brand-title">小猫学英语</div>
        </div>

        <NavLink to="/bank" className="nav-link">
          句仓
        </NavLink>
        <NavLink to="/practice" className="nav-link">
          练习
        </NavLink>
        <NavLink to="/dashboard" className="nav-link">
          仪表盘
        </NavLink>
        <div className="nav-spacer" />
        <div className="auth-area">
          {user ? (
            <span className="auth-user">
              已登录：{user.name}
              {syncState ? ` · ${syncState}` : ""}
            </span>
          ) : (
            <span className="auth-user muted">未登录</span>
          )}
          <button className="button secondary auth-button" type="button" onClick={handleAuthClick}>
            {user ? "退出" : "登录"}
          </button>
          {user && (
            <button
              className="button secondary auth-button"
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
            >
              {isSyncing ? "同步中" : "手动同步"}
            </button>
          )}
        </div>
      </header>

      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/bank" replace />} />
          <Route path="/bank" element={<SentenceBank />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
