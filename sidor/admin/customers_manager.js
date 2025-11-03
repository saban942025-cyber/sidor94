// --- Firebase SDK Imports ---
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, 
    collection, query, where, Timestamp, runTransaction, getDocs, orderBy, 
    serverTimestamp, limit, writeBatch, collectionGroup
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Global Variables ---
let db, auth;
let currentUserId = null;
let allCustomers = [];
let allOrders = [];
let currentFilter = 'customers';
let currentToastTimer = null;
let appInitialized = false;

// --- Firebase Config (Placeholder) ---
// [ACTION REQUIRED] This config is pulled from previous context.
const fallbackConfig = {
  apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", 
  authDomain: "saban94-78949.firebaseapp.com", 
  projectId: "saban94-78949",
  storageBucket: "saban94-78949.firebasestorage.app", 
  messagingSenderId: "41553157903", 
  appId: "1:41553157903:web:cc33d252cff023be97a87a", 
  measurementId: "G-XV6RZDESSB"
};

// [CONTEXT] This URL is from the user's previous context for file uploads
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzwWherCt8LsMCmd9dQ__1RdN4OXb3BBcwYezJG0qVkFKbxowefqBLWbXHTft1QlXhprg/exec"; 

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
};

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
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                document.getElementById('auth-status').innerText = `מחובר: ${currentUserId.slice(0,6)}...`;
                document.getElementById('auth-status').style.color = "#22c55e"; // green
                
                if (!appInitialized) {
                    attachListeners();
                    loadCustomers();
                    loadOrders();
                    appInitialized = true;
                    console.log("✅ Admin Manager Loaded — /sidor/admin/index.html");
                }
            } else {
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
    // Attach main data listeners
    document.getElementById('search-input').addEventListener('input', debounce(renderCustomerTable, 300));
    
    // Attach navigation listeners
    document.getElementById('dashboardBtn').addEventListener('click', (e) => {
        e.preventDefault();
        // Placeholder: load dashboard view
        showToast("דשבורד בבנייה", "info");
    });
    
    document.getElementById('clientsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        // This button reloads/focuses the current page (which IS the customer manager)
        loadCustomers();
    });

    document.getElementById('historyBtn').addEventListener('click', (e) => {
        e.preventDefault();
        // As per prompt, this opens a *separate* page (assuming it exists)
        // Note: This command creates index.html, not customers_manager.html.
        // For robustness, let's make it open THIS page in a new tab if it's the manager.
        // Or, let's assume the user meant the *other* admin page.
        // Based on prompt: "open /sidor/admin/customers_manager.html or /sidor/admin/index.html (current)"
        // Since this IS index.html, we'll just focus it.
        showToast("ניהול לקוחות והזמנות כבר פתוח.", "info");
    });

    document.getElementById('messagesBtn').addEventListener('click', (e) => {
        e.preventDefault();
        window.open('../messages_viewer.html', '_blank', 'noopener,noreferrer');
    });

    document.getElementById('logsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        window.open('../log_viewer.html', '_blank', 'noopener,noreferrer');
    });
}

// --- Data Loading ---

async function loadCustomers() {
    document.getElementById('main-loader').classList.remove('hidden');
    document.getElementById('customer-table-body').parentElement.parentElement.classList.add('hidden');

    const q = query(collection(db, "customers"), orderBy("name"));
    onSnapshot(q, (snapshot) => {
        allCustomers = [];
        snapshot.forEach(doc => {
            allCustomers.push({ id: doc.id, ...doc.data() });
        });
        renderCustomerTable();
        document.getElementById('main-loader').classList.add('hidden');
        document.getElementById('customer-table-body').parentElement.parentElement.classList.remove('hidden');
    }, (error) => {
        console.error("Failed to load customers:", error);
        showToast("שגיאה בטעינת לקוחות", "error");
        document.getElementById('customer-table-body').innerHTML = `<tr><td colspan="6" class="text-center p-8 text-red-500">שגיאה בטעינת לקוחות.</td></tr>`;
    });
}

async function loadOrders(customerId = null) {
    // This function is placeholder, assuming main view is customers.
    // Full order loading logic would be in a separate view.
    console.log("Loading orders...", customerId ? `for ${customerId}` : "all");
    
    let q;
    if (customerId) {
        q = query(collection(db, "orders"), where("customer.id", "==", customerId), orderBy("createdAt", "desc"), limit(20));
    } else {
        q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100));
    }
    
    onSnapshot(q, (snapshot) => {
        allOrders = [];
        snapshot.forEach(doc => {
            allOrders.push({ id: doc.id, ...doc.data() });
        });
        // In this view, we don't render all orders, just customer-specific ones.
        // renderOrderTable(); 
    }, (error) => {
        console.error("Failed to load orders:", error);
    });
}

// --- Rendering ---

