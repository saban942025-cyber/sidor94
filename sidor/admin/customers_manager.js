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
let allOrders = []; // [חדש]
let currentToastTimer = null;
let appInitialized = false;
let currentDeleteCallback = null; 

// משתני מפה
let map;
let customerMarkers = {};
let orderMarkers = {}; // [חדש]
let customerIcon, orderIcon, orderIconActive; // [שונה]
const ISRAEL_CENTER = [32.0853, 34.7818];

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
        
        setLogLevel('debug');

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                document.getElementById('auth-status').innerText = `מחובר: ${currentUserId.slice(0,6)}...`;
                document.getElementById('auth-status').style.color = "#22c55e"; 
                
                if (!appInitialized) {
                    initMap(); 
                    attachListeners();
                    loadCustomers(); 
                    listenToOrders(); // [חדש] האזנה להזמנות
                    appInitialized = true;
                    console.log("✅ Customer Manager Loaded.");
                }
            } else {
                document.getElementById('auth-status').innerText = "מתחבר...";
                document.getElementById('auth-status').style.color = "#f97316"; 
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Auth Error:", error);
                    document.getElementById('auth-status').innerText = "שגיאת התחברות";
                    document.getElementById('auth-status').style.color = "#ef4444"; 
                }
            }
        });

    } catch (e) {
        console.error("Firebase Initialization Failed:", e);
        showToast('שגיאת התחברות חמורה ל-Firebase', 'error');
    }
}

// אתחול מפה ואייקונים
function initMap() {
    try {
        map = L.map('map').setView(ISRAEL_CENTER, 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);

        // אייקון לקוח (כחול)
        customerIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
        });

        // אייקון הזמנה (אפור)
        orderIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
        });
        
        // אייקון הזמנה פעילה/חדשה (ירוק)
        orderIconActive = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
        });

        console.log("Map Initialized.");
    } catch(e) {
        console.error("Map initialization failed:", e);
        document.getElementById('map-container').innerHTML = '<p class="p-4 text-red-500">שגיאה בטעינת המפה</p>';
    }
}

// [תיקון] הוספת בדיקות בטיחות לפונקציה
function attachListeners() {
    // פונקציית עזר לחיבור מאזינים בבטחה
    const safeAttach = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
        } else {
            // הדפסת אזהרה במקום קריסה
            console.warn(`Element with id '${id}' not found. Listener not attached.`);
        }
    };

    safeAttach('search-input', 'input', debounce(performSearch, 300));
    
    safeAttach('dashboardBtn', 'click', (e) => {
        e.preventDefault();
        showView('dashboard');
    });
    
    safeAttach('clientsBtn', 'click', (e) => {
        e.preventDefault();
        showView('customers');
    });

    // [חדש] מאזין לכפתור הזמנות (כעת בטוח)
    safeAttach('ordersBtn', 'click', (e) => {
        e.preventDefault();
        showView('orders');
    });
    
    safeAttach('historyBtn', 'click', (e) => {
        e.preventDefault();
        showToast("בחר לקוח ספציפי להצגת היסטוריה", "info");
    });
}

// [שונה] פונקציית ניהול תצוגה
function showView(viewName) {
    const mapContainer = document.getElementById('map-container');
    const customerTable = document.getElementById('customer-table-container');
    const ordersTable = document.getElementById('orders-table-container');
    
    const dashboardBtn = document.getElementById('dashboardBtn');
    const clientsBtn = document.getElementById('clientsBtn');
    const ordersBtn = document.getElementById('ordersBtn');

    // הסתר הכל
    mapContainer.classList.add('hidden');
    customerTable.classList.add('hidden');
    ordersTable.classList.add('hidden');
    // נקה 'active' מכל הכפתורים
    if (dashboardBtn) dashboardBtn.classList.remove('active');
    if (clientsBtn) clientsBtn.classList.remove('active');
    if (ordersBtn) ordersBtn.classList.remove('active');
    
    if (viewName === 'dashboard') {
        mapContainer.classList.remove('hidden');
        if (dashboardBtn) dashboardBtn.classList.add('active');
        if(map) map.invalidateSize(); 
        document.getElementById('main-title').innerText = 'דשבורד (מפה)';
    } else if (viewName === 'customers') {
        customerTable.classList.remove('hidden');
        if (clientsBtn) clientsBtn.classList.add('active');
        document.getElementById('main-title').innerText = `ניהול לקוחות (${allCustomers.length})`;
    } else if (viewName === 'orders') {
        ordersTable.classList.remove('hidden');
        if (ordersBtn) ordersBtn.classList.add('active');
        document.getElementById('main-title').innerText = `ניהול הזמנות (${allOrders.length})`;
    }
}


