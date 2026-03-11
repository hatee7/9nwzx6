import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDzwE3aGg5p4Cunkm_wu-CjVu3JpqbQIzQ",
  authDomain: "messenger-cd4c3.firebaseapp.com",
  projectId: "messenger-cd4c3",
  storageBucket: "messenger-cd4c3.firebasestorage.app",
  messagingSenderId: "1036624115059",
  appId: "1:1036624115059:web:7f11fe12316b7db35c8106",
  measurementId: "G-VVFZJT4PJB",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
