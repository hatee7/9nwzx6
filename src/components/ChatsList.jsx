import React from "react";
import { useNavigate } from "react-router-dom";

export default function ChatsList({ user }) {
  const navigate = useNavigate();

  // Пока захардкодим несколько чатов (потом можно брать из Firestore)
  const availableChats = [
    { id: "general", name: "Общий чат", description: "Для всех участников" },
    {
      id: "random",
      name: "Random / Флуд",
      description: "Обсуждаем всё подряд",
    },
    { id: "support", name: "Поддержка", description: "Вопросы по приложению" },
  ];

  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#f8f9fa",
      }}
    >
      <div
        style={{
          padding: "16px 14px",
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          fontSize: "1.25rem",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        Чаты
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {availableChats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => navigate(`/chat/${chat.id}`)}
            style={{
              padding: "16px 14px",
              background: "white",
              marginBottom: "8px",
              borderRadius: "12px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>
              {chat.name}
            </div>
            <div style={{ fontSize: "0.9rem", color: "#6b7280" }}>
              {chat.description}
            </div>
          </div>
        ))}
      </div>
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
  );
}