// --- Data Loading & Search ---

async function loadCustomers() {
    const loaderEl = document.getElementById('main-loader');
    loaderEl.classList.remove('hidden'); // הצג טוען ראשי

    const q = query(collection(db, "customers"), orderBy("name"));
    
    onSnapshot(q, (snapshot) => {
        allCustomers = [];
        snapshot.forEach(doc => {
            allCustomers.push({ id: doc.id, ...doc.data() });
        });
        
        performSearch(); // בצע חיפוש (או הצג הכל)
        
        loaderEl.classList.add('hidden');
        // הצג את התצוגה הראשונית (דשבורד)
        showView('dashboard');
        
    }, (error) => {
        console.error("Failed to load customers:", error);
        showToast("שגיאה בטעינת לקוחות", "error");
        document.getElementById('customer-table-body').innerHTML = `<tr><td colspan="6" class="text-center p-8 text-red-500">שגיאה בטעינת לקוחות.</td></tr>`;
        loaderEl.classList.add('hidden');
        showView('customers'); // הצג טבלת שגיאה
    });
}

// [חדש] האזנה להזמנות
function listenToOrders() {
    // מביא את כל ההזמנות, ממוין לפי תאריך יצירה
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(200));
    
    onSnapshot(q, (snapshot) => {
        allOrders = [];
        snapshot.forEach(doc => {
            allOrders.push({ id: doc.id, ...doc.data() });
        });
        
        performSearch(); // בצע חיפוש (או הצג הכל)
        
    }, (error) => {
        console.error("Failed to load orders:", error);
        showToast("שגיאה בטעינת הזמנות", "error");
        document.getElementById('orders-table-body').innerHTML = `<tr><td colspan="6" class="text-center p-8 text-red-500">שגיאה בטעינת הזמנות.</td></tr>`;
    });
}


// [שונה] פונקציית חיפוש מרכזית
function performSearch() {
    const search = document.getElementById('search-input').value.toLowerCase();
    
    // סינון לקוחות
    const filteredCustomers = allCustomers.filter(c => 
        (c.name && c.name.toLowerCase().includes(search)) ||
        (c.customerNumber && c.customerNumber.includes(search)) ||
        (c.phone && c.phone.includes(search)) ||
        (c.defaultAddress && c.defaultAddress.toLowerCase().includes(search))
    );
    
    // סינון הזמנות
    const filteredOrders = allOrders.filter(o => 
        (o.order_id && o.order_id.toLowerCase().includes(search)) ||
        (o.customer?.name && o.customer.name.toLowerCase().includes(search)) ||
        (o.address && o.address.toLowerCase().includes(search)) ||
        (o.status && o.status.toLowerCase().includes(search))
    );
    
    renderCustomerTable(filteredCustomers);
    renderOrdersTable(filteredOrders); // [חדש]
    renderMap(filteredCustomers, filteredOrders); // [שונה]
}
window.performSearch = performSearch; 

// --- Rendering ---

