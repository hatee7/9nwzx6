import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function AuthScreen({ onSuccess }) {
  const [mode, setMode] = useState("initial"); // initial | login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const generateRandomUsername = (length = 12) => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleAnonymousLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const credential = await signInAnonymously(auth);
      const user = credential.user;

      const randomName = "anon_" + generateRandomUsername(8); // например: anon_kJ9#mP2$nQ

      // Устанавливаем displayName
      await updateProfile(user, { displayName: randomName });

      // Сохраняем в Firestore
      await setDoc(doc(db, "users", user.uid), {
        username: randomName, // или можно prefix "anon_" + random
        displayName: randomName,
        isAnonymous: true,
        createdAt: serverTimestamp(),
        online: true,
        photoURL: null,
      });

      onSuccess(); // переходим в чат
    } catch (err) {
      setError(err.message || "Ошибка анонимного входа");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      onSuccess();
    } catch (err) {
      setError(err.message || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!username.trim()) {
      setError("Введите username");
      setLoading(false);
      return;
    }

    try {
      // Простая клиентская проверка уникальности (не 100% надёжна)
      // const usernameDoc = await getDoc(doc(db, "usernames", username));
      // if (usernameDoc.exists()) throw new Error("Username занят");

      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = credential.user;

      await updateProfile(user, { displayName: username });

      await setDoc(doc(db, "users", user.uid), {
        username,
        displayName: username,
        email: user.email,
        isAnonymous: false,
        createdAt: serverTimestamp(),
        online: true,
        photoURL: null,
      });

      // Опционально: сохраняем username → uid для поиска
      // await setDoc(doc(db, "usernames", username), { uid: user.uid });

      onSuccess();
    } catch (err) {
      setError(err.message || "Ошибка регистрации");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (mode === "initial") {
    return (
      <div
        style={{
          maxWidth: "420px",
          margin: "60px auto",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <h1 style={{ marginBottom: "32px" }}>messenger</h1>

        <button
          onClick={handleAnonymousLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "16px",
            background: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          {loading ? "Вход..." : "Войти анонимно"}
        </button>

        <div style={{ margin: "24px 0", color: "#777" }}>или</div>

        <button
          onClick={() => setMode("login")}
          style={{
            width: "100%",
            padding: "14px",
            marginBottom: "12px",
            background: "#1976d2",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          Войти по email и паролю
        </button>

        <button
          onClick={() => setMode("register")}
          style={{
            width: "100%",
            padding: "14px",
            background: "transparent",
            color: "#1976d2",
            border: "2px solid #1976d2",
            borderRadius: "8px",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          Зарегистрироваться
        </button>
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div style={{ maxWidth: "400px", margin: "40px auto", padding: "24px" }}>
        <h2>Вход</h2>
        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
          {error && <div style={{ color: "red" }}>{error}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px",
              background: "#1976d2",
              color: "white",
              border: "none",
              borderRadius: "8px",
            }}
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>
        <button
          onClick={() => setMode("initial")}
          style={{
            marginTop: "16px",
            background: "none",
            border: "none",
            color: "#1976d2",
            cursor: "pointer",
          }}
        >
          ← Назад
        </button>
      </div>
    );
  }

  if (mode === "register") {
    return (
      <div style={{ maxWidth: "400px", margin: "40px auto", padding: "24px" }}>
        <h2>Регистрация</h2>
        <form
          onSubmit={handleRegister}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <input
            type="text"
            placeholder="Username (будет виден в чате)"
            value={username}
            onChange={(e) => setUsername(e.target.value.trim())}
            required
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
          <input
            type="password"
            placeholder="Пароль (минимум 6 символов)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #ccc",
            }}
          />
          {error && <div style={{ color: "red" }}>{error}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px",
              background: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "8px",
            }}
          >
            {loading ? "Создаём..." : "Зарегистрироваться"}
          </button>
        </form>
        <button
          onClick={() => setMode("initial")}
          style={{
            marginTop: "16px",
            background: "none",
            border: "none",
            color: "#1976d2",
            cursor: "pointer",
          }}
        >
          ← Назад
        </button>
      </div>
    );
  }

  return null;
}