function renderCustomerTable() {
    const tbody = document.getElementById('customer-table-body');
    const search = document.getElementById('search-input').value.toLowerCase();
    
    const filtered = allCustomers.filter(c => 
        (c.name && c.name.toLowerCase().includes(search)) ||
        (c.customerNumber && c.customerNumber.includes(search)) ||
        (c.phone && c.phone.includes(search))
    );
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-gray-500">לא נמצאו לקוחות.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(customer => {
        const createDate = customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString('he-IL') : 'לא ידוע';
        const status = customer.status || 'active';
        return `
            <tr>
                <td class="p-4 font-mono">${customer.customerNumber || 'N/A'}</td>
                <td class="p-4 font-semibold">${customer.name}</td>
                <td class="p-4">${customer.phone || 'N/A'}</td>
                <td class="p-4">${status}</td>
                <td class="p-4">${createDate}</td>
                <td class="p-4 action-buttons">
                    <button class="action-btn" title="עריכה" onclick="openCustomerEditor('${customer.id}')">
                        <i data-feather="edit" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn" title="היסטוריית הזמנות" onclick="showCustomerOrders('${customer.id}', '${customer.name}')">
                        <i data-feather="archive" class="w-5 h-5"></i>
                    </button>
                    <button class="action-btn" title="יצירת הזמנה חדשה" onclick="openNewOrderModal('${customer.id}', '${customer.name}')">
                        <i data-feather="plus-circle" class="w-5 h-5"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    feather.replace();
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
}

function openDetailsPanel(content) {
    document.getElementById('details-content').innerHTML = content;
    document.getElementById('details-panel').classList.remove('hidden');
    document.querySelector('.glass-wrapper').classList.add('details-open');
}

function closeDetailsPanel() {
    document.getElementById('details-panel').classList.add('hidden');
    document.querySelector('.glass-wrapper').classList.remove('details-open');
}

async function openCustomerEditor(customerId) {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        showToast("שגיאה: לא נמצא לקוח", "error");
        return;
    }
    
    // Create editor HTML
    const content = `
        <h3 class="text-xl font-semibold mb-4">עריכת לקוח</h3>
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
                <label class="block text-sm font-medium">סטטוס</label>
                <select id="edit-customer-status" class="form-input">
                    <option value="active" ${customer.status === 'active' ? 'selected' : ''}>פעיל</option>
                    <option value="pending" ${customer.status === 'pending' ? 'selected' : ''}>ממתין</option>
                    <option value="blocked" ${customer.status === 'blocked' ? 'selected' : ''}>חסום</option>
                </select>
            </div>
            <div class="pt-4 flex justify-end gap-2">
                <button type="button" class="btn btn-secondary" onclick="closeDetailsPanel()">ביטול</button>
                <button type="submit" class="btn btn-primary">שמור שינויים</button>
            </div>
        </form>
    `;
    openDetailsPanel(content);
    
    // Attach form listener
    document.getElementById('details-edit-form').addEventListener('submit', saveCustomer);
}

async function showCustomerOrders(customerId, customerName) {
    const content = `
        <div class="modal-form">
            <h3 class="modal-title">היסטוריית הזמנות: ${customerName}</h3>
            <div id="history-modal-content" class="modal-body">
                <div class="loader"></div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="closeAllModals()">סגור</button>
            </div>
        </div>
    `;
    openModal('history-modal', content);
    
    // Now fetch the orders
    const q = query(collection(db, "orders"), where("customer.id", "==", customerId), orderBy("createdAt", "desc"), limit(20));
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
}

function openNewOrderModal(customerId, customerName) {
    const content = `
        <form id="details-new-order-form" class="modal-form">
            <h3 class="modal-title">יצירת הזמנה חדשה</h3>
            <div class="modal-body space-y-3">
                <p>עבור לקוח: <strong class="font-semibold">${customerName}</strong></p>
                <input type="hidden" id="new-order-customer-id" value="${customerId}">
                <div>
                    <label for="new-order-notes">תוכן ההזמנה</label>
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


// --- CRUD Functions ---

async function saveCustomer(event) {
    event.preventDefault();
    const customerId = document.getElementById('edit-customer-id').value;
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    
    const customerData = {
        customerNumber: document.getElementById('edit-customer-number').value,
        name: document.getElementById('edit-customer-name').value,
        phone: document.getElementById('edit-customer-phone').value,
        status: document.getElementById('edit-customer-status').value,
        lastModified: serverTimestamp()
    };
    
    try {
        const customerRef = doc(db, "customers", customerId);
        await updateDoc(customerRef, customerData, { merge: true });
        showToast("פרטי לקוח עודכנו בהצלחה", "success");
        closeDetailsPanel();
    } catch (e) {
        console.error("Failed to save customer:", e);
        showToast("שגיאה בשמירת פרטי לקוח", "error");
    } finally {
        btn.disabled = false;
    }
}

async function createOrderForCustomer(event) {
    event.preventDefault();
    const customerId = document.getElementById('new-order-customer-id').value;
    const notes = document.getElementById('new-order-notes').value;
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
        address: customer.defaultAddress || 'לא צוינה כתובת',
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
        loadOrders(); // Refresh orders
    } catch (e) {
        console.error("Failed to create order:", e);
        showToast("שגיאה ביצירת הזמנה", "error");
    } finally {
        btn.disabled = false;
    }
}

async function attachFileToOrder(file, orderId) {
    // Placeholder function
    showToast("העלאת קבצים בבנייה...", "info");
    // In full implementation, this would call WEB_APP_URL
    // similar to customer.html's handleFileUpload
}

function ensureIdempotency(messageId) {
    // Placeholder for server-side logic
    console.log(`Checking idempotency for: ${messageId}`);
    return true;
}

// --- Placeholder Functions (as per prompt) ---
function closeActiveChat() {
    console.log("closeActiveChat called");
}

async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        console.log(`Notification permission: ${permission}`);
    }
}

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

// --- Global Exposure & Init ---
window.showView = showView;
window.openCustomerEditor = openCustomerEditor;
window.showCustomerOrders = showCustomerOrders;
window.openNewOrderModal = openNewOrderModal;
window.closeAllModals = closeAllModals;
window.saveCustomer = saveCustomer;
window.createOrderForCustomer = createOrderForCustomer;
window.closeDetailsPanel = closeDetailsPanel;

document.addEventListener('DOMContentLoaded', initApp);
