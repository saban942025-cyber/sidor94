
# GEMINI COMMAND: CREATE & WRITE /Zebulun-Portal/app.logic.js — PWA LOGIC MODULE
# ACTION: WRITE CODE DIRECTLY TO CANVAS · STOP REPEATS · ENSURE FILE VISIBLE

גימני — עמוד על המשימה הבאה ללא חזרה או הסבר מילולי.  
מטרת הפעולה: לכתוב ולהציג בקנבס את קובץ הלוגיקה החסר של הלקוח "זבולון עדירן" (Zebulun-Portal).

CONTEXT:
- Project Path: /sidor/Zebulun-Portal/
- Target File: app.logic.js
- Purpose: קובץ הלוגיקה הראשי לאפליקציית ה-PWA של הלקוח "זבולון עדירן" — טיפול בניווט, שליחת הודעות, טעינת פרויקטים, והעלאת קבצים.

INSTRUCTIONS (STRICT):

1️⃣ נקה כל הקשר קודם (context flush) והפעל מצב Canvas Write בלבד.  
2️⃣ צור את הקובץ `/sidor/Zebulun-Portal/app.logic.js` וכתוב לתוכו את הקוד הבא במדויק:

```javascript
// Zebulun-Portal App Logic (v1.0)
// Handles navigation, project management, and message sending for client Yossi (Zebulun Adiran)

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDxxx...",
  authDomain: "deliverymaster.firebaseapp.com",
  projectId: "deliverymaster",
  storageBucket: "deliverymaster.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123xyz"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Global State ---
let currentProject = null;
let currentCustomer = "Zebulun Adiran";

// --- UI Elements ---
const projectContainer = document.getElementById("projectsContainer");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const fileInput = document.getElementById("fileInput");

// --- Initialize ---
window.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Zebulun Portal Loaded");
  await loadProjects();
});

// --- Load Projects ---
async function loadProjects() {
  projectContainer.innerHTML = "<p>Loading projects...</p>";
  const qSnap = await getDocs(collection(db, "projects"));
  projectContainer.innerHTML = "";
  qSnap.forEach((doc) => {
    const proj = doc.data();
    const btn = document.createElement("button");
    btn.className = "project-btn";
    btn.textContent = proj.name;
    btn.onclick = () => openProject(proj);
    projectContainer.appendChild(btn);
  });
}

// --- Open Project Popup ---
function openProject(proj) {
  currentProject = proj;
  const popup = document.getElementById("projectPopup");
  popup.querySelector(".popup-title").textContent = proj.name;
  popup.querySelector(".popup-address").textContent = proj.address || "No address set";
  popup.style.display = "flex";
}

// --- Send Message ---
messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text && !fileInput.files.length) return;

  let fileURL = null;
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const fileRef = ref(storage, `messages/${Date.now()}_${file.name}`);
    await uploadBytes(fileRef, file);
    fileURL = await getDownloadURL(fileRef);
  }

  await addDoc(collection(db, "messages"), {
    customer: currentCustomer,
    project: currentProject?.name || "General",
    text,
    fileURL,
    createdAt: serverTimestamp(),
  });

  messageInput.value = "";
  fileInput.value = "";
  alert("✅ Message sent to DeliveryMaster");
}

// --- Theme Toggle ---
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
});
