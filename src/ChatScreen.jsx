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
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useReactMediaRecorder } from "react-media-recorder";
import { signOut, updateProfile } from "firebase/auth";

export default function ChatScreen({ user }) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [changeNameMode, setChangeNameMode] = useState(false);
  const messagesEndRef = useRef(null);

  const { status, startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    onStop: (_, blob) => {
      if (blob?.size > 200) uploadFile(blob, "audio");
    },
  });

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

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

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
      console.error("Ошибка отправки сообщения:", err);
    }
  };

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
      console.error("Ошибка загрузки файла:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      await updateDoc(doc(db, "users", user.uid), { online: false });
    } catch {}
    await signOut(auth);
  };

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
      // обновляем профиль в Authentication
      await updateProfile(user, { displayName });

      // обновляем в Firestore
      await updateDoc(doc(db, "users", user.uid), { displayName });

      alert("Имя успешно изменено");
      setChangeNameMode(false);
    } catch (err) {
      console.error("Ошибка при смене имени:", err);
      let msg = "Не удалось изменить имя";

      if (err.code === "permission-denied") {
        msg = "Нет прав на изменение";
      } else if (err.code?.includes("auth")) {
        msg = "Ошибка аутентификации";
      }

      alert(msg + "\n" + (err.message || ""));
    }
  };

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
        fontSize: "15px", // базовый размер текста чуть меньше
      }}
    >
      {/* Шапка — компактнее */}
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
            Чат
          </h2>

          {/* Юзернейм под заголовком */}
          <div
            style={{
              fontSize: "0.82rem",
              color: "#6b7280",
              fontWeight: 500,
              lineHeight: 1.2,
            }}
          >
            {user.displayName || "Аноним"}
          </div>
        </div>

        {/* Кнопки справа */}
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

      {/* Форма смены имени — тоже компактнее */}
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

      {/* Сообщения — уменьшаем отступы */}
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
                  }}
                >
                  {(m.displayName || "?")[0].toUpperCase()}
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
                    {m.displayName}
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

      {/* Нижняя панель ввода — компактнее */}
      <form
        onSubmit={sendMessage}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 12px",
          background: "white",
          borderTop: "1px solid #e5e7eb",
          flexShrink: 0, // чтобы не сжималась
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
