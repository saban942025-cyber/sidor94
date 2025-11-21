import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// הקונפיגורציה של Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", 
  authDomain: "saban94-78949.firebaseapp.com", 
  projectId: "saban94-78949", 
  storageBucket: "saban94-78949.firebasestorage.app", 
  messagingSenderId: "41553157903", 
  appId: "1:41553157903:web:cc33d252cff023be97a87a"
};

// אתחול האפליקציה
const app = initializeApp(firebaseConfig);

// ייצוא השירותים
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ייצוא פונקציות עזר
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
