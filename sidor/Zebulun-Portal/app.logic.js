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
        apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", 
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
let globalAlertsListener = null;

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
    selectedProjectId: null,
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
    
    // הצגת העמוד הראשי (דשבורד) - יקרה בפועל לאחר אימות
    navigate('dashboard');
    console.log("Initial navigation set to dashboard.");
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
    document.getElementById('nav-desktop-map').addEventListener('click', () => navigate('live-map'));

    // כפתורי ניווט (מובייל)
    document.getElementById('nav-mobile-dashboard').addEventListener('click', () => navigate('dashboard'));
    document.getElementById('nav-mobile-new-order').addEventListener('click', () => navigate('new-order'));
    document.getElementById('nav-mobile-projects').addEventListener('click', () => navigate('projects'));

    // כפתורי ערכת נושא
    document.getElementById('desktop-theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('mobile-theme-toggle').addEventListener('click', toggleTheme);
    
    // חשיפת פונקציות גלובליות לשימוש מתוך HTML (onclick)
    // זה התיקון הקריטי לשגיאות `Maps is not defined`
    window.navigate = navigate;
    window.openProjectModal = openProjectModal;
    window.openNewProjectModal = openNewProjectModal;
    window.saveProject = saveProject;
    window.closeModal = closeModal;
    window.sendSmartOrder = debounce(sendSmartOrder, 1000); // Debounce למניעת לחיצות כפולות
    window.handlePaste = handlePaste;
    window.triggerFileInput = triggerFileInput;
    window.handleFileSelect = handleFileSelect;
    window.handleDragOver = handleDragOver;
    window.handleDragLeave = handleDragLeave;
    window.handleFileDrop = handleFileDrop;
    window.removeFile = removeFile;
    window.toggleTheme = toggleTheme;
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
                
                // הסתר טעינה
                const loader = document.getElementById('app-loader');
                if (loader) {
                    loader.style.opacity = '0';
                    setTimeout(() => loader.style.display = 'none', 300);
                }
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
        // הנחה שמשתמש בטוקן אם הוא זמין, אחרת אנונימי
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Authentication Error:", error);
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

// --- Navigation Engine ---

/**
 * מנוע הניווט הראשי של האפליקציה (SPA)
 */
function navigate(viewId) {
    console.log(`Navigating to: ${viewId}`);
    state.currentView = viewId;
    
    // הסתרת כל הדפים (מובייל)
    document.querySelectorAll('#mobile-main-content .app-page').forEach(page => {
        page.classList.remove('active');
    });
    
    // הסתרת כל התכנים (דסקטופ)
    const detailContent = document.getElementById('desktop-detail-content');
    const listContent = document.getElementById('desktop-list-content');
    if (detailContent) detailContent.innerHTML = '';
    if (listContent) listContent.innerHTML = '';

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
    try {
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
                if (detailContent) detailContent.innerHTML = '<h2>מפה חיה (בבנייה)</h2><p>כאן תוצג מפה עם מיקומי נהגים והזמנות פעילות.</p>';
                break;
        }
    } catch (error) {
        console.error(`Failed to render page ${viewId}:`, error);
        showToast(`שגיאה בטעינת עמוד: ${viewId}`, 'error');
    }
    
    // החלפת דף במובייל
    const mobilePage = document.getElementById(`page-${viewId}`);
    if (mobilePage) {
        mobilePage.classList.add('active');
    }
    
    feather.replace(); // רענון אייקונים
}

// --- Theme Toggle ---

/**
 * מחליף בין מצב בהיר לכהה
 */
function toggleTheme() {
    state.theme = document.documentElement.classList.toggle('dark') ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    
    const icon = state.theme === 'dark' ? 'sun' : 'moon';
    const themeText = state.theme === 'dark' ? 'מצב יום' : 'מצב לילה';
    
    document.querySelectorAll('#desktop-theme-toggle i, #mobile-theme-toggle i').forEach(el => {
        el.setAttribute('data-feather', icon);
    });
    const desktopSpan = document.getElementById('desktop-theme-toggle span');
    if (desktopSpan) desktopSpan.innerText = themeText;
    
    feather.replace();
}

