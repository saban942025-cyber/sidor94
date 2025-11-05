// --- Firebase SDK Imports ---
// (הנחה שה-SDKs יובאו ב-index.html)
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged, 
    signInWithCustomToken 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    setDoc, 
    updateDoc, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    limit, 
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";

// --- Configuration Placeholders ---
// ודא שהאובייקט __firebase_config מוגדר בקובץ ה-HTML הראשי
const FIREBASE_CONFIG = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {
        apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", // Replace with your actual config
        authDomain: "saban94-78949.firebaseapp.com", 
        projectId: "saban94-78949",
        storageBucket: "saban94-78949.appspot.com", 
        messagingSenderId: "41553157903", 
        appId: "1:41553157903:web:cc33d252cff023be97a87a"
      };

// נקודת קצה חלופית (Fallback) לשליחת הזמנות אם Firestore נכשל
const WEB_APP_URL_PLACEHOLDER = 'YOUR_APPS_SCRIPT_WEB_APP_URL'; 
const CLIENT_ID = "zebulun_adiran"; // מזהה לקוח קבוע עבור פורטל זה

// --- Global App State ---
let db, auth, storage;
let currentUserId = null;
let appInitialized = false;

const state = {
    currentView: 'dashboard',
    theme: 'light',
    filesToUpload: [], // מערך של אובייקטי File
    mockProjects: [
        { id: "proj_1", name: "זבולון-עדירן/דהבני", address: "הגדרות 39, סביון", contact: "עלי (052-3993017)", customerId: "5020317" },
        { id: "proj_2", name: "זבולון-עדירן/חדד", address: "וינגייט 27, כפר שמריהו", contact: "עבד (050-5938716)", customerId: "5020321" },
        { id: "proj_3", name: "זבולון-עדירן/חג'ג'", address: "הנרקיסים 32, כפר שמריהו", contact: "יוסי (050-6610040)", customerId: "620001" },
        { id: "proj_4", name: "זבולון-עדירן/סמדרי", address: "ניצנים 20, כפר סבא", contact: "מיכאל (0523411067)", customerId: "620003" }
    ],
    orderHistory: [],
    processedOrderIds: new Set() // למניעת שליחות כפולות
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initApp);

/**
 * מפעיל את האפליקציה לאחר טעינת ה-DOM
 */
function initApp() {
    console.log("DOM loaded. Initializing app...");
    feather.replace();
    
    // אתחול Firebase
    initFirebase();
    
    // אתחול מאזיני אירועים
    initEventListeners();
    
    // בדיקת ערכת נושא
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
        setTheme(storedTheme);
    } else {
        setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    
    // הצגת העמוד הראשי (דשבורד)
    navigate('dashboard');
}

/**
 * מאתחל את Firebase ומערכת האימות
 */
function initFirebase() {
    try {
        const app = !getApps().length ? initializeApp(FIREBASE_CONFIG) : getApp();
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);
        console.log("Firebase Initialized.");
        authenticateUser();
    } catch (error) {
        console.error("Firebase Init Error:", error);
        showToast("שגיאת התחברות קריטית ל-Firebase", "error");
        document.getElementById('loader-text').innerText = "שגיאת התחברות";
    }
}

/**
 * מחבר את כל מאזיני האירועים הראשיים באפליקציה
 */
