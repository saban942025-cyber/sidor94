// --- Firebase SDK Imports ---
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, 
    collection, query, where, Timestamp, runTransaction, getDocs, orderBy, 
    serverTimestamp, limit, writeBatch, arrayUnion
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Global Variables ---
let db, auth;
let currentUserId = null;
let allCustomers = [];
let currentToastTimer = null;
let appInitialized = false;
let currentDeleteCallback = null; // [חדש] לשמירת פונקציית המחיקה

// --- Firebase Config (Placeholder) ---
const fallbackConfig = {
  apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", 
  authDomain: "saban94-78949.firebaseapp.com", 
  projectId: "saban94-78949",
  storageBucket: "saban94-78949.firebasestorage.app", 
  messagingSenderId: "41553157903", 
  appId: "1:41553157903:web:cc33d252cff023be97a87a", 
  measurementId: "G-XV6RZDESSB"
};

// --- Debounce Utility ---
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

// --- Initialization ---
function initApp() {
    try {
        // קביעת התצורה מתוך משתנה גלובלי או שימוש ב-Fallback
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : JSON.stringify(fallbackConfig));
        
        if (!getApps().length) {
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            console.log("Firebase Initialized.");
        } else {
            const app = getApp();
            db = getFirestore(app);
            auth = getAuth(app);
            console.log("Firebase Re-initialized.");
        }
        
        // הגדרת רמת לוגים (שימושי לדיבאג)
        setLogLevel('debug');

        // מאזין לשינויי התחברות
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                document.getElementById('auth-status').innerText = `מחובר: ${currentUserId.slice(0,6)}...`;
                document.getElementById('auth-status').style.color = "#22c55e"; // green
                
                if (!appInitialized) {
                    attachListeners();
                    loadCustomers(); // <-- טעינה ראשונית
                    appInitialized = true;
                    console.log("✅ Customer Manager Loaded.");
                }
            } else {
                // אין משתמש, נסיון התחברות
                document.getElementById('auth-status').innerText = "מתחבר...";
                document.getElementById('auth-status').style.color = "#f97316"; // orange
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Auth Error:", error);
                    document.getElementById('auth-status').innerText = "שגיאת התחברות";
                    document.getElementById('auth-status').style.color = "#ef4444"; // red
                }
            }
        });

    } catch (e) {
        console.error("Firebase Initialization Failed:", e);
        showToast('שגיאת התחברות חמורה ל-Firebase', 'error');
    }
}

function attachListeners() {
    // חיבור מאזין לתיבת החיפוש עם דיבאונס
    document.getElementById('search-input').addEventListener('input', debounce(searchCustomers, 300));
    
    // מאזינים לכפתורי הניווט
    document.getElementById('dashboardBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showToast("דשבורד בבנייה", "info");
    });
    
    document.getElementById('clientsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        loadCustomers(); // טוען מחדש את הלקוחות
    });

    document.getElementById('historyBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showToast("בחר לקוח ספציפי להצגת היסטוריה", "info");
    });

    // כפתורי הודעות ולוגים כבר מקושרים ב-HTML
}

// --- Data Loading & Search ---

/**
 * @required loadCustomers()
 * פונקציה זו "משדרת" - היא משתמשת ב-onSnapshot כדי לקבל עדכונים חיים
 */
async function loadCustomers() {
    const loaderEl = document.getElementById('main-loader');
    const tableContainer = document.querySelector('.table-container');

    loaderEl.classList.remove('hidden');
    tableContainer.classList.add('hidden');

    const q = query(collection(db, "customers"), orderBy("name"));
    
    onSnapshot(q, (snapshot) => {
        allCustomers = [];
        snapshot.forEach(doc => {
            allCustomers.push({ id: doc.id, ...doc.data() });
        });
        
        // לאחר קבלת הנתונים, בצע חיפוש (אם יש ערך בתיבה) או הצג הכל
        searchCustomers(); 
        
        loaderEl.classList.add('hidden');
        tableContainer.classList.remove('hidden');
        document.getElementById('main-title').innerText = `ניהול לקוחות (${allCustomers.length})`;
    }, (error) => {
        console.error("Failed to load customers:", error);
        showToast("שגיאה בטעינת לקוחות", "error");
        document.getElementById('customer-table-body').innerHTML = `<tr><td colspan="6" class="text-center p-8 text-red-500">שגיאה בטעינת לקוחות.</td></tr>`;
        loaderEl.classList.add('hidden');
        tableContainer.classList.remove('hidden');
    });
}

