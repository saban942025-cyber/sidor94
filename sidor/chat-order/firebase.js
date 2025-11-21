// קובץ חיבור מרכזי ל-Firebase
// זה מחליף את הבלוקים החוזרים של initializeApp בכל קובץ HTML
import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signInAnonymously } from "firebase/auth"; // Added imports
import { getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc } from "firebase/firestore"; // Added imports
import { getStorage } from "firebase/storage";

// הקונפיגורציה נלקחת מהמשתנים שהגדרת בקבצים הקודמים
// In a real app, use environment variables (import.meta.env.VITE_FIREBASE_API_KEY etc.)
const firebaseConfig = {
  apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", 
  authDomain: "saban94-78949.firebaseapp.com", 
  projectId: "saban94-78949", 
  storageBucket: "saban94-78949.firebasestorage.app", 
  messagingSenderId: "41553157903", 
  appId: "1:41553157903:web:cc33d252cff023be97a87a"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Exporting common functions to be used in other files if needed, 
// though direct import from firebase/firestore is preferred in modern modular SDK
export { 
    signInWithCustomToken, 
    signInAnonymously,
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    query, 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    deleteDoc 
};

export default app;
