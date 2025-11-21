import { initializeApp } from "firebase/app";
    import { getAuth, signInAnonymously } from "firebase/auth";
    import { getFirestore, doc, getDoc } from "firebase/firestore";
    import { getStorage } from "firebase/storage";

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
    export { signInAnonymously, doc, getDoc };

    export default app;