/**
 * קובע את ערכת הנושא בטעינה
 */
function setTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    state.theme = theme;
    
    const icon = theme === 'dark' ? 'sun' : 'moon';
    const themeText = theme === 'dark' ? 'מצב יום' : 'מצב לילה';

    document.querySelectorAll('#desktop-theme-toggle i, #mobile-theme-toggle i').forEach(el => {
        el.setAttribute('data-feather', icon);
    });
    const desktopSpan = document.getElementById('desktop-theme-toggle span');
    if (desktopSpan) desktopSpan.innerText = themeText;

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
    if (mobileContainer) {
        mobileContainer.innerHTML = `
            <div class="glass-card mb-4">
                <h2 class="text-xl font-bold">${greeting}, יוסי!</h2>
                <p class="text-sm text-light">ברוך הבא לפורטל ההזמנות האישי שלך.</p>
            </div>
            
            <h3 class="text-lg font-semibold mb-3">הפרויקטים שלי</h3>
            <div class="project-grid">
                ${state.mockProjects.map(p => createProjectCard(p)).join('')}
                <div class="add-project-card" onclick="openNewProjectModal()">
                    <i data-feather="plus" class="w-8 h-8"></i>
                    <span class="font-semibold mt-1">הוסף פרויקט חדש</span>
                </div>
            </div>
            
            <div class="glass-card mt-6">
                <h4 class="font-semibold mb-2">הדרכה קולית</h4>
                <p class="text-sm text-light mb-3">לחץ לשמיעת הסבר קצר על הפורטל.</p>
                <button class="btn btn-secondary w-full" disabled>
                    <i data-feather="play-circle"></i>
                    <span>"היי יוסי, ברוך הבא..." (בקרוב)</span>
                </button>
            </div>
        `;
    }
    
    // תוכן דסקטופ
    const desktopList = document.getElementById('desktop-list-content');
    const desktopDetail = document.getElementById('desktop-detail-content');
    
    if (desktopList) {
        desktopList.innerHTML = `
            <div class="p-4">
                <h3 class="text-lg font-semibold mb-3">הזמנות אחרונות</h3>
                ${renderOrderHistoryList(5)}
            </div>
        `;
    }
    if (desktopDetail) {
        desktopDetail.innerHTML = `
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
    }
    
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
 * יוצר כרטיס HTML לפרויקט (עבור מובייל)
 */
function createProjectCard(project) {
    return `
        <div class="project-card" onclick="openProjectModal('${project.id}')">
            <h4 class="truncate">${project.name}</h4>
            <p class="truncate">${project.address}</p>
        </div>
    `;
}

// --- Project Management ---

/**
 * מרנדר את עמוד ניהול הפרויקטים (מובייל ודסקטופ)
 */
function renderProjectsPage() {
    const projectListHTML = state.mockProjects.map(p => `
        <div class="list-item-card ${state.selectedProjectId === p.id ? 'active' : ''}" onclick="openProjectModal('${p.id}', true)">
            <h4>${p.name}</h4>
            <p>${p.address}</p>
        </div>
    `).join('');
    
    // מובייל
    const mobilePage = document.getElementById('page-projects');
    if (mobilePage) {
        mobilePage.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold">ניהול פרויקטים</h2>
                <button class="btn btn-primary" onclick="openNewProjectModal()">
                    <i data-feather="plus" class="w-5 h-5"></i>
                    <span>חדש</span>
                </button>
            </div>
            <div class="flex flex-col gap-3">
                ${state.mockProjects.map(p => createProjectCard(p)).join('')}
            </div>
        `;
    }
    
    // דסקטופ
    const desktopList = document.getElementById('desktop-list-content');
    const desktopDetail = document.getElementById('desktop-detail-content');
    
    if (desktopList) {
        desktopList.innerHTML = `
            <div class="p-4">
                <button class="btn btn-primary w-full" onclick="openNewProjectModal()">
                    <i data-feather="plus"></i>
                    <span>צור פרויקט חדש</span>
                </button>
            </div>
            <div class="flex flex-col gap-2 p-2">${projectListHTML}</div>
        `;
    }
    
    if (desktopDetail) {
        desktopDetail.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center">
                <i data-feather="briefcase" class="w-16 h-16 text-light"></i>
                <h3 class="text-lg font-semibold mt-4">ניהול פרויקטים</h3>
                <p class="text-light">בחר פרויקט מהרשימה לעריכה, או צור פרויקט חדש.</p>
            </div>
        `;
    }
    feather.replace();
}

/**
 * פותח מודאל (פופאפ) עם פרטי פרויקט קיים
 */
function openProjectModal(projectId, isDesktop = false) {
    const project = state.mockProjects.find(p => p.id === projectId);
    if (!project) return;
    
    state.selectedProjectId = projectId;
    
    const contentHTML = `
        <form id="project-form" class="space-y-4">
            <input type="hidden" id="project-id" value="${project.id}">
            <div>
                <label class="form-label" for="project-name">שם פרויקט</label>
                <input type="text" id="project-name" class="form-input" value="${project.name}" required>
            </div>
            <div>
                <label class="form-label" for="project-address">כתובת אספקה</label>
                <input type="text" id="project-address" class="form-input" value="${project.address}" required>
            </div>
            <div>
                <label class="form-label" for="project-contact">איש קשר (כולל טלפון)</label>
                <input type="text" id="project-contact" class="form-input" value="${project.contact}">
            </div>
        </form>
    `;
    
    const footerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">ביטול</button>
        <button class="btn btn-primary" onclick="saveProject()">
            <i data-feather="save"></i> <span>שמור שינויים</span>
        </button>
        <button class="btn btn-danger ml-auto" onclick="deleteProject('${project.id}')">
            <i data-feather="trash-2"></i>
        </button>
    `;

    if (isDesktop && window.innerWidth >= 768) {
        // במצב דסקטופ, הצג בפאנל הצדדי
        document.getElementById('desktop-detail-content').innerHTML = `
            <h2 class="text-2xl font-bold mb-4">עריכת פרויקט</h2>
            ${contentHTML}
            <div class="mt-6 pt-4 border-t border-border-color flex gap-2">
                ${footerHTML}
            </div>
        `;
        // סמן כפעיל ברשימה
        document.querySelectorAll('#desktop-list-content .list-item-card').forEach(el => el.classList.remove('active'));
        const activeCard = document.querySelector(`#desktop-list-content .list-item-card[onclick*="'${projectId}'"]`);
        if (activeCard) activeCard.classList.add('active');
        feather.replace();
    } else {
        // במצב מובייל, פתח מודאל
        openModal(`עריכת פרויקט: ${project.name}`, contentHTML, footerHTML);
    }
}