function initEventListeners() {
    // כפתורי ניווט (דסקטופ)
    document.getElementById('nav-desktop-dashboard').addEventListener('click', () => navigate('dashboard'));
    document.getElementById('nav-desktop-new-order').addEventListener('click', () => navigate('new-order'));
    document.getElementById('nav-desktop-projects').addEventListener('click', () => navigate('projects'));
    document.getElementById('nav-desktop-history').addEventListener('click', () => navigate('orders-history'));

    // כפתורי ניווט (מובייל)
    document.getElementById('nav-mobile-dashboard').addEventListener('click', () => navigate('dashboard'));
    document.getElementById('nav-mobile-new-order').addEventListener('click', () => navigate('new-order'));
    document.getElementById('nav-mobile-projects').addEventListener('click', () => navigate('projects'));

    // כפתורי ערכת נושא
    document.getElementById('desktop-theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('mobile-theme-toggle').addEventListener('click', toggleTheme);
    
    // חשיפת פונקציות גלובליות לשימוש מתוך HTML (onclick)
    window.openProjectModal = openProjectModal;
    window.openNewProjectModal = openNewProjectModal;
    window.saveProject = saveProject;
    window.closeModal = closeModal;
    window.sendSmartOrder = sendSmartOrder;
    window.handlePaste = handlePaste;
    window.triggerFileInput = triggerFileInput;
    window.handleFileSelect = handleFileSelect;
    window.handleDragOver = handleDragOver;
    window.handleDragLeave = handleDragLeave;
    window.handleFileDrop = handleFileDrop;
    window.navigate = navigate; // חשיפת פונקציית הניווט
}

/**
 * מטפל באימות משתמש (אנונימי או קיים)
 */
function authenticateUser() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            console.log(`User Authenticated: ${currentUserId}`);
            updateAuthStatus(`מחובר (משתמש: ${currentUserId.slice(0, 6)})`);
            
            if (!appInitialized) {
                appInitialized = true;
                await loadClientData(); // טעינת נתונים ראשונית
                navigate('dashboard'); // הצג דשבורד רק לאחר טעינת נתונים
                listenForGlobalAlerts(); // הפעל מאזין להתראות
                document.getElementById('app-loader').style.opacity = '0';
                setTimeout(() => document.getElementById('app-loader').style.display = 'none', 300);
            }
        } else {
            console.log("No user found. Signing in anonymously...");
            updateAuthStatus("מתחבר...");
            signInUser();
        }
    });
}

/**
 * מבצע התחברות אנונימית (או עם טוקן אם קיים)
 */
async function signInUser() {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Anonymous Sign-In Error:", error);
        updateAuthStatus("שגיאת התחברות");
        showToast("שגיאת התחברות. בדוק חיבור רשת.", "error");
    }
}

/**
 * מעדכן את ממשק המשתמש עם סטטוס ההתחברות
 */
function updateAuthStatus(message) {
    const statusElements = [
        document.getElementById('desktop-auth-status'),
        document.getElementById('auth-status')
    ];
    statusElements.forEach(el => { if (el) el.innerText = message; });
}

// --- Navigation ---

/**
 * מנוע הניווט הראשי של האפליקציה (SPA)
 */
function navigate(viewId) {
    state.currentView = viewId;
    console.log(`Navigating to: ${viewId}`);
    
    // הסתרת כל הדפים (מובייל)
    document.querySelectorAll('#mobile-main-content .app-page').forEach(page => {
        page.classList.remove('active');
    });
    
    // הסתרת כל התכנים (דסקטופ)
    document.getElementById('desktop-detail-content').innerHTML = '';
    document.getElementById('desktop-list-content').innerHTML = '';

    // עדכון כפתורי ניווט (דסקטופ)
    document.querySelectorAll('#desktop-nav .desktop-nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.id.includes(viewId)) {
            link.classList.add('active');
        }
    });

    // עדכון כפתורי ניווט (מובייל)
    document.querySelectorAll('#bottom-nav .nav-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id.includes(viewId)) {
            btn.classList.add('active');
        }
    });

    // טעינת התוכן המתאים
    switch (viewId) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'new-order':
            renderNewOrderPage();
            break;
        case 'projects':
            renderProjectsPage();
            break;
        case 'orders-history':
            renderOrdersHistoryPage();
            break;
        case 'live-map':
            // (Placeholder)
            document.getElementById('desktop-detail-content').innerHTML = '<h2>מפה חיה (בבנייה)</h2>';
            break;
    }
    
    // החלפת דף במובייל
    const mobilePage = document.getElementById(`page-${viewId}`);
    if (mobilePage) {
        mobilePage.classList.add('active');
    }
    
    feather.replace();
}

