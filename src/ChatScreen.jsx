import React, { useState, useEffect, useRef } from "react";
import { db, storage, auth } from "./firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  Timestamp,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useReactMediaRecorder } from "react-media-recorder";
import { signOut, updateProfile } from "firebase/auth";

// Импортируем списки забаненных / замученных (создай файл text.js рядом)
import { bannedUids, mutedUids } from "./text";

export default function ChatScreen({ user }) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [changeNameMode, setChangeNameMode] = useState(false);
  const [myUserData, setMyUserData] = useState(null);
  const [usersData, setUsersData] = useState({});
  const [contextMenu, setContextMenu] = useState(null);

  const messagesEndRef = useRef(null);

  const { status, startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    onStop: (_, blob) => {
      if (blob?.size > 200) uploadFile(blob, "audio");
    },
  });

  // Загружаем данные о себе (роль, мут, бан и т.д.)
  useEffect(() => {
    if (!user?.uid) return;

    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        setMyUserData(snap.data());
      } else {
        setDoc(
          doc(db, "users", user.uid),
          {
            displayName: user.displayName || "Аноним",
            email: user.email,
            role: "user",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    return unsub;
  }, [user?.uid]);

  // Кэшируем данные других пользователей
  useEffect(() => {
    const uniqueUids = new Set(messages.map((m) => m.uid).filter(Boolean));
    uniqueUids.forEach((uid) => {
      if (usersData[uid]) return;
      getDoc(doc(db, "users", uid)).then((snap) => {
        if (snap.exists()) {
          setUsersData((prev) => ({ ...prev, [uid]: snap.data() }));
        }
      });
    });
  }, [messages]);

  // Слушаем сообщения
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isMyMessage = (m) => m.uid === user.uid;
  const isAdmin = myUserData?.role === "admin";

  // ─── Временная функция — сделать себя админом один раз ──────
  const makeMyselfAdmin = async () => {
    if (!user?.uid) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { role: "admin" });
      alert("Вы теперь администратор");
    } catch (err) {
      console.error(err);
      alert("Не удалось: " + err.message);
    }
  };

  // ─── Отправка текстового сообщения ─────────────────────────
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    const isMuted =
      mutedUids.includes(user.uid) ||
      (myUserData?.mutedUntil && myUserData.mutedUntil.toDate() > new Date());

    if (isMuted) {
      alert("Вы замучены и не можете отправлять сообщения");
      return;
    }

    if (bannedUids.includes(user.uid) || myUserData?.banned) {
      alert("Вы забанены");
      await signOut(auth);
      return;
    }

    try {
      await addDoc(collection(db, "messages"), {
        text,
        type: "text",
        uid: user.uid,
        displayName: user.displayName || "Аноним",
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      console.error("Ошибка отправки:", err);
    }
  };
  //---------удаление чата-----------------------------
  const handleClearChat = async () => {
    if (!window.confirm("Очистить ВЕСЬ чат? Это действие нельзя отменить.")) {
      return;
    }

    try {
      const messagesCollection = collection(db, "messages");
      const snapshot = await getDocs(messagesCollection);

      if (snapshot.empty) {
        alert("Чат уже пуст");
        return;
      }

      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();

      alert(`Чат очищен (${snapshot.size} сообщений удалено)`);
    } catch (err) {
      console.error("Ошибка очистки чата:", err);
      let msg = "Не удалось очистить чат";

      if (err.code === "permission-denied") {
        msg += " — нет прав (проверь правила Firestore)";
      }

      alert(msg + "\n" + (err.message || ""));
    }
  };
  // ─── Загрузка файлов (аудио/изображения) ───────────────────
  const uploadFile = async (fileOrBlob, type) => {
    try {
      const ext = type === "image" ? "jpg" : "webm";
      const path = `chat-files/${Date.now()}.${ext}`;
      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, fileOrBlob);
      const url = await getDownloadURL(fileRef);

      await addDoc(collection(db, "messages"), {
        fileUrl: url,
        type,
        uid: user.uid,
        displayName: user.displayName || "Аноним",
        photoURL: user.photoURL || null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Ошибка загрузки:", err);
    }
  };

  // ─── Выход ─────────────────────────────────────────────────
  const handleSignOut = async () => {
    try {
      if (user?.uid) {
        await updateDoc(doc(db, "users", user.uid), { online: false });
      }
    } catch {}
    await signOut(auth);
  };

  // ─── Смена имени ───────────────────────────────────────────
  const handleChangeName = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      alert("Имя не может быть пустым");
      return;
    }

    if (displayName === user.displayName) {
      setChangeNameMode(false);
      return;
    }

    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName });
      alert("Имя изменено");
      setChangeNameMode(false);
    } catch (err) {
      console.error(err);
      alert("Ошибка изменения имени\n" + err.message);
    }
  };

  // ─── Модерация (контекстное меню) ──────────────────────────
  const handleAvatarClick = (e, message) => {
    if (!isAdmin || message.uid === user.uid) return;
    setContextMenu({
      uid: message.uid,
      displayName:
        message.displayName ||
        usersData[message.uid]?.displayName ||
        "Пользователь",
      x: e.clientX,
      y: e.clientY,
    });
  };

  const closeMenu = () => setContextMenu(null);

  const muteUser = async (uid, minutes = 60) => {
    try {
      const until = Timestamp.fromDate(
        new Date(Date.now() + minutes * 60 * 1000)
      );
      await updateDoc(doc(db, "users", uid), { mutedUntil: until });
      alert(`Замучен на ${minutes} минут`);
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
    closeMenu();
  };

  const unmuteUser = async (uid) => {
    try {
      await updateDoc(doc(db, "users", uid), { mutedUntil: null });
      alert("Мут снят");
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
    closeMenu();
  };

  const banUser = async (uid) => {
    if (!window.confirm("Забанить навсегда?")) return;
    try {
      await updateDoc(doc(db, "users", uid), { banned: true });
      alert("Забанен");
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
    closeMenu();
  };

  const unbanUser = async (uid) => {
    try {
      await updateDoc(doc(db, "users", uid), { banned: false });
      alert("Бан снят");
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
    closeMenu();
  };

  // ─── JSX ────────────────────────────────────────────────────
  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#f8f9fa",
        fontSize: "15px",
      }}
    >
      {/* Шапка */}
      <div
        style={{
          padding: "10px 14px",
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2
            style={{
              margin: "0 0 3px 0",
              fontSize: "1.25rem",
              fontWeight: 600,
            }}
          >
            Чат {isAdmin && "(Админ)"}
          </h2>
          <div
            style={{ fontSize: "0.82rem", color: "#6b7280", fontWeight: 500 }}
          >
            {user.displayName || "Аноним"}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            right: "14px",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            gap: "6px",
          }}
        >
          {!user.isAnonymous && (
            <button
              onClick={() => setChangeNameMode(!changeNameMode)}
              style={{
                padding: "5px 10px",
                background: "#6b7280",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              ✎
            </button>
          )}
          <button
            onClick={handleSignOut}
            style={{
              padding: "5px 12px",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Выйти
          </button>
        </div>
      </div>

      {/* Форма смены имени */}
      {changeNameMode && (
        <form
          onSubmit={handleChangeName}
          style={{
            display: "flex",
            gap: "6px",
            padding: "8px 14px",
            background: "white",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Новое имя"
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              fontSize: "0.95rem",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 14px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.9rem",
            }}
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setChangeNameMode(false)}
            style={{
              padding: "8px 14px",
              background: "#9ca3af",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.9rem",
            }}
          >
            ×
          </button>
        </form>
      )}

      {/* Сообщения */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 8px",
          background: "#f9fafb",
        }}
      >
        {messages.map((m) => {
          const mine = isMyMessage(m);
          const userInfo = usersData[m.uid] || {};
          const isMuted =
            mutedUids.includes(m.uid) ||
            (userInfo.mutedUntil && userInfo.mutedUntil.toDate() > new Date());
          const isBanned = bannedUids.includes(m.uid) || userInfo.banned;

          let nameToShow = m.displayName;
          if (isMuted) nameToShow += " [muted]";
          if (isBanned) nameToShow += " [banned]";

          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
                marginBottom: "8px",
              }}
            >
              {!mine && (
                <div
                  onClick={(e) => handleAvatarClick(e, m)} // ← было onContextMenu
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "#9ca3af",
                    color: "white",
                    fontSize: "0.9rem",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: "6px",
                    flexShrink: 0,
                    cursor: isAdmin ? "pointer" : "default", // подсказка, что можно кликнуть
                  }}
                >
                  {(nameToShow || "?")[0].toUpperCase()}
                </div>
              )}

              <div
                style={{
                  maxWidth: "78%",
                  padding: m.type === "text" ? "8px 12px" : "4px",
                  borderRadius: "16px",
                  background: mine ? "#2563eb" : "#e5e7eb",
                  color: mine ? "white" : "#111827",
                  borderBottomRightRadius: mine ? "4px" : "16px",
                  borderBottomLeftRadius: mine ? "16px" : "4px",
                  fontSize: "0.95rem",
                  opacity: isBanned ? 0.4 : 1,
                }}
              >
                {!mine && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      opacity: 0.7,
                      marginBottom: "2px",
                    }}
                  >
                    {nameToShow}
                  </div>
                )}
                {m.type === "text" && m.text}
                {m.type === "image" && m.fileUrl && (
                  <img
                    src={m.fileUrl}
                    alt="фото"
                    style={{
                      maxWidth: "100%",
                      borderRadius: "8px",
                      marginTop: "4px",
                    }}
                  />
                )}
                {m.type === "audio" && m.fileUrl && (
                  <audio
                    controls
                    src={m.fileUrl}
                    style={{
                      width: "100%",
                      maxWidth: "240px",
                      marginTop: "4px",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Контекстное меню админа */}
      {contextMenu && isAdmin && (
        <div
          style={{
            position: "fixed",
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            background: "white",
            border: "1px solid #ccc",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            zIndex: 1000,
            minWidth: "160px",
            padding: "6px 0",
          }}
          onClick={closeMenu}
        >
          <div
            style={{
              padding: "8px 16px",
              fontWeight: "bold",
              borderBottom: "1px solid #eee",
            }}
          >
            {contextMenu.displayName}
          </div>

          <button
            onClick={() => muteUser(contextMenu.uid, 60)}
            style={menuBtnStyle}
          >
            Замутить на 1 час
          </button>
          <button
            onClick={() => muteUser(contextMenu.uid, 1440)}
            style={menuBtnStyle}
          >
            Замутить на 24 часа
          </button>
          <button
            onClick={() => unmuteUser(contextMenu.uid)}
            style={menuBtnStyle}
          >
            Размутить
          </button>

          <hr style={{ margin: "4px 0" }} />

          <button
            onClick={() => banUser(contextMenu.uid)}
            style={{ ...menuBtnStyle, color: "#dc2626" }}
          >
            Забанить
          </button>
          <button
            onClick={() => unbanUser(contextMenu.uid)}
            style={{ ...menuBtnStyle, color: "#16a34a" }}
          >
            Разбанить
          </button>
        </div>
      )}

      {/* Поле ввода */}
      <form
        onSubmit={sendMessage}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 12px",
          background: "white",
          borderTop: "1px solid #e5e7eb",
          flexShrink: 0,
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение..."
          style={{
            flex: 1,
            padding: "10px 14px",
            border: "1px solid #d1d5db",
            borderRadius: "9999px",
            fontSize: "0.95rem",
            outline: "none",
          }}
        />
        {isAdmin && (
          <button
            onClick={handleClearChat}
            title="Очистить весь чат"
            style={{
              position: "fixed",
              bottom: "90px",
              right: "24px",
              width: "56px",
              height: "56px",
              background: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "50%",
              fontSize: "1.4rem",
              boxShadow: "0 4px 12px rgba(220,38,38,0.4)",
              cursor: "pointer",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            🗑
          </button>
        )}
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            padding: "10px 18px",
            background: text.trim() ? "#2563eb" : "#9ca3af",
            color: "white",
            border: "none",
            borderRadius: "9999px",
            fontSize: "0.9rem",
            fontWeight: 500,
            cursor: text.trim() ? "pointer" : "not-allowed",
            minWidth: "70px",
          }}
        >
          Отправить
        </button>
      </form>
    </div>
  );
}

const menuBtnStyle = {
  display: "block",
  width: "100%",
  padding: "8px 16px",
  textAlign: "left",
  border: "none",
  background: "none",
  cursor: "pointer",
};