/**
 * פותח מודאל ליצירת פרויקט חדש
 */
function openNewProjectModal() {
    const contentHTML = `
        <form id="project-form" class="space-y-4">
            <input type="hidden" id="project-id" value="new">
            <div>
                <label class="form-label" for="project-name">שם פרויקט</label>
                <input type="text" id="project-name" class="form-input" placeholder="לדוגמה: בניין חדד" required>
            </div>
            <div>
                <label class="form-label" for="project-address">כתובת אספקה</label>
                <input type="text" id="project-address" class="form-input" placeholder="כתובת מלאה" required>
            </div>
            <div>
                <label class="form-label" for="project-contact">איש קשר (כולל טלפון)</label>
                <input type="text" id="project-contact" class="form-input" placeholder="לדוגמה: עבד (050-1234567)">
            </div>
        </form>
    `;
    
    const footerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">ביטול</button>
        <button class="btn btn-primary" onclick="saveProject()">
            <i data-feather="save"></i> <span>שמור פרויקט</span>
        </button>
    `;
    
    if (window.innerWidth >= 768) {
        // דסקטופ
        document.getElementById('desktop-detail-content').innerHTML = `
            <h2 class="text-2xl font-bold mb-4">פרויקט חדש</h2>
            ${contentHTML}
            <div class="mt-6 pt-4 border-t border-border-color flex gap-2">
                ${footerHTML}
            </div>
        `;
        feather.replace();
    } else {
        // מובייל
        openModal("פרויקט חדש", contentHTML, footerHTML);
    }
}

/**
 * שומר פרויקט חדש או קיים (סימולציה)
 */
function saveProject() {
    const id = document.getElementById('project-id').value;
    const name = document.getElementById('project-name').value;
    const address = document.getElementById('project-address').value;
    const contact = document.getElementById('project-contact').value;
    
    if (!name || !address) {
        showToast("שם פרויקט וכתובת הם שדות חובה", "error");
        return;
    }
    
    if (id === 'new') {
        // צור פרויקט חדש (סימולציה)
        const newProject = {
            id: `proj_${Date.now()}`,
            name,
            address,
            contact,
            customerId: CLIENT_ID // שיוך ללקוח הראשי
        };
        state.mockProjects.push(newProject);
        console.log("Creating new project (simulation):", newProject);
        // TODO: addDoc(collection(db, "projects"), newProject);
    } else {
        // עדכן פרויקט קיים (סימולציה)
        const index = state.mockProjects.findIndex(p => p.id === id);
        if (index !== -1) {
            state.mockProjects[index] = { ...state.mockProjects[index], name, address, contact };
            console.log("Updating project (simulation):", state.mockProjects[index]);
            // TODO: updateDoc(doc(db, "projects", id), { name, address, contact });
        }
    }
    
    showToast("הפרויקט נשמר בהצלחה", "success");
    closeModal();
    renderProjectsPage(); // רענון התצוגה
}

/**
 * מוחק פרויקט (סימולציה)
 */
function deleteProject(projectId) {
    if (confirm(`האם אתה בטוח שברצונך למחוק פרויקט זה?`)) {
        state.mockProjects = state.mockProjects.filter(p => p.id !== projectId);
        console.log(`Project ${projectId} deleted (simulation)`);
        // TODO: deleteDoc(doc(db, "projects", projectId));
        showToast("הפרויקט נמחק", "info");
        closeModal();
        navigate('projects'); // רענון התצוגה
    }
}

// --- Smart Paste Order ---

/**
 * מרנדר את עמוד "הזמנה חדשה"
 */
function renderNewOrderPage() {
    const pageContent = `
        <div class="glass-card">
            <h2 class="text-xl font-bold mb-2">הזמנה חדשה (Smart Paste)</h2>
            <p class="text-sm text-light mb-4">
                יוסי, הדבק כאן את תוכן ההזמנה המלא שקיבלת מהאתר או מהמנהל.
                המערכת תנסה לנתח את הפרטים אוטומטית.
            </p>
            
            <form id="smart-order-form" onsubmit="event.preventDefault(); sendSmartOrder();">
                <!-- 1. תיבת הדבקה -->
                <div>
                    <label class="form-label" for="smart-paste-box">הדבק תוכן הזמנה:</label>
                    <textarea id="smart-paste-box" onpaste="handlePaste(event)" placeholder="...הדבק כאן..."></textarea>
                </div>
                
                <!-- 2. ניתוח אוטומטי (יופיע לאחר הדבקה) -->
                <div id="parsed-fields-container" class="space-y-3 my-4 p-4 border border-border-color rounded-lg bg-light" style="display:none;">
                    <h4 class="font-semibold">פרטים שזוהו (ניתן לערוך):</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label class="form-label" for="parsed-name">שם איש קשר</label>
                            <input type="text" id="parsed-name" class="form-input" placeholder="לדוגמה: יוסי">
                        </div>
                        <div>
                            <label class="form-label" for="parsed-phone">טלפון</label>
                            <input type="text" id="parsed-phone" class="form-input" placeholder="לדוגמה: 050-...">
                        </div>
                    </div>
                    <div>
                        <label class="form-label" for="parsed-project">שם פרויקט</label>
                        <input type="text" id="parsed-project" class="form-input" placeholder="לדוגמה: זבולון-עדירן/חדד">
                    </div>
                </div>
                
                <!-- 3. צירוף קבצים -->
                <div class="mt-4">
                    <label class="form-label">צרף קבצים, תמונות או מסמכים:</label>
                    <div id="file-drop-area" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleFileDrop(event)">
                        גרור קבצים לכאן או 
                        <span class="text-primary-color font-semibold cursor-pointer" onclick="triggerFileInput()">
                            בחר קבצים
                        </span>
                        <input type="file" id="file-input" multiple onchange="handleFileSelect(event)" class="hidden">
                    </div>
                    <div id="preview-container"></div>
                </div>
                
                <!-- 4. שליחה -->
                <div class="mt-6 text-left">
                    <button type="submit" id="send-order-btn" class="btn btn-primary btn-lg w-full md:w-auto">
                        <i data-feather="send"></i>
                        <span>שלח הזמנה למערכת</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    // מובייל
    const mobilePage = document.getElementById('page-new-order');
    if (mobilePage) mobilePage.innerHTML = pageContent;
    
    // דסקטופ
    const desktopList = document.getElementById('desktop-list-content');
    const desktopDetail = document.getElementById('desktop-detail-content');
    
    if (desktopList) {
        desktopList.innerHTML = `
            <div class="p-4">
                <h3 class="text-lg font-semibold mb-3">הזמנות אחרונות</h3>
                ${renderOrderHistoryList(10)}
            </div>
        `;
    }
    if (desktopDetail) desktopDetail.innerHTML = pageContent;
    
    // הפעלת מאזינים לגרירת קבצים
    const dropArea = document.getElementById('file-drop-area');
    if (dropArea) {
        dropArea.addEventListener('dragover', handleDragOver);
        dropArea.addEventListener('dragleave', handleDragLeave);
        dropArea.addEventListener('drop', handleFileDrop);
    }
    
    feather.replace();
}