// --- Theme Toggle ---

/**
 * מחליף בין מצב בהיר לכהה
 */
function toggleTheme() {
    state.theme = document.documentElement.classList.toggle('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    
    const icon = state.theme === 'dark' ? 'sun' : 'moon';
    document.querySelectorAll('#desktop-theme-toggle i, #mobile-theme-toggle i').forEach(el => {
        el.setAttribute('data-feather', icon);
    });
    document.getElementById('desktop-theme-toggle span').innerText = state.theme === 'dark' ? 'מצב יום' : 'מצב לילה';
    feather.replace();
}

/**
 * מגדיר את ערכת הנושא בטעינה
 */
function setTheme(theme) {
    state.theme = theme;
    const icon = theme === 'dark' ? 'sun' : 'moon';
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    document.querySelectorAll('#desktop-theme-toggle i, #mobile-theme-toggle i').forEach(el => {
        el.setAttribute('data-feather', icon);
    });
    document.getElementById('desktop-theme-toggle span').innerText = theme === 'dark' ? 'מצב יום' : 'מצב לילה';
    feather.replace();
}


// --- Data Loading & Rendering ---

/**
 * טוען נתונים ראשוניים (פרויקטים והיסטוריית הזמנות)
 */
async function loadClientData() {
    // בעתיד, נטען את זה מ-Firestore. כרגע משתמשים ב-MOCK.
    // לדוגמה:
    // const q = query(collection(db, "projects"), where("clientId", "==", CLIENT_ID));
    // const snapshot = await getDocs(q);
    // state.mockProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // טעינת היסטוריית הזמנות (סימולציה)
    try {
        const q = query(collection(db, "orders"), where("clientId", "==", CLIENT_ID), orderBy("createdAt", "desc"), limit(20));
        const snapshot = await getDocs(q);
        state.orderHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Failed to load order history:", error);
        // ייתכן שחסר אינדקס או הרשאות, נמשיך עם מערך ריק
        state.orderHistory = [];
    }
}

/**
 * מרנדר את עמוד הדשבורד (ברכה + כפתורי פרויקטים)
 */
function renderDashboard() {
    const greeting = getGreeting();
    
    // תוכן מובייל
    const mobileContainer = document.getElementById('page-dashboard');
    mobileContainer.innerHTML = `
        <div class="glass-card mb-4">
            <h2 class="text-xl font-bold">${greeting}, יוסי!</h2>
            <p class="text-sm text-light">ברוך הבא לפורטל ההזמנות האישי שלך.</p>
        </div>
        
        <h3 class="text-lg font-semibold mb-3">הפרויקטים שלי</h3>
        <div class="project-grid">
            ${state.mockProjects.map(p => createProjectCard(p, 'mobile')).join('')}
            <div class="add-project-card" onclick="openNewProjectModal()">
                <i data-feather="plus" class="w-8 h-8"></i>
                <span class="font-semibold mt-1">הוסף פרויקט חדש</span>
            </div>
        </div>
        
        <div class="glass-card mt-6">
            <h4 class="font-semibold mb-2">הדרכה קולית</h4>
            <p class="text-sm text-light mb-3">לחץ לשמיעת הסבר קצר על הפורטל.</p>
            <button class="btn btn-secondary w-full">
                <i data-feather="play-circle"></i>
                <span>"היי יוסי, ברוך הבא..." (בקרוב)</span>
            </button>
        </div>
    `;
    
    // תוכן דסקטופ
    document.getElementById('desktop-list-content').innerHTML = `
        <div class="p-4">
            <h3 class="text-lg font-semibold mb-3">הפרויקטים שלי</h3>
            <div class="flex flex-col gap-2">
                ${state.mockProjects.map(p => createProjectCard(p, 'desktop')).join('')}
                <button class="btn btn-secondary mt-2" onclick="openNewProjectModal()">
                    <i data-feather="