function renderCustomerTable(customersToRender) {
    const tbody = document.getElementById('customer-table-body');
    if (!tbody) return;
    
    if (customersToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-gray-500">לא נמצאו לקוחות.</td></tr>';
        return;
    }

    tbody.innerHTML = customersToRender.map(customer => {
        const createDate = customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString('he-IL') : 'N/A';
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
                    <button class="action-btn danger" title="מחיקת לקוח" onclick="deleteCustomerWrapper('${customer.id}', '${customer.name}')">
                         <i data-feather="trash-2" class="w-5 h-5"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    feather.replace(); 
}

/**
 * @required renderOrdersTable()
 * [חדש] מרנדר את טבלת ההזמנות
 */
function renderOrdersTable(ordersToRender) {
    const tbody = document.getElementById('orders-table-body');
    if (!tbody) return;
    
    if (ordersToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-gray-500">לא נמצאו הזמנות.</td></tr>';
        return;
    }

    tbody.innerHTML = ordersToRender.map(order => {
        const orderDate = order.orderDate || (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('he-IL') : 'N/A');
        const status = order.status || 'לא ידוע';
        const orderId = order.order_id || order.id;
        
        // קביעת אם השורה לחיצה (רק אם יש מיקום)
        const isClickable = order.latitude && order.longitude;
        const clickEvent = isClickable ? `onclick="zoomToOrder('${order.id}', ${order.latitude}, ${order.longitude})"` : '';
        const rowClass = isClickable ? 'clickable' : '';

        return `
            <tr class="${rowClass}" ${clickEvent} title="${isClickable ? 'לחץ לניווט למפה' : 'אין מיקום זמין'}">
                <td class="font-mono">${orderId}</td>
                <td class="font-semibold">${order.customer?.name || 'לא משויך'}</td>
                <td>${order.address || 'אין כתובת'}</td>
                <td>${status}</td>
                <td>${orderDate}</td>
                <td class="action-buttons">
                    <button class="action-btn" title="ערוך הזמנה" onclick="editOrder('${order.id}')">
                        <i data-feather="edit-2" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn" title="שכפל הזמנה" onclick="duplicateOrder('${order.id}')">
                        <i data-feather="copy" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn" title="שתף לינק ללקוח" onclick="shareOrderLink('${order.id}')">
                         <i data-feather="link" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn danger" title="מחק הזמנה" onclick="deleteOrderWrapper('${order.id}', '${orderId}')">
                         <i data-feather="trash" class="w-5 h-5"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    feather.replace();
}


/**
 * @required renderMap()
 * [שונה] מרנדר לקוחות והזמנות על המפה
 */
function renderMap(customersToMap, ordersToMap) {
    if (!map) return;

    // ניקוי מרקרים קיימים
    Object.values(customerMarkers).forEach(marker => marker.remove());
    customerMarkers = {};
    Object.values(orderMarkers).forEach(marker => marker.remove());
    orderMarkers = {};
    
    const bounds = L.latLngBounds();
    let mappedCount = 0;

    // רנדור לקוחות
    customersToMap.forEach(customer => {
        if (customer.customLat && customer.customLon) {
            const latLng = [customer.customLat, customer.customLon];
            const popupContent = `
                <h4>(לקוח) ${customer.name}</h4>
                <p>${customer.defaultAddress || 'אין כתובת'}</p>
                <p>${customer.phone || 'אין טלפון'}</p>
            `;
            
            const marker = L.marker(latLng, { icon: customerIcon })
                .addTo(map)
                .bindPopup(popupContent);
            
            customerMarkers[customer.id] = marker;
            bounds.extend(latLng);
            mappedCount++;
        }
    });

    // רנדור הזמנות
    ordersToMap.forEach(order => {
        if (order.latitude && order.longitude) {
            const latLng = [order.latitude, order.longitude];
            const popupContent = `
                <h4>(הזמנה) ${order.order_id || order.id}</h4>
                <p>לקוח: ${order.customer?.name || 'N/A'}</p>
                <p>${order.address || 'אין כתובת'}</p>
                <p>סטטוס: ${order.status || 'N/A'}</p>
            `;
            
            const icon = order.status === 'חדש' ? orderIconActive : orderIcon;
            
            const marker = L.marker(latLng, { icon: icon })
                .addTo(map)
                .bindPopup(popupContent);
            
            orderMarkers[order.id] = marker;
            bounds.extend(latLng);
            mappedCount++;
        }
    });

    if (mappedCount > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (mappedCount === 0 && (customersToMap.length > 0 || ordersToMap.length > 0)) {
        map.setView(ISRAEL_CENTER, 8);
    }
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
    currentDeleteCallback = null; 
}
window.closeAllModals = closeAllModals; 

function openDetailsPanel(content) {
    document.getElementById('details-content').innerHTML = content;
    document.getElementById('details-panel').classList.remove('hidden');
    document.querySelector('.glass-wrapper').classList.add('details-open');
    feather.replace(); 
}

function closeDetailsPanel() {
    document.getElementById('details-panel').classList.add('hidden');
    document.querySelector('.glass-wrapper').classList.remove('details-open');
}
window.closeDetailsPanel = closeDetailsPanel; 

async function openCustomerEditor(customerId) {
    // ... (אותו קוד כמו קודם) ...
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        showToast("שגיאה: לא נמצא לקוח", "error");
        return;
    }
    
    let auditLogHtml = '<li>אין היסטוריית שינויים</li>';
    if (customer.auditLog && Array.isArray(customer.auditLog)) {
        auditLogHtml = customer.auditLog
            .filter(log => log.timestamp) 
            .sort((a, b) => { 
                const timeA = a.timestamp.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
                const timeB = b.timestamp.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
                return timeB - timeA;
            })
            .slice(0, 5) 
            .map(log => {
                const time = (log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp)).toLocaleString('he-IL');
                let changes = log.action === "Created" ? "נוצר" : Object.keys(log.changes || {}).join(', ');
                return `<li>${time}: ${changes}</li>`;
            }).join('');
    }

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
                    <label class="block text-sm font-medium">קואורדינטות (lat, lon)</label>
                    <input type="text" id="edit-customer-coords" class="form-input" placeholder="לדוג': 32.123, 34.456" value="${(customer.customLat && customer.customLon) ? `${customer.customLat}, ${customer.customLon}` : ''}">
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
    
    document.getElementById('details-edit-form').addEventListener('submit', saveCustomer);
}
window.openCustomerEditor = openCustomerEditor; 

async function showCustomerOrders(customerId, customerName) {
    // ... (אותו קוד כמו קודם) ...
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
window.showCustomerOrders = showCustomerOrders; 

function openNewOrderModal(customerId, customerName) {
    // ... (אותו קוד כמו קודם) ...
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
window.openNewOrderModal = openNewOrderModal; 

// --- CRUD Functions ---

async function saveCustomer(event) {
    // ... (אותו קוד כמו קודם, כולל טיפול בקואורדינטות) ...
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

    const updatedData = {
        customerNumber: document.getElementById('edit-customer-number').value || null,
        name: document.getElementById('edit-customer-name').value,
        phone: document.getElementById('edit-customer-phone').value || null,
        defaultAddress: document.getElementById('edit-customer-address').value || null,
        status: document.getElementById('edit-customer-status').value,
    };
    
    const coordsString = document.getElementById('edit-customer-coords').value.trim();
    let customLat = null;
    let customLon = null;
    if (coordsString) {
        const parts = coordsString.split(',');
        if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
            customLat = parseFloat(parts[0].trim());
            customLon = parseFloat(parts[1].trim());
        } else {
            showToast('קואורדינטות לא תקינות. יש להזין בפורמט lat, lon', 'error');
            btn.disabled = false;
            return; 
        }
    }
    updatedData.customLat = customLat;
    updatedData.customLon = customLon;


    const changes = {};
    let hasChanges = false;
    for (const key in updatedData) {
        if ((updatedData[key] || '') !== (originalCustomer[key] || '')) {
            changes[key] = { from: originalCustomer[key] ?? null, to: updatedData[key] };
            hasChanges = true;
        }
    }
    if ((updatedData.customLat || null) !== (originalCustomer.customLat || null) || 
        (updatedData.customLon || null) !== (originalCustomer.customLon || null)) {
        changes.customCoords = { from: `${originalCustomer.customLat}, ${originalCustomer.customLon}`, to: `${updatedData.customLat}, ${updatedData.customLon}`};
        hasChanges = true;
    }


    if (!hasChanges) {
        showToast("לא בוצעו שינויים", "info");
        btn.disabled = false;
        closeDetailsPanel();
        return;
    }

    try {
        const customerRef = doc(db, "customers", customerId);
        
        const logEntry = {
            timestamp: serverTimestamp(),
            action: "Updated",
            changes: changes
        };

        await updateDoc(customerRef, {
            ...updatedData,
            auditLog: arrayUnion(logEntry),
            lastModified: serverTimestamp()
        });

        showToast("פרטי לקוח עודכנו בהצלחה", "success");
        closeDetailsPanel();
    } catch (e) {
        console.error("Failed to save customer:", e);
        showToast(`שגיאה בשמירת פרטי לקוח: ${e.message}`, "error");
    } finally {
        btn.disabled = false;
    }
}
window.saveCustomer = saveCustomer; 

async function createOrderForCustomer(event) {
    // ... (אותו קוד כמו קודם) ...
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
        // [TODO] הוספת קואורדינטות מהלקוח אם קיימות, או מגוגל
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
window.createOrderForCustomer = createOrderForCustomer; 

// [שונה] שם הפונקציה שונתה כדי למנוע התנגשות
async function deleteCustomerWrapper(customerId, customerName) {
    const title = `מחיקת לקוח: ${customerName}`;
    const message = `האם אתה בטוח שברצונך למחוק את הלקוח? פעולה זו אינה הפיכה.`;
    
    currentDeleteCallback = async () => {
        try {
            const customerRef = doc(db, "customers", customerId);
            await deleteDoc(customerRef);
            
            showToast(`הלקוח ${customerName} נמחק בהצלחה`, "success");
            closeDetailsPanel(); 
        } catch (e) {
            console.error("Failed to delete customer:", e);
            showToast(`שגיאה במחיקת לקוח: ${e.message}`, "error");
        }
    };
    
    openConfirmModal(title, message);
}
window.deleteCustomerWrapper = deleteCustomerWrapper; 

// --- [חדש] פונקציות ניהול הזמנות ---

/**
 * @required zoomToOrder()
 * [חדש] ממקד את המפה על הזמנה
 */
function zoomToOrder(orderId, lat, lon) {
    if (!map) return;
    
    if (!lat || !lon) {
        showToast('לא קיים מיקום עבור הזמנה זו', 'info');
        return;
    }
    
    showView('dashboard'); // עבור לתצוגת מפה
    map.setView([lat, lon], 16); // זום קרוב
    
    // פתח פופאפ
    if (orderMarkers[orderId]) {
        orderMarkers[orderId].openPopup();
    }
}
window.zoomToOrder = zoomToOrder;

/**
 * @required editOrder()
 * [חדש] פותח מודאל עריכת הזמנה (כרגע פלייסהולדר)
 */
async function editOrder(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) {
        showToast('שגיאה: הזמנה לא נמצאה', 'error');
        return;
    }
    
    // בעתיד, ניצור כאן טופס עריכה מלא. כרגע, נציג פרטים.
    const content = `
        <div class="modal-form">
            <h3 class="modal-title">עריכת הזמנה (בבנייה)</h3>
            <div class="modal-body space-y-3">
                <p><strong>מס' הזמנה:</strong> ${order.order_id || order.id}</p>
                <p><strong>לקוח:</strong> ${order.customer?.name || 'N/A'}</p>
                <p><strong>כתובת:</strong> ${order.address || 'N/A'}</p>
                <p><strong>סטטוס:</strong> ${order.status || 'N/A'}</p>
                <div>
                    <label>עדכן סטטוס:</label>
                    <select class="form-input" onchange="updateOrderStatusDirectly(this.value, '${order.id}')">
                        <option value="" ${!order.status ? 'selected' : ''}>בחר סטטוס</option>
                        <option value="חדש" ${order.status === 'חדש' ? 'selected' : ''}>חדש</option>
                        <option value="שויך" ${order.status === 'שויך' ? 'selected' : ''}>שויך</option>
                        <option value="בדרך" ${order.status === 'בדרך' ? 'selected' : ''}>בדרך</option>
                        <option value="הושלם" ${order.status === 'הושלם' ? 'selected' : ''}>הושלם</option>
                        <option value="בוטל" ${order.status === 'בוטל' ? 'selected' : ''}>בוטל</option>
                    </select>
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeAllModals()">סגור</button>
            </div>
        </div>
    `;
    openModal('edit-order-modal', content);
}
window.editOrder = editOrder;

// [חדש] פונקציית עזר לעדכון סטטוס מהמודאל
async function updateOrderStatusDirectly(newStatus, orderId) {
    if (!newStatus) return;
    try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
            status: newStatus,
            lastModified: serverTimestamp()
        });
        showToast(`סטטוס הזמנה ${orderId.slice(-4)} עודכן`, 'success');
        closeAllModals(); // onSnapshot יטפל ברענון
    } catch(e) {
        showToast('שגיאה בעדכון סטטוס', 'error');
        console.error(e);
    }
}
window.updateOrderStatusDirectly = updateOrderStatusDirectly;

/**
 * @required duplicateOrder()
 * [חדש] משכפל הזמנה
 */
async function duplicateOrder(orderId) {
    const originalOrder = allOrders.find(o => o.id === orderId);
    if (!originalOrder) {
        showToast('שגיאה: הזמנה מקורית לא נמצאה', 'error');
        return;
    }
    
    // יצירת אובייקט הזמנה חדש
    const newOrderData = {
        ...originalOrder,
        status: "חדש", // איפוס סטטוס
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        order_id: `AUTO-${Date.now().toString().slice(-6)}`,
        notes: `(שוכפל מהזמנה ${originalOrder.order_id || originalOrder.id})\n${originalOrder.notes || ''}`
    };
    
    // הסרת מזהה ו-ID ישנים
    delete newOrderData.id; 
    
    try {
        await addDoc(collection(db, "orders"), newOrderData);
        showToast('הזמנה שוכפלה בהצלחה', 'success');
        showView('orders'); // עבור לטבלת הזמנות
    } catch (e) {
        console.error("Failed to duplicate order:", e);
        showToast('שגיאה בשכפול הזמנה', 'error');
    }
}
window.duplicateOrder = duplicateOrder;

/**
 * @required deleteOrderWrapper()
 * [חדש] קורא למודאל אישור לפני מחיקת הזמנה
 */
async function deleteOrderWrapper(orderId, orderNum) {
    const title = `מחיקת הזמנה: ${orderNum}`;
    const message = `האם אתה בטוח שברצונך למחוק את ההזמנה? פעולה זו אינה הפיכה.`;
    
    currentDeleteCallback = async () => {
        try {
            const orderRef = doc(db, "orders", orderId);
            await deleteDoc(orderRef);
            showToast(`הזמנה ${orderNum} נמחקה בהצלחה`, 'success');
        } catch (e) {
            console.error("Failed to delete order:", e);
            showToast(`שגיאה במחיקת הזמנה: ${e.message}`, "error");
        }
    };
    
    openConfirmModal(title, message);
}
window.deleteOrderWrapper = deleteOrderWrapper;

/**
 * @required shareOrderLink()
 * [חדש] יוצר ומעתיק לינק שיתוף
 */
async function shareOrderLink(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) {
        showToast('שגיאה: הזמנה לא נמצאה', 'error');
        return;
    }
    
    const orderNum = order.order_id || order.id;
    
    // הנחה שהלינק הוא בנתיב יחסי
    const link = `../customer.html?id=${orderNum}`;
    const fullLink = new URL(link, window.location.href).href;
    
    copyToClipboard(fullLink);
    showToast('לינק שיתוף הועתק ללוח', 'success');
}
window.shareOrderLink = shareOrderLink;


// --- [חדש] פונקציות עזר ---

function openConfirmModal(title, message) {
    // ... (אותו קוד כמו קודם) ...
    const content = `
        <div class="confirm-body">
            <h3 class="confirm-title">${title}</h3>
            <p class="confirm-message">${message}</p>
        </div>
        <div class="confirm-actions">
            <button type="button" class="btn btn-secondary" onclick="closeAllModals()">ביטול</button>
            <button type="button" class="btn btn-danger" onclick="executeConfirm()">אשר</button>
        </div>
    `;
    openModal('confirm-modal', content);
}

function executeConfirm() {
    // ... (אותו קוד כמו קודם) ...
    if (typeof currentDeleteCallback === 'function') {
        currentDeleteCallback();
    }
    closeAllModals();
}
window.executeConfirm = executeConfirm; 

function copyToClipboard(text) {
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed'; 
        textarea.style.opacity = 0;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    } catch (e) {
        console.warn("Copy to clipboard failed, falling back to prompt");
        window.prompt("העתק קישור:", text);
    }
}

// --- Utility Functions ---

function showToast(message, type = 'info') {
    // ... (אותו קוד כמו קודם) ...
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
window.showToast = showToast; 

// --- Global Exposure & Init ---
document.addEventListener('DOMContentLoaded', initApp);

