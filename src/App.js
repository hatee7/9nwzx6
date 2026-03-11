import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";

import AuthScreen from "./AuthScreen";
import ChatScreen from "./ChatScreen"; // ← должен существовать

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          padding: "80px 20px",
          textAlign: "center",
          fontSize: "1.2rem",
        }}
      >
        Загрузка...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <ChatScreen user={user} />;
}
