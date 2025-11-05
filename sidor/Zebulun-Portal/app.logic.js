// --- Firebase SDK Imports ---
// (הנחה שה-SDKs יובאו ב-index.html)
import { initializeApp, getApp, getApps } from "https.www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged, 
    signInWithCustomToken 
} from "https.www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
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
} from "https.www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
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
let globalLog = []; // For session log export

const state = {
    currentView: 'dashboard',
    theme: 'light',
    filesToUpload: [], // מערך של אובייקטי File
    // נתונים מדומים עבור הפרויקטים של זבולון עדירן
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
    logInfo("DOM loaded. Initializing app...");
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
        logInfo("Firebase Initialized.");
        authenticateUser();
    } catch (error) {
        logError("Firebase Init Error:", error);
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
    
    // כפתור הורדת לוג
    document.getElementById('download-log-btn').addEventListener('click', downloadSessionLog);

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
    window.showOrderDetails = showOrderDetails; // חשיפה עבור לחיצה על היסטוריה
}

/**
 * מטפל באימות משתמש (אנונימי או קיים)
 */
function authenticateUser() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUserId = user.uid;
            logInfo(`User Authenticated: ${currentUserId}`);
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
            logInfo("No user found. Signing in anonymously...");
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
        // בדוק אם הטוקן מוגדר גלובלית ב-index.html
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        logError("Anonymous Sign-In Error:", error);
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
    logInfo(`Navigating to: ${viewId}`);
    
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
            document.getElementById('desktop-detail-content').innerHTML = '<h2>מפה חיה (בבנייה)</h2><p>כאן תוצג מפה עם מיקומי הזמנות פעילות.</p>';
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
    setThemeUI(state.theme);
    logInfo(`Theme changed to: ${state.theme}`);
}

/**
 * מגדיר את ערכת הנושא בטעינה
 */
function setTheme(theme) {
    state.theme = theme;
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    setThemeUI(theme);
}

/**
 * מעדכן את האייקונים והטקסט של כפתורי ערכת הנושא
 */
function setThemeUI(theme) {
    const icon = theme === 'dark' ? 'sun' : 'moon';
    const text = theme === 'dark' ? 'מצב יום' : 'מצב לילה';
    
    document.querySelectorAll('#desktop-theme-toggle i, #mobile-theme-toggle i').forEach(el => {
        if (el) el.setAttribute('data-feather', icon);
    });
    const desktopText = document.querySelector('#desktop-theme-toggle span');
    if (desktopText) desktopText.innerText = text;
    
    feather.replace();
}


// --- Data Loading & Rendering ---

/**
 * טוען נתונים ראשוניים (פרויקטים והיסטוריית הזמנות)
 */