/**
 * מרנדר את עמוד היסטוריית ההזמנות
 */
function renderOrdersHistoryPage() {
    const historyHTML = renderOrderHistoryList();

    // מובייל
    const mobilePage = document.getElementById('page-orders-history');
    if (mobilePage) {
        mobilePage.innerHTML = `
            <h2 class="text-xl font-bold mb-4">היסטוריית הזמנות</h2>
            ${historyHTML}
        `;
    }
    
    // דסקטופ
    const desktopList = document.getElementById('desktop-list-content');
    const desktopDetail = document.getElementById('desktop-detail-content');

    if (desktopList) desktopList.innerHTML = historyHTML;
    if (desktopDetail) {
        desktopDetail.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center">
                <i data-feather="archive" class="w-16 h-16 text-light"></i>
                <h3 class="text-lg font-semibold mt-4">היסטוריית הזמנות</h3>
                <p class="text-light">בחר הזמנה מהרשימה כדי לראות פרטים מלאים.</p>
            </div>
        `;
    }
    feather.replace();
}

/**
 * מחזיר HTML של רשימת הזמנות
 */
function renderOrderHistoryList(count = state.orderHistory.length) {
    if (state.orderHistory.length === 0) {
        return '<p class="text-light text-center p-4">אין היסטוריית הזמנות.</p>';
    }
    
    return state.orderHistory.slice(0, count).map(order => `
        <div class="list-item-card" onclick="showOrderDetail('${order.id}')">
            <h4>${order.projectName || 'הזמנה כללית'}</h4>
            <p>${order.status || 'חדש'} - ${new Date(order.createdAt?.toDate ? order.createdAt.toDate() : Date.now()).toLocaleDateString('he-IL')}</p>
        </div>
    `).join('');
}

/**
 * מציג פרטי הזמנה (דסקטופ)
 */
function showOrderDetail(orderId) {
    const order = state.orderHistory.find(o => o.id === orderId);
    if (!order) return;
    
    const desktopDetail = document.getElementById('desktop-detail-content');
    if (!desktopDetail) return;

    desktopDetail.innerHTML = `
        <h2 class="text-2xl font-bold mb-4">${order.projectName || 'הזמנה'}</h2>
        <p><strong>סטטוס:</strong> ${order.status}</p>
        <p><strong>תאריך:</strong> ${new Date(order.createdAt?.toDate()).toLocaleString('he-IL')}</p>
        <p><strong>איש קשר:</strong> ${order.contactName || 'לא צוין'}</p>
        <p><strong>טלפון:</strong> ${order.contactPhone || 'לא צוין'}</p>
        
        <h3 class="text-xl font-semibold mt-6 mb-2">תוכן ההזמנה</h3>
        <pre class="glass-card p-4 text-sm whitespace-pre-wrap">${order.rawText || 'אין תוכן'}</pre>
        
        <h3 class="text-xl font-semibold mt-6 mb-2">קבצים מצורפים</h3>
        ${(order.attachments && order.attachments.length > 0) 
            ? order.attachments.map(f => `<a href="${f.url}" target="_blank" class="block text-primary-color">${f.name}</a>`).join('')
            : '<p>אין קבצים מצורפים.</p>'
        }
    `;
}

// --- Smart Paste Logic ---

/**
 * מטפל באירוע הדבקה בתיבה
 */
function handlePaste(event) {
    const paste = (event.clipboardData || window.clipboardData).getData('text');
    if (paste) {
        document.getElementById('parsed-fields-container').style.display = 'block';
        parsePastedText(paste);
    }
}

/**
 * מנסה לנתח את הטקסט המודבק (היוריסטיקה פשוטה)
 */
function parsePastedText(text) {
    let name = text.match(/איש קשר:\s*(.*)/i)?.[1] || '';
    let phone = text.match(/טלפון:\s*(.*)/i)?.[1] || '';
    let project = text.match(/פרויקט:\s*(.*)/i)?.[1] || '';
    
    if (!name) name = text.match(/שם:\s*(.*)/i)?.[1] || '';
    
    document.getElementById('parsed-name').value = name.trim();
    document.getElementById('parsed-phone').value = phone.trim();
    document.getElementById('parsed-project').value = project.trim();
}

// --- File Handling Logic ---

function triggerFileInput() {
    document.getElementById('file-input').click();
}

function handleFileSelect(event) {
    addFiles(event.target.files);
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('dragover');
}

function handleFileDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    addFiles(event.dataTransfer.files);
}

function addFiles(files) {
    for (const file of files) {
        if (state.filesToUpload.length >= 5) {
            showToast("ניתן להעלות עד 5 קבצים", "error");
            break;
        }
        state.filesToUpload.push(file);
    }
    renderFilePreviews();
}

function renderFilePreviews() {
    const container = document.getElementById('preview-container');
    container.innerHTML = '';
    
    state.filesToUpload.forEach((file, index) => {
        const previewEl = document.createElement('div');
        previewEl.className = 'file-preview';
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewEl.innerHTML = `
                    <img src="${e.target.result}" alt="${file.name}">
                    <div class="remove-file" onclick="removeFile(${index})"><i data-feather="x" class="w-4 h-4"></i></div>
                `;
                feather.replace();
            };
            reader.readAsDataURL(file);
        } else {
            previewEl.innerHTML = `
                <div class="file-icon">
                    <i data-feather="file-text" class="w-8 h-8 text-light"></i>
                </div>
                <div class="remove-file" onclick="removeFile(${index})"><i data-feather="x" class="w-4 h-4"></i></div>
            `;
            feather.replace();
        }
        container.appendChild(previewEl);
    });
}

function removeFile(index) {
    state.filesToUpload.splice(index, 1);
    renderFilePreviews();
}

/**
 * מעלה קבצים (סימולציה) ומחזיר מערך של URL-ים
 * @returns {Promise<Array<{name: string, url: string}>>}
 */
async function uploadFiles(orderId) {
    if (state.filesToUpload.length === 0) return [];
    
    const uploadPromises = state.filesToUpload.map(async (file) => {
        try {
            // החלף בלוגיקת העלאה אמיתית ל-Firebase Storage
            const fileRef = ref(storage, `zebulun_orders/${orderId}/${file.name}`);
            const snapshot = await uploadBytes(fileRef, file);
            const url = await getDownloadURL(snapshot.ref);
            
            console.log(`File uploaded: ${file.name} -> ${url}`);
            return { name: file.name, url: url };
            
        } catch (error) {
            console.error(`Failed to upload file ${file.name}:`, error);
            showToast(`שגיאה בהעלאת קובץ: ${file.name}`, 'error');
            return null; // החזר null במקרה של שגיאה
        }
    });

    // המתן לכל ההעלאות וסנן כשלונות
    const results = await Promise.all(uploadPromises);
    return results.filter(result => result !== null);
}


// --- Order Sending Logic ---

/**
 * מתחיל את תהליך שליחת ההזמנה (כפתור ראשי)
 */
async function sendSmartOrder() {
    const btn = document.getElementById('send-order-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader-small"></div> <span>שולח...</span>';
    
    const rawText = document.getElementById('smart-paste-box').value;
    if (rawText.trim().length === 0 && state.filesToUpload.length === 0) {
        showToast("חובה להדביק תוכן הזמנה או לצרף קובץ", "error");
        resetSendButton(btn);
        return;
    }
    
    const orderId = `ZEB-${Date.now()}`; // מזהה ייחודי
    
    // 1. העלאת קבצים
    let attachmentURLs = [];
    try {
        attachmentURLs = await uploadFiles(orderId);
    } catch (error) {
        console.error("File upload failed:", error);
        showToast("שגיאה קריטית בהעלאת קבצים. ההזמנה לא נשלחה.", "error");
        resetSendButton(btn);
        return;
    }

    // 2. בניית אובייקט ההזמנה
    const orderPayload = {
        orderId: orderId,
        clientId: CLIENT_ID,
        projectId: document.getElementById('parsed-project').value || null,
        projectName: document.getElementById('parsed-project').value || "לא שויך לפרויקט",
        contactName: document.getElementById('parsed-name').value || "יוסי (ראשי)",
        contactPhone: document.getElementById('parsed-phone').value || "לא צוין",
        rawText: rawText,
        attachments: attachmentURLs,
        createdAt: serverTimestamp(),
        status: "חדש" // סטטוס התחלתי
    };

    // 3. שמירה ב-Firestore
    try {
        await sendOrderToFirestore(orderPayload);
        
        // הצלחה
        showToast("ההזמנה נשלחה בהצלחה!", "success");
        playAlert("הזמנה חדשה נשלחה", "info");
        state.orderHistory.unshift(orderPayload); // הוסף להיסטוריה המקומלית
        resetNewOrderForm();
        navigate('orders-history'); // עבור להיסטוריה
        
    } catch (error) {
        console.error("Firestore send failed:", error);
        showToast("שגיאה בשליחה ל-Firestore. מנסה גיבוי...", "error");
        
        // 4. נסה גיבוי (Fallback)
        try {
            await sendOrderToWebApp(orderPayload);
            showToast("ההזמנה נשלחה בגיבוי!", "success");
            resetNewOrderForm();
        } catch (webAppError) {
            console.error("WebApp fallback failed:", webAppError);
            showToast("שליחת ההזמנה נכשלה סופית.", "error");
        }
    } finally {
        resetSendButton(btn);
    }
}

function resetSendButton(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = '<i data-feather="send"></i> <span>שלח הזמנה למערכת</span>';
    feather.replace();
}

function resetNewOrderForm() {
    const pasteBox = document.getElementById('smart-paste-box');
    const parsedName = document.getElementById('parsed-name');
    const parsedPhone = document.getElementById('parsed-phone');
    const parsedProject = document.getElementById('parsed-project');
    const parsedContainer = document.getElementById('parsed-fields-container');

    if (pasteBox) pasteBox.value = '';
    if (parsedName) parsedName.value = '';
    if (parsedPhone) parsedPhone.value = '';
    if (parsedProject) parsedProject.value = '';
    if (parsedContainer) parsedContainer.style.display = 'none';
    
    state.filesToUpload = [];
    renderFilePreviews();
}

/**
 * שולח את ההזמנה ל-Firestore
 */
async function sendOrderToFirestore(payload) {
    if (!db) throw new Error("Firestore is not initialized");
    // השתמש ב-orderId המותאם אישית כמזהה המסמך
    const orderRef = doc(db, "orders", payload.orderId);
    await setDoc(orderRef, payload);
    console.log("Order sent to Firestore with ID:", payload.orderId);
}

/**
 * שולח את ההזמנה ל-WebApp (גיבוי)
 */
async function sendOrderToWebApp(payload) {
    // המרת serverTimestamp לאובייקט Date רגיל עבור JSON
    const jsonPayload = { ...payload, createdAt: new Date().toISOString() };
    
    const response = await fetch(WEB_APP_URL_PLACEHOLDER, {
        method: 'POST',
        mode: 'no-cors', // Apps Script בדרך כלל דורש זאת
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'NEW_ORDER', data: jsonPayload })
    });
    
    // במצב no-cors, לא ניתן לקרוא את התגובה, אז פשוט נניח הצלחה
    console.log("Order sent to WebApp (fallback).");
}


// --- Global Alerts & Utils ---

/**
 * מאזין להתראות גלובליות מהמערכת
 */
function listenForGlobalAlerts() {
    if (globalAlertsListener) globalAlertsListener();
    
    try {
        const q = query(
            collection(db, "globalAlerts"),
            orderBy("timestamp", "desc"),
            limit(1) // האזן רק להתראה האחרונה
        );
        
        let initialLoad = true;
        globalAlertsListener = onSnapshot(q, (snapshot) => {
            if (initialLoad) {
                initialLoad = false;
                return; // דלג על טעינה ראשונית
            }
            
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const alert = change.doc.data();
                    playAlert(alert.title, alert.type || 'info');
                }
            });
        }, (error) => {
            console.error("Failed to listen for global alerts:", error);
            // לא להציג שגיאה למשתמש, זה שירות רקע
        });
        
    } catch (error) {
        console.error("Error setting up alert listener:", error);
    }
}

/**
 * מנגן צליל ומציג התראה קופצת
 */
function playAlert(message, type = "info") {
    console.log(`Playing Alert: ${message} (Type: ${type})`);
    
    // 1. צליל
    try {
        const soundUrl = (type === "error" || type === "broadcast")
            ? "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg" 
            : "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
        const audio = new Audio(soundUrl);
        audio.play().catch(e => console.warn("Audio playback blocked by browser."));
    } catch (e) {
        console.warn("Audio playback failed.", e);
    }

    // 2. התראה ויזואלית (פופאפ)
    const container = document.getElementById("global-alert-container");
    const alertBox = document.createElement("div");
    alertBox.className = `global-alert ${type === 'error' ? 'alert-error' : 'alert-info'}`;
    
    const icon = (type === "error") ? "alert-triangle" : "info";
    alertBox.innerHTML = `<i data-feather="${icon}" class="w-5 h-5"></i><span>${message}</span>`;
    
    container.appendChild(alertBox);
    feather.replace();
    
    // הסר אחרי 4 שניות
    setTimeout(() => {
        alertBox.style.opacity = '0';
        alertBox.style.transform = 'translateY(20px)';
        setTimeout(() => alertBox.remove(), 300);
    }, 4000);
}

/**
 * מציג התראת טוסט קטנה
 */
function showToast(message, type = "info") {
    playAlert(message, type); // נשתמש באותה מערכת גלובלית
}

/**
 * פותח את המודאל הראשי
 */
function openModal(title, body, footer) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;
    document.getElementById('modal-overlay').classList.add('visible');
    document.getElementById('main-modal').classList.add('visible');
    feather.replace();
}

/**
 * סוגר את המודאל הראשי
 */
function closeModal() {
    document.getElementById('modal-overlay').classList.remove('visible');
    document.getElementById('main-modal').classList.remove('visible');
    
    // נקה את פאנל הפרטים בדסקטופ אם המודאל נסגר
    if (state.currentView === 'projects') {
        renderProjectsPage();
    }
}

/**
 * Debounce utility to prevent rapid-firing events
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
