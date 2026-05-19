import { useEffect, useRef, useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import SentenceBank from "./pages/SentenceBank.jsx";
import Practice from "./pages/Practice.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { ScreenCat } from "./components/NavCat.jsx";
import Logo3DCat from "./components/Logo3DCat.jsx";
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

    window.addEventListener('sentences-changed', schedulePush);
    window.addEventListener('history-changed', schedulePush);

    return () => {
      window.removeEventListener('sentences-changed', schedulePush);
      window.removeEventListener('history-changed', schedulePush);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [user]);

  function handleAuthClick() {
    if (user) {
      const action = window.prompt(`当前账号：${user.name}\n\n1 = 修改密码\n2 = 退出登录`);
      if (!action) return;

      if (action === "1") {
        const oldPassword = window.prompt("请输入旧密码");
        if (!oldPassword) return;
        const newPassword = window.prompt("请输入新密码");
        if (!newPassword) return;
        const confirmPassword = window.prompt("请确认新密码");
        if (confirmPassword !== newPassword) {
          alert("两次密码不一致");
          return;
        }

        fetch("/api/user-data/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            oldPassword,
            newPassword,
          }),
        })
          .then((res) => {
            if (res.status === 401) throw new Error("旧密码错误");
            if (res.status === 404) throw new Error("用户不存在");
            if (!res.ok) throw new Error("修改失败");
            return res.json();
          })
          .then(() => {
            alert("密码修改成功！");
          })
          .catch((err) => {
            alert("修改失败: " + err.message);
          });
        return;
      }

      if (action === "2") {
        logout();
        return;
      }

      alert("请输入 1 或 2");
      return;
    }

    const mode = window.prompt("请选择：\n1 = 注册\n2 = 登陆\n3 = 重置密码");
    if (!mode) return;

    if (mode === "1") {
      const userName = window.prompt("请输入用户名");
      if (!userName) return;
      const password = window.prompt("请输入密码");
      if (!password) return;
      const confirmPassword = window.prompt("请确认密码");
      if (confirmPassword !== password) {
        alert("两次密码不一致");
        return;
      }

      fetch("/api/user-data/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userName.toLowerCase().trim(),
          name: userName,
          password,
        }),
      })
        .then((res) => {
          if (res.status === 409) throw new Error("用户已存在");
          if (!res.ok) throw new Error("注册失败");
          return res.json();
        })
        .then((data) => {
          alert("注册成功！请登陆");
        })
        .catch((err) => {
          alert("注册失败: " + err.message);
        });
      return;
    }

    if (mode === "2") {
      const inputName = window.prompt("请输入用户名");
      if (!inputName) return;
      const inputPassword = window.prompt("请输入密码");
      if (!inputPassword) return;
      loginWithCredentials(inputName, inputPassword).catch(() => {});
      return;
    }

    if (mode === "3") {
      const userName = window.prompt("请输入你的用户名");
      if (!userName) return;
      const oldPassword = window.prompt("请输入旧密码（用于验证身份）");
      if (!oldPassword) return;
      const newPassword = window.prompt("请输入新密码");
      if (!newPassword) return;
      const confirmPassword = window.prompt("请确认新密码");
      if (confirmPassword !== newPassword) {
        alert("两次密码不一致");
        return;
      }

      fetch("/api/user-data/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userName.toLowerCase().trim(),
          oldPassword,
          newPassword,
        }),
      })
        .then((res) => {
          if (res.status === 401) throw new Error("旧密码错误");
          if (res.status === 404) throw new Error("用户不存在");
          if (!res.ok) throw new Error("重置失败");
          return res.json();
        })
        .then(() => {
          alert("密码重置成功！请用新密码登陆");
        })
        .catch((err) => {
          alert("重置失败: " + err.message);
        });
      return;
    }

    alert("请输入 1、2 或 3");
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
    <div className='app'>
      <ScreenCat />
      <header className='nav' style={{ position: 'relative'}}>
        <div className='brand'>
          <div className='brand-logo'>
            <Logo3DCat />
          </div>
          <div className='brand-title'>小猫学英语</div>
        </div>

        <div className='nav-links'>
          <NavLink to="/bank" className='nav-link'>
            📚 句仓
          </NavLink>
          <NavLink to="/practice" className='nav-link'>
            ✏️ 练习
          </NavLink>
          <NavLink to="/dashboard" className='nav-link'>
            📊 仪表盘
          </NavLink>
        </div>
        <div className='auth-area'>
          {user ? (
            <span className='auth-user'>
              已登录：{user.name}
              {syncState ? ` · ${syncState}` : ""}
            </span>
          ) : (
            <span className='auth-user muted'>未登录</span>
          )}
          <button className='button secondary auth-button' type='button' onClick={handleAuthClick}>
            {user ? "退出" : "登录"}
          </button>
          {user && (
            <button
              className='button secondary auth-button' type="button" onClick={handleManualSync}
              disabled={isSyncing}
            >
              {isSyncing ? "同步中" : "手动同步"}
            </button>
          )}
        </div>
      </header>

      <main className='container'>
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