/**
 * @required searchCustomers()
 * מסנן את המערך הגלובלי `allCustomers` ומפעיל רינדור מחדש
 */
function searchCustomers() {
    const search = document.getElementById('search-input').value.toLowerCase();
    
    const filtered = allCustomers.filter(c => 
        (c.name && c.name.toLowerCase().includes(search)) ||
        (c.customerNumber && c.customerNumber.includes(search)) ||
        (c.phone && c.phone.includes(search)) ||
        (c.defaultAddress && c.defaultAddress.toLowerCase().includes(search))
    );
    
    renderCustomerTable(filtered);
}
window.searchCustomers = searchCustomers; // חשיפה גלובלית עבור ה-debounce

// --- Rendering ---

function renderCustomerTable(customersToRender) {
    const tbody = document.getElementById('customer-table-body');
    
    if (customersToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-gray-500">לא נמצאו לקוחות.</td></tr>';
        return;
    }

    tbody.innerHTML = customersToRender.map(customer => {
        // תאריך יצירה (עם fallback)
        const createDate = customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString('he-IL') : 'N/A';
        // סטטוס (עם fallback)
        const status = customer.status || 'פעיל'; 
        let statusClass = 'text-green-500';
        if (status === 'חסום') statusClass = 'text-red-500';
        else if (status === 'ממתין') statusClass = 'text-yellow-500';

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td class="font-mono">${customer.customerNumber || 'N/A'}</td>
                <td class="font-semibold">${customer.name}</td>
                <td>${customer.phone || 'N/A'}</td>
                <td class="${statusClass} font-medium">${status}</td>
                <td>${createDate}</td>
                <td class="action-buttons">
                    <button class="action-btn" title="עריכה" onclick="openCustomerEditor('${customer.id}')">
                        <i data-feather="edit" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn" title="היסטוריית הזמנות" onclick="showCustomerOrders('${customer.id}', '${customer.name}')">
                        <i data-feather="archive" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn" title="יצירת הזמנה חדשה" onclick="openNewOrderModal('${customer.id}', '${customer.name}')">
                        <i data-feather="plus-circle" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn danger" title="מחיקת לקוח" onclick="deleteCustomer('${customer.id}', '${customer.name}')">
                         <i data-feather="trash-2" class="w-5 h-5"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    feather.replace(); // רענון אייקונים
}

// --- UI Actions (Modals, Panels) ---

function openModal(modalId, content = null) {
    const modal = document.getElementById(modalId);
    if (content) {
        modal.innerHTML = content;
    }
    modal.classList.remove('hidden');
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal-content').forEach(modal => modal.classList.add('hidden'));
    document.getElementById('modal-overlay').classList.add('hidden');
    currentDeleteCallback = null; // איפוס קולבק מחיקה
}
window.closeAllModals = closeAllModals; // חשיפה גלובלית

function openDetailsPanel(content) {
    document.getElementById('details-content').innerHTML = content;
    document.getElementById('details-panel').classList.remove('hidden');
    document.querySelector('.glass-wrapper').classList.add('details-open');
    feather.replace(); // רענון אייקונים בפאנל
}

function closeDetailsPanel() {
    document.getElementById('details-panel').classList.add('hidden');
    document.querySelector('.glass-wrapper').classList.remove('details-open');
}
window.closeDetailsPanel = closeDetailsPanel; // חשיפה גלובלית

/**
 * @required editCustomer()
 * פותח את פאנל הצד עם טופס עריכת לקוח
 */
async function openCustomerEditor(customerId) {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        showToast("שגיאה: לא נמצא לקוח", "error");
        return;
    }
    
    // טיפול בהיסטוריית שינויים (auditLog)
    let auditLogHtml = '<li>אין היסטוריית שינויים</li>';
    if (customer.auditLog && Array.isArray(customer.auditLog)) {
        auditLogHtml = customer.auditLog
            .filter(log => log.timestamp) // סינון רשומות ללא חותמת זמן
            .sort((a, b) => { // מיון (החדש ביותר למעלה)
                const timeA = a.timestamp.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
                const timeB = b.timestamp.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
                return timeB - timeA;
            })
            .slice(0, 5) // הצגת 5 שינויים אחרונים
            .map(log => {
                const time = (log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp)).toLocaleString('he-IL');
                let changes = log.action === "Created" ? "נוצר" : Object.keys(log.changes || {}).join(', ');
                return `<li>${time}: ${changes}</li>`;
            }).join('');
    }

    // יצירת תוכן ה-HTML עבור פאנל העריכה
    const content = `
        <div class="p-6">
            <h3 class="text-xl font-semibold mb-4">עריכת לקוח: ${customer.name}</h3>
            <form id="details-edit-form" class="space-y-3">
                <input type="hidden" id="edit-customer-id" value="${customer.id}">
                <div>
                    <label class="block text-sm font-medium">מספר לקוח</label>
                    <input type="text" id="edit-customer-number" class="form-input" value="${customer.customerNumber || ''}">
                </div>
                <div>
                    <label class="block text-sm font-medium">שם לקוח</label>
                    <input type="text" id="edit-customer-name" class="form-input" value="${customer.name || ''}" required>
                </div>
                <div>
                    <label class="block text-sm font-medium">טלפון</label>
                    <input type="tel" id="edit-customer-phone" class="form-input" value="${customer.phone || ''}">
                </div>
                <div>
                    <label class="block text-sm font-medium">כתובת ברירת מחדל</label>
                    <input type="text" id="edit-customer-address" class="form-input" value="${customer.defaultAddress || ''}">
                </div>
                <div>
                    <label class="block text-sm font-medium">סטטוס</label>
                    <select id="edit-customer-status" class="form-input">
                        <option value="פעיל" ${customer.status === 'פעיל' ? 'selected' : ''}>פעיל</option>
                        <option value="ממתין" ${customer.status === 'ממתין' ? 'selected' : ''}>ממתין</option>
                        <option value="חסום" ${customer.status === 'חסום' ? 'selected' : ''}>חסום</option>
                    </select>
                </div>
                <div class="pt-4 border-t">
                    <h4 class="text-sm font-medium text-gray-600 mb-2">היסטוריית שינויים (אחרונים)</h4>
                    <ul id="customer-audit-log" class="text-xs text-gray-500 space-y-1 max-h-24 overflow-y-auto">${auditLogHtml}</ul>
                </div>
                <div class="pt-4 flex justify-end gap-2">
                    <button type="button" class="btn btn-secondary" onclick="closeDetailsPanel()">ביטול</button>
                    <button type="submit" class="btn btn-primary">שמור שינויים</button>
                </div>
            </form>
        </div>
    `;
    openDetailsPanel(content);
    
    // חיבור מאזין לטופס העריכה
    document.getElementById('details-edit-form').addEventListener('submit', saveCustomer);
}
window.openCustomerEditor = openCustomerEditor; // חשיפה גלובלית