async function loadClientData() {
    logInfo("Loading client data...");
    // בעתיד, נטען את זה מ-Firestore. כרגע משתמשים ב-MOCK.
    // לדוגמה:
    // try {
    //     const q = query(collection(db, "projects"), where("clientId", "==", CLIENT_ID));
    //     const snapshot = await getDocs(q);
    //     state.mockProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    //     logInfo(`Loaded ${state.mockProjects.length} projects from Firestore.`);
    // } catch (e) {
    //     logError("Failed to load projects, using mock data.", e);
    // }
    
    // טעינת היסטוריית הזמנות
    try {
        const q = query(collection(db, "orders"), where("clientId", "==", CLIENT_ID), orderBy("createdAt", "desc"), limit(20));
        const snapshot = await getDocs(q);
        state.orderHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        logInfo(`Loaded ${state.orderHistory.length} order history items.`);
    } catch (error) {
        logError("Failed to load order history:", error);
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
            <button class="btn btn-secondary w-full" onclick="playWelcomeGreeting()">
                <i data-feather="play-circle"></i>
                <span>"היי יוסי, ברוך הבא..."</span>
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
                    <i data-feather="plus"></i>
                    <span>הוסף פרויקט חדש</span>
                </button>
            </div>
        </div>
    `;
    document.getElementById('desktop-detail-content').innerHTML = `
        <h2 class="text-2xl font-bold mb-2">${greeting}, יוסי!</h2>
        <p class="text-lg text-light mb-6">ברוך הבא לפורטל הניהול של זבולון עדירן.</p>
        <div class="glass-card">
            <h3 class="text-xl font-semibold mb-4">מה תרצה לעשות?</h3>
            <div class="grid grid-cols-2 gap-4">
                <button class="btn btn-primary text-base p-6" onclick="navigate('new-order')">
                    <i data-feather="plus-circle"></i>
                    <span>הזמנה חדשה (Smart Paste)</span>
                </button>
                <button class="btn btn-secondary text-base p-6" onclick="navigate('projects')">
                    <i data-feather="briefcase"></i>
                    <span>ניהול הפרויקטים שלי</span>
                </button>
            </div>
        </div>
    `;
    
    feather.replace();
}

/**
 * מחזיר ברכת בוקר/צהריים/ערב טוב
 */
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "בוקר טוב";
    if (hour < 18) return "צהריים טובים";
    return "ערב טוב";
}

/**
 * יוצר כרטיס HTML לפרויקט (למובייל או דסקטופ)
 */
function createProjectCard(project, type = 'mobile') {
    if (type === 'mobile') {
        return `
            <div class="project-card" onclick="openProjectModal('${project.id}')">
                <h4 class="truncate">${project.name}</h4>
                <p class="truncate">${project.address}</p>
            </div>
        `;
    } else {
        // Desktop list item
        return `
            <div class="list-item-card" onclick="openProjectDetails('${project.id}')">
                <h4>${project.name}</h4>
                <p>${project.address}</p>
            </div>
        `;
    }
}

// --- Project Management ---

/**
 * מרנדר את עמוד ניהול הפרויקטים (מובייל ודסקטופ)
 */
function renderProjectsPage() {
    const projectListHTML = state.mockProjects.map(p => `
        <div class="list-item-card ${state.selectedProjectId === p.id ? 'active' : ''}" onclick="openProjectDetails('${p.id}')">
            <h4>${p.name}</h4>
            <p>${p.address}</p>
        </div>
    `).join('');
    
    // מובייל
    document.getElementById('page-projects').innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">ניהול פרויקטים</h2>
            <button class="btn btn-primary" onclick="openNewProjectModal()">
                <i data-feather="plus" class="w-5 h-5"></i>
                <span>חדש</span>
            </button>
        </div>
        <div class="flex flex-col gap-3">
            ${state.mockProjects.map(p => createProjectCard(p, 'mobile')).join('')}
        </div>
    `;
    
    // דסקטופ
    document.getElementById('desktop-list-content').innerHTML = `
        <div class="p-4">
            <button class="btn btn-primary w-full mb-4" onclick="openNewProjectModal()">
                <i data-feather="plus"></i>
                <span>צור פרויקט חדש</span>
            </button>
            <div class="flex flex-col gap-2">
                ${projectListHTML}
            </div>
        </div>
    `;
    
    document.getElementById('desktop-detail-content').innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-center">
            <i data-feather="briefcase" class="w-16 h-16 text-light"></i>
            <h3 class="text-lg font-semibold mt-4">ניהול פרויקטים</h3>
            <p class="text-light">בחר פרויקט מהרשימה לעריכה, או צור פרויקט חדש.</p>
        </div>
    `;
    
    feather.replace();
}

/**
 * פותח מודאל (פופאפ) עם פרטי פרויקט קיים (מובייל)
 */
function openProjectModal(projectId) {
    const project = state.mockProjects.find(p => p.id === projectId);
    if (!project) return;
    
    state.selectedProjectId = projectId;
    
    const content = `
        <div class="space-y-4">
            <div>
                <label class="form-label">שם פרויקט</label>
                <input type="text" id="project-edit-name" class="form-input" value="${project.name}">
            </div>
            <div>
                <label class="form-label">כתובת אספקה</label>
                <input type="text" id="project-edit-address" class="form-input" value="${project.address}">
            </div>
            <div>
                <label class="form-label">איש קשר ראשי (ופלאפון)</label>
                <input type="text" id="project-edit-contact" class="form-input" value="${project.contact}">
            </div>
        </div>
    `;
    
    const footer = `
        <button class="btn btn-danger" onclick="deleteProject('${projectId}')">מחק</button>
        <div class="flex-grow"></div>
        <button class="btn btn-secondary" onclick="closeModal()">ביטול</button>
        <button class="btn btn-primary" onclick="saveProject('${projectId}')">שמור שינויים</button>
    `;
    
    showModal('ערוך פרויקט', content, footer);
}

/**
 * פותח פאנל פרטים (דסקטופ)
 */
function openProjectDetails(projectId) {
    const project = state.mockProjects.find(p => p.id === projectId);
    if (!project) return;
    
    state.selectedProjectId = projectId;
    
    const content = `
        <div class="space-y-4">
            <div>
                <label class="form-label">שם פרויקט</label>
                <input type="text" id="project-edit-name" class="form-input" value="${project.name}">
            </div>
            <div>
                <label class="form-label">כתובת אספקה</label>
                <input type="text" id="project-edit-address" class="form-input" value="${project.address}">
            </div>
            <div>
                <label class="form-label">איש קשר ראשי (ופלאפון)</label>
                <input type="text" id="project-edit-contact" class="form-input" value="${project.contact}">
            </div>
        </div>
    `;
    
    const footer = `
        <button class="btn btn-danger" onclick="deleteProject('${projectId}')">מחק</button>
        <div class="flex-grow"></div>
        <button class="btn btn-primary" onclick="saveProject('${projectId}')">שמור שינויים</button>
    `;

    document.getElementById('desktop-detail-content').innerHTML = `
        <h2 class="text-2xl font-bold mb-6">ערוך פרויקט</h2>
        ${content}
        <div class="flex gap-2 mt-6">
            ${footer}
        </div>
    `;
    feather.replace();
    // עדכון הרשימה כדי להציג 'active'
    renderProjectsPage();
}
window.openProjectDetails = openProjectDetails;

/**
 * פותח מודאל ליצירת פרויקט חדש
 */
function openNewProjectModal() {
    const content = `
        <div class="space-y-4">
            <div>
                <label class="form-label">שם פרויקט</label>
                <input type="text" id="project-new-name" class="form-input" placeholder="לדוגמה: זבולון-עדירן/רמת גן">
            </div>
            <div>
                <label class="form-label">כתובת אספקה</label>
                <input type="text" id="project-new-address" class="form-input" placeholder="רחוב, מספר, עיר">
            </div>
            <div>
                <label class="form-label">איש קשר ראשי (ופלאפון)</label>
                <input type="text" id="project-new-contact" class="form-input" placeholder="שם ומספר">
            </div>
        </div>
    `;
    
    const footer = `
        <button class="btn btn-secondary" onclick="closeModal()">ביטול</button>
        <button class="btn btn-primary" onclick="saveProject()">צור פרויקט</button>
    `;
    
    if (window.innerWidth >= 768) { // בדיקה אם במצב דסקטופ
        document.getElementById('desktop-detail-content').innerHTML = `
            <h2 class="text-2xl font-bold mb-6">פרויקט חדש</h2>
            ${content}
            <div class="flex gap-2 mt-6">
                ${footer}
            </div>
        `;
        feather.replace();
    } else {
        showModal('פרויקט חדש', content, footer);
    }
}

/**
 * שומר פרויקט חדש או קיים (סימולציה)
 */
function saveProject(projectId = null) {
    let project, name, address, contact;
    
    if (projectId) {
        // עריכה
        project = state.mockProjects.find(p => p.id === projectId);
        if (!project) return;
        
        name = document.getElementById('project-edit-name').value;
        address = document.getElementById('project-edit-address').value;
        contact = document.getElementById('project-edit-contact').value;
        
        project.name = name;
        project.address = address;
        project.contact = contact;
    } else {
        // יצירה
        name = document.getElementById('project-new-name').value;
        address = document.getElementById('project-new-address').value;
        contact = document.getElementById('project-new-contact').value;
        
        if (!name || !address) {
            showToast("שם פרויקט וכתובת הם שדות חובה", "error");
            return;
        }
        
        project = {
            id: `proj_${Date.now()}`,
            name,
            address,
            contact,
            customerId: `NEW_${Date.now()}`
        };
        state.mockProjects.push(project);
    }
    
    logInfo("Saving project (simulation):", project);
    showToast("פרויקט נשמר בהצלחה", "success");
    closeModal();
    
    // רענון התצוגה
    if (state.currentView === 'projects') {
        renderProjectsPage();
    } else if (state.currentView === 'dashboard') {
        renderDashboard();
    }
}

/**
 * מוחק פרויקט (סימולציה)
 */
function deleteProject(projectId) {
    if (confirm("האם אתה בטוח שברצונך למחוק פרויקט זה?")) {
        state.mockProjects = state.mockProjects.filter(p => p.id !== projectId);
        logInfo(`Project ${projectId} deleted.`);
        showToast("פרויקט נמחק", "success");
        closeModal();
        // רענון התצוגה
        if (state.currentView === 'projects') {
            renderProjectsPage();
        } else if (state.currentView === 'dashboard') {
            renderDashboard();
        }
    }
}


// --- New Order (Smart Paste) Page ---

/**
 * מרנדר את עמוד ההזמנה החדשה (Smart Paste)
 */
function renderNewOrderPage() {
    const pageContent = `
        <h2 class="text-xl font-bold mb-4">הזמנה חדשה (Smart Paste)</h2>
        <div class="glass-card">
            <p class="text-sm text-light mb-3">
                כאן יוסי (מנהל רכש) יכול להדביק את תוכן ההזמנה המלא ישירות מהמערכת, לצרף קבצים, והמערכת תנתח ותשלח.
            </p>
            
            <form id="smart-order-form" onsubmit="event.preventDefault(); sendSmartOrder(event);">
                <div class="space-y-4">
                    <!-- 1. תיבת ההדבקה -->
                    <div>
                        <label for="smart-paste-box" class="form-label">הדבק את תוכן ההזמנה כאן:</label>
                        <textarea id="smart-paste-box" placeholder="לדוגמה:
לקוח: 5020321 (זבולון-עדירן/חדד)
פרויקט: וינגייט 27, כפר שמריהו
איש קשר: עבד (050-5938716)

הזמנה:
100 בלוק 20
50 מלט
..." onpaste="handlePaste(event)"></textarea>
                    </div>
                    
                    <!-- 2. שדות מנותחים -->
                    <div id="parsed-fields-container" class="hidden space-y-3 p-4 border border-blue-200 bg-primary-light rounded-lg">
                        <h4 class="font-semibold text-primary-dark">פרטים שזוהו:</h4>
                        <div class="grid md:grid-cols-2 gap-3">
                            <div>
                                <label class="form-label text-xs">מזהה לקוח (ID)</label>
                                <input type="text" id="parsed-client-id" class="form-input form-input-sm" placeholder="לא זוהה">
                            </div>
                            <div>
                                <label class="form-label text-xs">שם פרויקט</label>
                                <input type="text" id="parsed-project-name" class="form-input form-input-sm" placeholder="לא זוהה">
                            </div>
                            <div>
                                <label class="form-label text-xs">איש קשר</label>
                                <input type="text" id="parsed-contact-name" class="form-input form-input-sm" placeholder="לא זוהה">
                            </div>
                            <div>
                                <label class="form-label text-xs">טלפון</label>
                                <input type="text" id="parsed-contact-phone" class="form-input form-input-sm" placeholder="לא זוהה">
                            </div>
                        </div>
                    </div>
                    
                    <!-- 3. צירוף קבצים -->
                    <div>
                        <label class="form-label">צרף קבצים, תמונות או מסמכים:</label>
                        <div id="file-drop-area" 
                             ondragover="handleDragOver(event)" 
                             ondragleave="handleDragLeave(event)" 
                             ondrop="handleFileDrop(event)">
                            גרור קבצים לכאן או <span class="text-primary-color font-semibold cursor-pointer" onclick="triggerFileInput()">לחץ לבחירה</span>
                        </div>
                        <input type="file" id="file-input" class="hidden" multiple onchange="handleFileSelect(event)">
                        <div id="preview-container">
                            <!-- תצוגה מקדימה של קבצים תופיע כאן -->
                        </div>
                    </div>
                    
                    <!-- 4. כפתור שליחה -->
                    <div class="pt-4 border-t border-border-color">
                        <button type="submit" id="send-order-btn" class="btn btn-primary w-full text-base py-3">
                            <i data-feather="send"></i>
                            <span>שלח הזמנה</span>
                        </button>
                    </div>
                </div>
            </form>
        </div>
    `;
    
    // מובייל
    document.getElementById('page-new-order').innerHTML = pageContent;
    
    // דסקטופ (משתמש באותו תוכן, אבל בפאנל הימני)
    document.getElementById('desktop-list-content').innerHTML = `
        <div class="p-4">
            <h3 class="text-lg font-semibold mb-2">הזמנות אחרונות</h3>
            <div id="desktop-history-list-small">
                ${renderOrderHistoryList(5)}
            </div>
        </div>
    `;
    document.getElementById('desktop-detail-content').innerHTML = pageContent;
    
    feather.replace();
}

/**
 * מרנדר את עמוד היסטוריית ההזמנות
 */
function renderOrdersHistoryPage() {
    // מובייל
    document.getElementById('page-orders-history').innerHTML = `
        <h2 class="text-xl font-bold mb-4">היסטוריית הזמנות</h2>
        <div id="mobile-history-list">
            ${renderOrderHistoryList()}
        </div>
    `;
    
    // דסקטופ
    document.getElementById('desktop-list-content').innerHTML = `
        <div class="p-4 no-scrollbar">
            ${renderOrderHistoryList()}
        </div>
    `;
    document.getElementById('desktop-detail-content').innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-center">
            <i data-feather="archive" class="w-16 h-16 text-light"></i>
            <h3 class="text-lg font-semibold mt-4">היסטוריית הזמנות</h3>
            <p class="text-light">בחר הזמנה מהרשימה כדי לראות את פרטיה המלאים.</p>
        </div>
    `;
    
    feather.replace();
}

/**
 * יוצר רשימת HTML של היסטוריית הזמנות
 */
function renderOrderHistoryList(count = null) {
    let orders = state.orderHistory;
    if (count) {
        orders = orders.slice(0, count);
    }
    
    if (orders.length === 0) {
        return '<p class="text-light text-center p-4">אין היסטוריית הזמנות.</p>';
    }
    
    return orders.map(order => `
        <div class="list-item-card" onclick="showOrderDetails('${order.id}')">
            <div class="flex justify-between items-center">
                <h4 class="truncate">${order.projectName || 'הזמנה כללית'}</h4>
                <span class="text-xs font-mono text-light">${order.id.slice(0, 8)}...</span>
            </div>
            <p class="text-sm text-light truncate">${order.rawText ? order.rawText.split('\n')[0] : '...'}</p>
            <div class="flex justify-between items-center mt-2">
                <span class="status-badge status-${order.status}">${order.status || 'חדש'}</span>
                <span class="text-xs text-light">${order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('he-IL') : '...'}</span>
            </div>
        </div>
    `).join('');
}

/**
 * מציג פרטי הזמנה (דסקטופ)
 */
function showOrderDetails(orderId) {
    const order = state.orderHistory.find(o => o.id === orderId);
    if (!order) return;
    
    // עדכון הרשימה להצגת הפריט הפעיל
    document.querySelectorAll('#desktop-list-content .list-item-card').forEach(card => {
        card.classList.remove('active');
        if (card.getAttribute('onclick').includes(orderId)) {
            card.classList.add('active');
        }
    });

    const content = `
        <h2 class="text-2xl font-bold mb-4">${order.projectName || 'הזמנה כללית'}</h2>
        
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="glass-card-sm">
                <label class="form-label text-xs">סטטוס</label>
                <p class="font-semibold text-lg status-text-${order.status}">${order.status}</p>
            </div>
            <div class="glass-card-sm">
                <label class="form-label text-xs">תאריך</label>
                <p class="font-semibold">${order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleString('he-IL') : '...'}</p>
            </div>
        </div>

        <div class="glass-card mb-4">
            <h4 class="text-lg font-semibold mb-3">פרטים שזוהו</h4>
            <div class="space-y-2">
                <p><strong>מזהה לקוח:</strong> ${order.projectId || 'לא צוין'}</p>
                <p><strong>איש קשר:</strong> ${order.contactName || 'לא צוין'}</p>
                <p><strong>טלפון:</strong> ${order.contactPhone || 'לא צוין'}</p>
            </div>
        </div>
        
        <div class="glass-card mb-4">
            <h4 class="text-lg font-semibold mb-3">תוכן ההזמנה המקורי</h4>
            <pre class="whitespace-pre-wrap p-4 bg-light rounded-md text-sm">${order.rawText || 'אין'}</pre>
        </div>
        
        <div class="glass-card">
            <h4 class="text-lg font-semibold mb-3">קבצים מצורפים</h4>
            ${order.attachments && order.attachments.length > 0
                ? order.attachments.map(file => `
                    <a href="${file.url}" target="_blank" class="flex items-center gap-2 p-2 rounded-md hover:bg-light">
                        <i data-feather="file-text"></i>
                        <span>${file.name}</span>
                    </a>
                `).join('')
                : '<p class="text-light">לא צורפו קבצים.</p>'
            }
        </div>
    `;
    
    document.getElementById('desktop-detail-content').innerHTML = content;
    feather.replace();
}


// --- Smart Paste Logic ---

/**
 * מטפל באירוע הדבקה בתיבה
 */
function handlePaste(event) {
    try {
        event.preventDefault();
        const text = (event.clipboardData || window.clipboardData).getData('text');
        document.getElementById('smart-paste-box').value = text;
        
        parsePastedText(text);
        
        // [חדש] מנסה לטעון קבצים מלוח העריכה (למשל צילום מסך)
        const files = event.clipboardData.files;
        if (files.length > 0) {
            showToast(`זיהוי תמונה מההדבקה...`, "info");
            handleFiles(files);
        }
    } catch (e) {
        logError("Paste event failed", e);
    }
}

/**
 * מנתח את הטקסט המודבק ומנסה למלא שדות
 */
function parsePastedText(text) {
    if (!text) return;
    
    try {
        // ניסיון לזהות שדות באמצעות ביטויים רגולריים פשוטים
        const clientIdMatch = text.match(/לקוח:\s*(\d+)/);
        const projectNameMatch = text.match(/פרויקט:\s*(.*)/) || text.match(/לקוח:.*?\((.*?)\)/);
        const contactNameMatch = text.match(/איש קשר:\s*([^(\n]+)/);
        const contactPhoneMatch = text.match(/איש קשר:.*?\(([\d-]+)\)/);

        if (clientIdMatch || projectNameMatch || contactNameMatch) {
            document.getElementById('parsed-fields-container').classList.remove('hidden');
            
            if (clientIdMatch) document.getElementById('parsed-client-id').value = clientIdMatch[1].trim();
            if (projectNameMatch) document.getElementById('parsed-project-name').value = projectNameMatch[1].trim();
            if (contactNameMatch) document.getElementById('parsed-contact-name').value = contactNameMatch[1].trim();
            if (contactPhoneMatch) document.getElementById('parsed-contact-phone').value = contactPhoneMatch[1].trim();
        }
    } catch (e) {
        logError("Text parsing failed", e);
    }
}

// --- File Handling ---

function triggerFileInput() {
    document.getElementById('file-input').click();
}

function handleFileSelect(event) {
    handleFiles(event.target.files);
}

function handleDragOver(event) {
    event.preventDefault();
    document.getElementById('file-drop-area').classList.add('dragover');
}

function handleDragLeave(event) {
    document.getElementById('file-drop-area').classList.remove('dragover');
}

function handleFileDrop(event) {
    event.preventDefault();
    document.getElementById('file-drop-area').classList.remove('dragover');
    handleFiles(event.dataTransfer.files);
}

/**
 * מטפל בקבצים שנבחרו או נגררו
 */
function handleFiles(files) {
    const newFiles = [...files];
    state.filesToUpload.push(...newFiles);
    renderFilePreviews();
}

/**
 * מרנדר תצוגה מקדימה של הקבצים שנבחרו
 */
function renderFilePreviews() {
    const container = document.getElementById('preview-container');
    container.innerHTML = ''; // נקה
    
    state.filesToUpload.forEach((file, index) => {
        const preview = document.createElement('div');
        preview.className = 'file-preview';
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.innerHTML = `
                    <img src="${e.target.result}" alt="${file.name}">
                    <button class="remove-file" onclick="removeFile(${index})"><i data-feather="x" class="w-4 h-4"></i></button>
                `;
                feather.replace();
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = `
                <div class="file-icon">
                    <i data-feather="file-text" class="w-8 h-8 text-light"></i>
                </div>
                <button class="remove-file" onclick="removeFile(${index})"><i data-feather="x" class="w-4 h-4"></i></button>
            `;
            feather.replace();
        }
        container.appendChild(preview);
    });
}

/**
 * מסיר קובץ מרשימת ההעלאה
 */
function removeFile(index) {
    state.filesToUpload.splice(index, 1);
    renderFilePreviews();
}
window.removeFile = removeFile; // Expose globally

/**
 * מעלה קבצים ל-Storage ומחזיר רשימת URL-ים
 */
async function uploadFiles(orderId) {
    if (state.filesToUpload.length === 0) {
        return [];
    }
    
    showToast("מעלה קבצים...", "info");
    
    const uploadPromises = state.filesToUpload.map(async (file) => {
        const filePath = `zebulun_orders/${orderId}/${file.name}`;
        const fileRef = ref(storage, filePath);
        
        try {
            const snapshot = await uploadBytes(fileRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            logInfo(`File uploaded: ${file.name}`);
            return { name: file.name, url: downloadURL, path: filePath };
        } catch (error) {
            logError(`File upload failed for ${file.name}:`, error);
            showToast(`שגיאה בהעלאת קובץ: ${file.name}`, "error");
            return null;
        }
    });
    
    const results = await Promise.all(uploadPromises);
    return results.filter(Boolean); // סנן קבצים שנכשלו
}


// --- Order Sending Logic ---

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * מטפל בשליחת הטופס החכם
 */
const sendSmartOrder = debounce(async (event) => {
    if (event) event.preventDefault();
    const btn = document.getElementById('send-order-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader-small"></div> <span>שולח...</span>';
    
    const orderId = generateUUID();
    
    // חסום שליחה כפולה
    if (state.processedOrderIds.has(orderId)) {
        logWarn("Duplicate send blocked", { orderId });
        showToast("הזמנה זו כבר נשלחה.", "error");
        return;
    }

    try {
        // 1. העלאת קבצים (אם יש)
        const attachmentURLs = await uploadFiles(orderId);
        
        // 2. בניית אובייקט ההזמנה
        const rawText = document.getElementById('smart-paste-box').value;
        const parsedFields = {
            clientId: document.getElementById('parsed-client-id').value,
            projectName: document.getElementById('parsed-project-name').value,
            contactName: document.getElementById('parsed-contact-name').value,
            contactPhone: document.getElementById('parsed-contact-phone').value,
        };
        
        const orderPayload = {
            orderId: orderId,
            clientId: CLIENT_ID, // מזהה לקוח ראשי
            projectId: parsedFields.clientId, // שימוש במזהה הלקוח שזוהה כשדה הפרויקט
            projectName: parsedFields.projectName,
            contactName: parsedFields.contactName,
            contactPhone: parsedFields.contactPhone,
            rawText: rawText,
            parsedFields: parsedFields,
            attachments: attachmentURLs,
            createdAt: serverTimestamp(),
            status: "חדש" // סטטוס התחלתי
        };

        // 3. שמירה ב-Firestore
        logInfo("Attempting to write to Firestore...", orderPayload);
        const orderRef = doc(db, "orders", orderId);
        await setDoc(orderRef, orderPayload);
        
        // 4. אישור והדמיית המשך
        state.processedOrderIds.add(orderId);
        state.orderHistory.unshift({ id: orderId, ...orderPayload, createdAt: { seconds: Date.now() / 1000 } }); // הוסף להיסטוריה המקומית
        
        showToast("ההזמנה נשלחה בהצלחה!", "success");
        playPingSound();
        logInfo("Order Sent:", orderPayload);
        
        // איפוס הטופס
        document.getElementById('smart-order-form').reset();
        document.getElementById('parsed-fields-container').classList.add('hidden');
        state.filesToUpload = [];
        renderFilePreviews();
        
        // הדמיית ניתוב
        setTimeout(() => {
            showToast("ההזמנה מנותבת למחלקת הזמנות...", "info");
            navigate('orders-history');
        }, 1500);

    } catch (error) {
        logError("Failed to send order via Firestore:", error);
        showToast(`שגיאה בשליחת הזמנה: ${error.message}`, "error");
        // [TODO] Fallback to WEB_APP_URL_PLACEHOLDER
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-feather="send"></i> <span>שלח הזמנה</span>';
        feather.replace();
    }
}, 1000); // Debounce ל-1 שנייה

// --- Alerts & Sounds ---

/**
 * מאזין לשינויי סטטוס והזמנות חדשות (סימולציה)
 */
function listenForGlobalAlerts() {
    // מאחר וזו אפליקציית לקוח, נאזין רק לשינויים בהזמנות *שלו*
    const q = query(
        collection(db, "orders"), 
        where("clientId", "==", CLIENT_ID),
        orderBy("createdAt", "desc"), // דורש אינדקס
        limit(10) // האזנה רק לשינויים האחרונים
    );
    
    try {
        onSnapshot(q, (snapshot) => {
            logInfo(`Order listener snapshot received (${snapshot.size} docs)`);
            snapshot.docChanges().forEach((change) => {
                if (change.type === "modified" && appInitialized) {
                    const order = change.doc.data();
                    const message = `עדכון סטטוס: הזמנה ${order.projectName || order.orderId.slice(0,6)} כעת ${order.status}`;
                    showToast(message, "info");
                    playPingSound();
                    
                    // רענון היסטוריית הזמנות אם היא פתוחה
                    if (state.currentView === 'orders-history') {
                        loadClientData().then(renderOrdersHistoryPage);
                    }
                }
            });
        }, (error) => {
            logError("Failed to listen for order alerts. Index or permissions issue.", error);
            // לא מציג שגיאה למשתמש, פשוט ממשיך ללא התראות
        });
    } catch (e) {
        logError("Failed to listen for order alerts. Index might be missing.", e);
    }
}

/**
 * מפעיל צליל התראה
 */
function playPingSound() {
    try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
        audio.play();
    } catch (e) {
        logWarn("Audio playback failed.", e);
    }
}

/**
 * מפעיל ברכה קולית (דמו)
 */
function playWelcomeGreeting() {
    try {
        const greeting = "היי יוסי, ברוך הבא לפורטל ההזמנות של זבולון עדירן וחומרי בנין סבן. מכאן תוכל ליצור הזמנות חדשות ולעקוב אחריהן בזמן אמת.";
        const utterance = new SpeechSynthesisUtterance(greeting);
        utterance.lang = 'he-IL';
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
    } catch (e) {
        logError("Speech synthesis failed", e);
        showToast("ההפעלה הקולית נכשלה. ייתכן שהדפדפן שלך לא תומך.", "error");
    }
}
window.playWelcomeGreeting = playWelcomeGreeting;


// --- Modal & Utility Functions ---

/**
 * פותח את המודאל (פופאפ) הראשי
 */
function showModal(title, content, footerContent = null) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = content;
    
    const footer = document.getElementById('modal-footer');
    if (footerContent) {
        footer.innerHTML = footerContent;
        footer.style.display = 'flex';
    } else {
        footer.style.display = 'none';
    }
    
    document.getElementById('modal-overlay').classList.add('visible');
    document.getElementById('main-modal').classList.add('visible');
    feather.replace();
}

/**
 * סוגר את המודאל (פופאפ) הראשי
 */
function closeModal() {
    document.getElementById('modal-overlay').classList.remove('visible');
    document.getElementById('main-modal').classList.remove('visible');
}

/**
 * מציג התראה קופצת (Toast)
 */
function showToast(message, type = "info") {
    const container = document.getElementById("global-alert-container");
    if (!container) return;
    
    const alertBox = document.createElement("div");
    
    let icon = "info";
    let styleClass = "alert-info";
    
    if (type === "error") {
        icon = "alert-triangle";
        styleClass = "alert-error"; // (מוגדר ב-CSS כ-red-500)
    } else if (type === "success") {
        icon = "check-circle";
        styleClass = "alert-success"; // (מוגדר ב-CSS כ-green-500)
    }

    alertBox.className = `global-alert ${styleClass}`;
    alertBox.innerHTML = `<i data-feather="${icon}" class="w-5 h-5"></i><span>${message}</span>`;
    
    container.appendChild(alertBox);
    feather.replace();
    
    // הסר אחרי 4 שניות
    setTimeout(() => {
        alertBox.style.opacity = '0';
        alertBox.style.transform = 'translateY(20px)';
        setTimeout(() => {
            if (alertBox.parentElement === container) {
                container.removeChild(alertBox);
            }
        }, 300);
    }, 4000);
}

/**
 * יוצר מזהה ייחודי
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// --- Logging ---
function logInfo(message, context = {}) {
    console.log(`[INFO] ${message}`, context);
    globalLog.push({ timestamp: new Date().toISOString(), level: "INFO", message, context: JSON.stringify(context) });
}
function logWarn(message, context = {}) {
    console.warn(`[WARN] ${message}`, context);
    globalLog.push({ timestamp: new Date().toISOString(), level: "WARN", message, context: JSON.stringify(context) });
}
function logError(message, error) {
    console.error(`[ERROR] ${message}`, error);
    globalLog.push({ timestamp: new Date().toISOString(), level: "ERROR", message, error: error ? error.message : "Unknown", stack: error ? error.stack : "N/A" });
}

/**
 * מאפשר הורדת לוג של הסשן הנוכחי
 */
function downloadSessionLog() {
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(globalLog, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `zebulun_portal_log_${new Date().toISOString()}.json`);
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast("הורדת הלוג החלה", "success");
    } catch (e) {
        logError("Failed to download session log", e);
        showToast("שגיאה בהורדת הלוג", "error");
    }
}
