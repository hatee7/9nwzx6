import React, { useState, useEffect, useRef } from "react";
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
import { db, storage, auth } from "./firebase";

// Импортируйте файл с глобальными банами/мутами (создайте text.js рядом)
import { bannedUids, mutedUids } from "./text";

export default function ChatScreen({ user }) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [changeNameMode, setChangeNameMode] = useState(false);
  const [myUserData, setMyUserData] = useState(null);
  const [usersData, setUsersData] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [pendingImage, setPendingImage] = useState(null); // файл, который выбрали, но ещё не отправили
  const [previewUrl, setPreviewUrl] = useState(null); // временная ссылка для превью
  const [imageCaption, setImageCaption] = useState("");

  const inputContainerRef = useRef(null); // ref на форму ввода
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const { status, startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    onStop: (_, blob) => {
      if (blob?.size > 200) uploadFile(blob, "audio");
    },
  });

  const isAdmin = myUserData?.role === "admin";

  // Загружаем свои данные (роль, мут, бан)
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
            email: user.email || null,
            role: "user",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(console.error);
      }
    });

    return unsub;
  }, [user?.uid]);

  // Кэшируем данные других пользователей
  useEffect(() => {
    const uniqueUids = [...new Set(messages.map((m) => m.uid).filter(Boolean))];
    uniqueUids.forEach((uid) => {
      if (usersData[uid]) return;
      getDoc(doc(db, "users", uid))
        .then((snap) => {
          if (snap.exists()) {
            setUsersData((prev) => ({ ...prev, [uid]: snap.data() }));
          }
        })
        .catch(console.error);
    });
  }, [messages]);

  // Слушаем сообщения
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      console.error
    );
    return unsubscribe;
  }, []);

  // Автоматический скролл вниз с отступом от панели ввода
  // Автоматический скролл вниз — последнее сообщение до границы строки ввода (или чуть выше)
  useEffect(() => {
    if (!messagesEndRef.current) return;

    const container = messagesEndRef.current.parentElement;
    if (!container) return;

    // Простой скролл в самый низ (без inputHeight, чтобы не зависеть от ref)
    container.scrollTo({
      top: container.scrollHeight - container.clientHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;

    // Безопасная проверка
    const currentUid = user?.uid || "";

    const isMutedGlobally =
      Array.isArray(mutedUids) && mutedUids.includes(currentUid);
    const isMutedByTime =
      myUserData?.mutedUntil && myUserData.mutedUntil.toDate() > new Date();

    const isBannedGlobally =
      Array.isArray(bannedUids) && bannedUids.includes(currentUid);
    const isBannedByFlag = !!myUserData?.banned;

    if (isMutedGlobally || isMutedByTime) {
      alert("Вы замучены и не можете отправлять сообщения");
      return;
    }

    if (isBannedGlobally || isBannedByFlag) {
      alert("Вы забанены");
      await signOut(auth);
      return;
    }

    try {
      await addDoc(collection(db, "messages"), {
        text,
        type: "text",
        uid: user?.uid,
        displayName: user?.displayName || "Аноним",
        photoURL: user?.photoURL || null,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (err) {
      console.error("Ошибка отправки:", err);
    }
  };

  const uploadFile = async (fileOrBlob, type, caption = "") => {
    try {
      let url;

      if (type === "image") {
        // Загрузка изображения в ImgBB
        const formData = new FormData();
        formData.append("image", fileOrBlob);
        formData.append("key", "bab590d4a15c1417ab47ad6d722b58a2"); // твой ключ

        const response = await fetch("https://api.imgbb.com/1/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error?.message || "Ошибка загрузки в ImgBB");
        }

        url = data.data.url; // прямая ссылка на изображение
        console.log("Фото загружено в ImgBB:", url);
      } else if (type === "audio") {
        // Аудио оставляем в Firebase Storage
        const ext = "webm";
        const path = `chat-files/${Date.now()}.${ext}`;
        const fileRef = ref(storage, path);

        await uploadBytes(fileRef, fileOrBlob);
        url = await getDownloadURL(fileRef);
        console.log("Аудио загружено в Firebase:", url);
      } else {
        throw new Error("Неизвестный тип файла");
      }

      // Сохраняем сообщение в Firestore
      const messageData = {
        fileUrl: url,
        type,
        uid: user?.uid,
        displayName: user?.displayName || "Аноним",
        photoURL: user?.photoURL || null,
        createdAt: serverTimestamp(),
      };

      if (caption.trim()) {
        messageData.caption = caption.trim();
      }

      await addDoc(collection(db, "messages"), messageData);

      console.log("Сообщение с файлом успешно сохранено в Firestore");
    } catch (err) {
      console.error("Ошибка в uploadFile:", err);
      throw err;
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Выберите изображение");
      return;
    }

    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setPendingImage(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmAndSendImage = async () => {
    if (!pendingImage) {
      console.log("Нет pendingImage — ничего не делаем");
      return;
    }

    console.log("Начинаем отправку фото...");
    console.log(
      "Файл:",
      pendingImage.name,
      "Размер:",
      pendingImage.size,
      "Тип:",
      pendingImage.type
    );
    console.log("Подпись:", imageCaption || "(пусто)");

    try {
      console.log("Вызываем uploadFile...");
      await uploadFile(pendingImage, "image", imageCaption);

      console.log("uploadFile успешно завершён");
      alert("Фото успешно отправлено!");
    } catch (err) {
      console.error("ОШИБКА при отправке фото:");
      console.error("Код ошибки:", err.code);
      console.error("Сообщение:", err.message);
      console.error("Полный объект ошибки:", err);

      let errorMessage = "Не удалось отправить фото";

      if (err.code === "permission-denied") {
        errorMessage +=
          "\nНет прав (permission-denied). Проверь правила Firestore и Storage";
      } else if (err.code === "storage/unauthorized") {
        errorMessage += "\nНет прав на загрузку в Storage";
      } else if (err.code?.includes("quota")) {
        errorMessage += "\nПревышена квота Firebase (Storage/Firestore)";
      } else if (err.message?.includes("aborted")) {
        errorMessage += "\nЗапрос прерван (aborted) — попробуй ещё раз";
      }

      alert(errorMessage);
    }

    console.log("Очистка состояний");
    setPendingImage(null);
    setPreviewUrl(null);
    setImageCaption("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  const cancelImage = () => {
    setPendingImage(null);
    setPreviewUrl(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };

  const handleSignOut = async () => {
    try {
      if (user?.uid) {
        await updateDoc(doc(db, "users", user.uid), { online: false });
      }
    } catch {}
    await signOut(auth);
  };

  const handleChangeName = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      alert("Имя не может быть пустым");
      return;
    }

    if (displayName === user?.displayName) {
      setChangeNameMode(false);
      return;
    }

    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName });
      alert("Имя успешно изменено");
      setChangeNameMode(false);
    } catch (err) {
      console.error("Ошибка при смене имени:", err);
      alert("Не удалось изменить имя");
    }
  };

  // ─── Админ-функции ────────────────────────────────────────
  const handleAvatarClick = (e, message) => {
    if (!isAdmin || message.uid === user?.uid) return;
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

  const handleClearChat = async () => {
    if (!window.confirm("Очистить ВЕСЬ чат? Это действие нельзя отменить."))
      return;

    try {
      const messagesCollection = collection(db, "messages");
      const snapshot = await getDocs(messagesCollection);

      if (snapshot.empty) {
        alert("Чат уже пуст");
        return;
      }

      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();

      alert(`Чат очищен (${snapshot.size} сообщений удалено)`);
    } catch (err) {
      console.error("Ошибка очистки чата:", err);
      alert("Не удалось очистить чат\n" + (err.message || ""));
    }
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
          display: "flex", // ← добавляем flex для выравнивания
          alignItems: "center",
          justifyContent: "space-between", // ← важно!
        }}
      >
        {/* Левая часть — кнопка Назад */}
        <button
          onClick={() => {
            // Вариант 1: React Router (самый правильный)
            // navigate("/chats");   // раскомментируйте, если есть useNavigate

            // Вариант 2: если нет роутера — просто переход
            window.location.href = "/chats"; // или "/"; или куда нужно

            // Вариант 3: если это модальное окно/экран в навигации
            // window.history.back();
          }}
          style={{
            background: "transparent",
            border: "none",
            padding: "8px",
            cursor: "pointer",
            color: "#2563eb", // синий как в iOS
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Назад к списку чатов"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
          >
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>

        {/* Центральная часть — название и имя */}
        <div style={{ flex: 1, textAlign: "center" }}>
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
            {user?.displayName || "Аноним"}
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
          {!user?.isAnonymous && (
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
          {/* НОВАЯ КНОПКА — только для админа */}
          {isAdmin && (
            <button
              onClick={handleClearChat}
              title="Очистить весь чат"
              style={{
                padding: "5px 10px",
                background: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.8rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "36px", // чтобы иконка не сжималась
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                height="20"
                width="20"
              >
                <path
                  fill="currentColor"
                  d="M6.525 21c-0.4125 0 -0.7656 -0.1469 -1.05925 -0.44075 -0.29385 -0.29365 -0.44075 -0.64675 -0.44075 -1.05925V5.25H4.75c-0.2125 0 -0.390585 -0.07235 -0.53425 -0.217C4.071915 4.8885 4 4.709335 4 4.4955c0 -0.213665 0.071915 -0.391335 0.21575 -0.533C4.359415 3.820835 4.5375 3.75 4.75 3.75h3.95c0 -0.216665 0.0719 -0.395835 0.21575 -0.5375C9.0594 3.070835 9.2375 3 9.45 3h5.1c0.2125 0 0.39065 0.071835 0.5345 0.2155 0.14365 0.143835 0.2155 0.322 0.2155 0.5345h3.95c0.2125 0 0.39065 0.072335 0.5345 0.217 0.14365 0.1445 0.2155 0.323665 0.2155 0.5375 0 0.213665 -0.07185 0.391335 -0.2155 0.533 -0.14385 0.14165 -0.322 0.2125 -0.5345 0.2125h-0.275V19.5c0 0.4125 -0.14685 0.7656 -0.4405 1.05925 -0.29385 0.29385 -0.647 0.44075 -1.0595 0.44075h-10.95Zm10.95 -15.75h-10.95V19.5h10.95V5.25ZM9.9295 17.35c0.21365 0 0.39135 -0.0719 0.533 -0.21575 0.14165 -0.14365 0.2125 -0.32175 0.2125 -0.53425V8.125c0 -0.2125 -0.07235 -0.39065 -0.217 -0.5345 -0.1445 -0.14365 -0.32365 -0.2155 -0.5375 -0.2155 -0.21365 0 -0.39135 0.07185 -0.533 0.2155 -0.14165 0.14385 -0.2125 0.322 -0.2125 0.5345V16.6c0 0.2125 0.07235 0.3906 0.217 0.53425 0.1445 0.14385 0.32365 0.21575 0.5375 0.21575Zm4.15 0c0.21365 0 0.39135 -0.0719 0.533 -0.21575 0.14165 -0.14365 0.2125 -0.32175 0.2125 -0.53425V8.125c0 -0.2125 -0.07235 -0.39065 -0.217 -0.5345 -0.1445 -0.14365 -0.32365 -0.2155 -0.5375 -0.2155 -0.21365 0 -0.39135 0.07185 -0.533 0.2155 -0.14165 0.14385 -0.2125 0.322 -0.2125 0.5345V16.6c0 0.2125 0.07235 0.3906 0.217 0.53425 0.1445 0.14385 0.32365 0.21575 0.5375 0.21575Z"
                />
              </svg>
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
          const messageUid = m?.uid || "";
          const mine = messageUid === user?.uid;

          const userInfo = usersData[messageUid] || {};

          const isMuted =
            (Array.isArray(mutedUids) && mutedUids.includes(messageUid)) ||
            (userInfo.mutedUntil && userInfo.mutedUntil.toDate() > new Date());

          const isBanned =
            (Array.isArray(bannedUids) && bannedUids.includes(messageUid)) ||
            !!userInfo.banned;

          let nameToShow = m?.displayName || userInfo.displayName || "Аноним";

          if (isMuted) nameToShow += " [muted]";
          if (isBanned) nameToShow += " [banned]";

          const avatarLetter = (nameToShow || "?")[0]?.toUpperCase() || "?";

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
                  onClick={(e) => handleAvatarClick(e, m)}
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
                    cursor: isAdmin ? "pointer" : "default",
                  }}
                >
                  {avatarLetter}
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
                  <div
                    style={{
                      borderRadius: "12px",
                      overflow: "hidden",
                      marginTop: m.type === "text" ? "4px" : "0",
                    }}
                  >
                    <img
                      src={m.fileUrl}
                      alt="фото"
                      style={{
                        width: "100%",
                        height: "auto",
                        display: "block",
                        borderRadius: "inherit",
                      }}
                    />
                    {m.caption && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: mine ? "#dbeafe" : "#4b5563",
                          marginTop: "6px",
                          padding: "0 8px",
                          textAlign: "center",
                        }}
                      >
                        {m.caption}
                      </div>
                    )}
                  </div>
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

      {pendingImage && previewUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "20px",
              maxWidth: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0" }}>Отправить это фото?</h3>

            <img
              src={previewUrl}
              alt="Превью"
              style={{
                maxWidth: "100%",
                maxHeight: "50vh",
                borderRadius: "12px",
                marginBottom: "16px",
                objectFit: "contain",
              }}
            />

            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Сообщение..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              inputMode="text"
              enterKeyHint="send"
              style={{
                flex: 1,
                padding: "10px 14px",
                border: "1px solid #d1d5db",
                borderRadius: "9999px",
                fontSize: "17px", // ← 17px обычно полностью убирает зум
                outline: "none",
                height: "48px", // чуть выше, чтобы выглядело пропорционально
                lineHeight: "1.4",
              }}
            />

            <div
              style={{ display: "flex", gap: "12px", justifyContent: "center" }}
            >
              <button
                onClick={cancelImage}
                style={{
                  padding: "10px 24px",
                  background: "#9ca3af",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                Отмена
              </button>

              <button
                onClick={confirmAndSendImage}
                style={{
                  padding: "10px 24px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Нижняя панель ввода */}
      <form
        ref={inputContainerRef}
        onSubmit={(e) => {
          e.preventDefault(); // ← обязательно!
          if (!text.trim()) return;
          sendMessage(e); // ваша функция
          // НЕ делаем blur() и НЕ снимаем фокус
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          background: "white",
          borderTop: "1px solid #e5e7eb",
          flexShrink: 0,
          minHeight: "36px",
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={handleImageSelect}
          style={{ display: "none" }}
        />

        {/* Кнопка фото слева */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: "8px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          title="Прикрепить файл / фото"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            height="24"
            width="24"
          >
            <path
              fill="currentColor"
              d="M18.2 15.85c0 1.71665 -0.6015 3.17085 -1.8045 4.3625C15.1927 21.40415 13.73435 22 12.0205 22c-1.71365 0 -3.17465 -0.59585 -4.383 -1.7875 -1.2083 -1.19165 -1.8125 -2.64585 -1.8125 -4.3625v-9.5c0 -1.20835 0.4292 -2.235415 1.2875 -3.08125C7.97085 2.422915 9 2 10.2 2s2.2292 0.422915 3.0875 1.26875c0.85835 0.845835 1.2875 1.8729 1.2875 3.08125v9c0 0.7 -0.25 1.3 -0.75 1.8s-1.10415 0.75 -1.8125 0.75c-0.7083 0 -1.3125 -0.24725 -1.8125 -0.74175 -0.5 -0.49465 -0.75 -1.0974 -0.75 -1.80825v-8.5c0 -0.2125 0.07235 -0.39065 0.217 -0.5345 0.1445 -0.14365 0.3237 -0.2155 0.5375 -0.2155 0.2137 0 0.39135 0.07185 0.533 0.2155 0.1417 0.14385 0.2125 0.322 0.2125 0.5345v8.5c0 0.28335 0.1042 0.52915 0.3125 0.7375 0.20835 0.20835 0.4637 0.3125 0.766 0.3125 0.30235 0 0.55235 -0.10415 0.75 -0.3125 0.1977 -0.20835 0.2965 -0.45415 0.2965 -0.7375v-9c0 -0.8 -0.27915 -1.475 -0.8375 -2.025C11.6792 3.775 10.99825 3.5 10.19475 3.5c-0.8035 0 -1.48265 0.2755 -2.0375 0.8265C7.60245 4.8775 7.325 5.552 7.325 6.35v9.5c0 1.3 0.4581 2.4 1.37425 3.3C9.61545 20.05 10.724 20.5 12.025 20.5c1.2987 0 2.4025 -0.45 3.3115 -1.35 0.909 -0.9 1.3635 -2 1.3635 -3.3v-9c0 -0.2125 0.07235 -0.39065 0.217 -0.5345 0.1445 -0.14365 0.3237 -0.2155 0.5375 -0.2155 0.2137 0 0.39135 0.07185 0.533 0.2155 0.1417 0.14385 0.2125 0.322 0.2125 0.5345v9Z"
              strokeWidth="0.5"
            />
          </svg>
        </button>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение..."
          style={{
            flex: 1,
            padding: "4px 10px", // сильно уменьшили padding
            border: "1px solid #d1d5db",
            borderRadius: "9999px",
            fontSize: "0.9rem", // уменьшили шрифт
            outline: "none",
            height: "28px", // ← основная высота input (в 2 раза меньше)
            lineHeight: "1.1",
            boxSizing: "border-box",
          }}
        />

        <button
          type="button" // ← изменили с submit на button
          disabled={!text.trim()}
          onClick={(e) => {
            e.preventDefault(); // предотвращаем submit формы
            e.stopPropagation();
            if (text.trim()) {
              sendMessage(e); // вызываем функцию отправки вручную
            }
          }}
          style={{
            padding: "10px",
            background: text.trim() ? "#2563eb" : "#9ca3af",
            color: "white",
            border: "none",
            borderRadius: "50%",
            cursor: text.trim() ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "30px",
            height: "30px",
            flexShrink: 0,
          }}
          title="Отправить"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            height="24"
            width="24"
          >
            <path
              fill="currentColor"
              d="M20.35 12.7 4.05 19.55c-0.25 0.1 -0.4875 0.0792 -0.7125 -0.0625 -0.225 -0.14165 -0.3375 -0.3458 -0.3375 -0.6125v-13.75c0 -0.26666 0.1125 -0.470825 0.3375 -0.61249 0.225 -0.14167 0.4625 -0.1625 0.7125 -0.0625L20.35 11.3c0.3 0.13335 0.45 0.3667 0.45 0.7 0 0.33335 -0.15 0.5667 -0.45 0.7ZM4.5 17.675 18.1 12 4.5 6.25v4.2L10.55 12 4.5 13.5v4.175Z"
              strokeWidth="0.5"
            />
          </svg>
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