/**
 * @required showOrders()
 * פותח מודאל עם היסטוריית הזמנות ללקוח
 */
async function showCustomerOrders(customerId, customerName) {
    if (!customerId) {
        showToast("יש לבחור לקוח להצגת היסטוריה", "info");
        return;
    }
    const content = `
        <div class="modal-form">
            <h3 class="modal-title">היסטוריית הזמנות: ${customerName}</h3>
            <div id="history-modal-content" class="modal-body">
                <div class="loader-container"><div class="loader"></div></div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeAllModals()">סגור</button>
            </div>
        </div>
    `;
    openModal('history-modal', content);
    
    // שליפת ההזמנות
    const q = query(collection(db, "orders"), where("customer.id", "==", customerId), orderBy("createdAt", "desc"), limit(20));
    try {
        const ordersSnap = await getDocs(q);
        
        const contentEl = document.getElementById('history-modal-content');
        if (ordersSnap.empty) {
            contentEl.innerHTML = '<p class="text-center text-gray-500">לא נמצאו הזמנות עבור לקוח זה.</p>';
            return;
        }
        
        contentEl.innerHTML = ordersSnap.docs.map(doc => {
            const order = doc.data();
            const createDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('he-IL') : 'N/A';
            return `
                <div class="p-3 mb-2 border rounded-md">
                    <p><strong>מס' הזמנה:</strong> ${order.order_id || doc.id}</p>
                    <p><strong>תאריך:</strong> ${order.orderDate || createDate}</p>
                    <p><strong>סטטוס:</strong> ${order.status || 'N/A'}</p>
                    <p class="text-sm text-gray-500 truncate"><strong>תוכן:</strong> ${order.notes || '-'}</p>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Failed to fetch orders:", e);
        document.getElementById('history-modal-content').innerHTML = '<p class="text-center text-red-500">שגיאה בטעינת הזמנות.</p>';
    }
}
window.showCustomerOrders = showCustomerOrders; // חשיפה גלובלית

/**
 * @required createOrder() - UI part
 * פותח מודאל ליצירת הזמנה חדשה
 */
function openNewOrderModal(customerId, customerName) {
    const customer = allCustomers.find(c => c.id === customerId);
    
    const content = `
        <form id="details-new-order-form" class="modal-form">
            <h3 class="modal-title">יצירת הזמנה חדשה</h3>
            <div class="modal-body space-y-3">
                <p>עבור לקוח: <strong class="font-semibold">${customerName}</strong></p>
                <input type="hidden" id="new-order-customer-id" value="${customerId}">
                <input type="hidden" id="new-order-customer-name" value="${customerName}">
                
                <div>
                    <label for="new-order-delivery-type" class="block text-sm font-medium">סוג הובלה</label>
                    <select id="new-order-delivery-type" class="form-input" required>
                        <option value="">בחר סוג הובלה</option>
                        <option value="משאית">משאית</option>
                        <option value="מנוף">מנוף</option>
                        <option value="איסוף עצמי">איסוף עצמי</option>
                    </select>
                </div>

                <div>
                    <label for="new-order-address" class="block text-sm font-medium">כתובת</label>
                    <input type="text" id="new-order-address" class="form-input" value="${customer.defaultAddress || ''}" required>
                </div>

                <div>
                    <label for="new-order-notes" class="block text-sm font-medium">תוכן ההזמנה</label>
                    <textarea id="new-order-notes" class="form-input" rows="4" placeholder="לדוגמה: 10 בלוק 20, 5 מלט..."></textarea>
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeAllModals()">ביטול</button>
                <button type="submit" class="btn btn-primary">צור הזמנה</button>
            </div>
        </form>
    `;
    openModal('new-order-modal', content);
    document.getElementById('details-new-order-form').addEventListener('submit', createOrderForCustomer);
}
window.openNewOrderModal = openNewOrderModal; // חשיפה גלובלית

// --- CRUD Functions ---

/**
 * @required saveCustomer()
 * שומר את השינויים שבוצעו בטופס העריכה
 */
async function saveCustomer(event) {
    event.preventDefault();
    const customerId = document.getElementById('edit-customer-id').value;
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    const originalCustomer = allCustomers.find(c => c.id === customerId);
    if (!originalCustomer) {
        showToast("שגיאה: לקוח לא נמצא", "error");
        btn.disabled = false;
        return;
    }

    // איסוף נתונים חדשים
    const updatedData = {
        customerNumber: document.getElementById('edit-customer-number').value || null,
        name: document.getElementById('edit-customer-name').value,
        phone: document.getElementById('edit-customer-phone').value || null,
        defaultAddress: document.getElementById('edit-customer-address').value || null,
        status: document.getElementById('edit-customer-status').value,
    };
    
    // בדיקה אם בוצעו שינויים
    const changes = {};
    let hasChanges = false;
    for (const key in updatedData) {
        if ((updatedData[key] || '') !== (originalCustomer[key] || '')) {
            changes[key] = { from: originalCustomer[key] ?? null, to: updatedData[key] };
            hasChanges = true;
        }
    }

    if (!hasChanges) {
        showToast("לא בוצעו שינויים", "info");
        btn.disabled = false;
        closeDetailsPanel();
        return;
    }

    // שמירת הנתונים ב-Firestore
    try {
        const customerRef = doc(db, "customers", customerId);
        
        // יצירת רשומת לוג
        const logEntry = {
            timestamp: serverTimestamp(),
            action: "Updated",
            changes: changes
        };

        // עדכון המסמך והוספת הלוג למערך
        await updateDoc(customerRef, {
            ...updatedData,
            auditLog: arrayUnion(logEntry),
            lastModified: serverTimestamp()
        });

        showToast("פרטי לקוח עודכנו בהצלחה", "success");
        closeDetailsPanel();
        // אין צורך לרענן ידנית, onSnapshot יטפל בזה
    } catch (e) {
        console.error("Failed to save customer:", e);
        showToast(`שגיאה בשמירת פרטי לקוח: ${e.message}`, "error");
    } finally {
        btn.disabled = false;
    }
}
window.saveCustomer = saveCustomer; // חשיפה גלובלית

/**
 * @required createOrder() - Logic part
 * יוצר מסמך הזמנה חדש ב-Firestore
 */
async function createOrderForCustomer(event) {
    event.preventDefault();
    const customerId = document.getElementById('new-order-customer-id').value;
    const notes = document.getElementById('new-order-notes').value;
    const address = document.getElementById('new-order-address').value;
    const deliveryType = document.getElementById('new-order-delivery-type').value;

    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        showToast("שגיאה: לא ניתן לשייך הזמנה ללקוח לא ידוע", "error");
        btn.disabled = false;
        return;
    }
    
    // הכנת אובייקט ההזמנה
    const orderData = {
        customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            customerNumber: customer.customerNumber
        },
        address: address,
        deliveryType: deliveryType,
        notes: notes,
        orderDate: new Date().toISOString().split('T')[0],
        status: "חדש",
        createdBy: "AdminManager",
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        order_id: `AUTO-${Date.now().toString().slice(-6)}`
    };

    try {
        await addDoc(collection(db, "orders"), orderData);
        showToast("הזמנה חדשה נוצרה בהצלחה", "success");
        closeAllModals();
    } catch (e) {
        console.error("Failed to create order:", e);
        showToast(`שגיאה ביצירת הזמנה: ${e.message}`, "error");
    } finally {
        btn.disabled = false;
    }
}
window.createOrderForCustomer = createOrderForCustomer; // חשיפה גלובלית

/**
 * @required deleteCustomer()
 * פותח מודאל אישור לפני מחיקה
 */
async function deleteCustomer(customerId, customerName) {
    const title = `מחיקת לקוח: ${customerName}`;
    const message = `האם אתה בטוח שברצונך למחוק את הלקוח? פעולה זו אינה הפיכה. אם ללקוח יש הזמנות פעילות, הן עלולות להישאר "יתומות".`;
    
    // שמירת הפעולה שתתבצע באישור
    currentDeleteCallback = async () => {
        try {
            // (אופציונלי) כאן אפשר להוסיף בדיקה נוספת להזמנות פעילות
            const customerRef = doc(db, "customers", customerId);
            await deleteDoc(customerRef);
            
            showToast(`הלקוח ${customerName} נמחק בהצלחה`, "success");
            closeDetailsPanel(); // סגירת פאנל העריכה אם היה פתוח
            // onSnapshot ירענן את הרשימה
        } catch (e) {
            console.error("Failed to delete customer:", e);
            showToast(`שגיאה במחיקת לקוח: ${e.message}`, "error");
        }
    };
    
    openConfirmModal(title, message);
}
window.deleteCustomer = deleteCustomer; // חשיפה גלובלית

// [חדש] פונקציית אישור גנרית (מחליפה confirm)
function openConfirmModal(title, message) {
    const content = `
        <div class="confirm-body">
            <h3 class="confirm-title">${title}</h3>
            <p class="confirm-message">${message}</p>
        </div>
        <div class="confirm-actions">
            <button type="button" class="btn btn-secondary" onclick="closeAllModals()">ביטול</button>
            <button type="button" class="btn btn-danger" onclick="executeConfirm()">אשר מחיקה</button>
        </div>
    `;
    openModal('confirm-modal', content);
}

// [חדש] פונקציה להרצת הקולבק השמור
function executeConfirm() {
    if (typeof currentDeleteCallback === 'function') {
        currentDeleteCallback();
    }
    closeAllModals();
}
window.executeConfirm = executeConfirm; // חשיפה גלובלית

// --- Utility Functions ---

function showToast(message, type = 'info') {
    if (currentToastTimer) clearTimeout(currentToastTimer);
    
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10); // delay for transition

    currentToastTimer = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
}
window.showToast = showToast; // חשיפה גלובלית

// --- Global Exposure & Init ---
document.addEventListener('DOMContentLoaded', initApp);
