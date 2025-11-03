// --- Inlined Firebase SDK Imports ---
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, 
    collection, query, where, Timestamp, runTransaction, getDocs, orderBy, 
    serverTimestamp, limit, writeBatch, collectionGroup
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Global Constants ---
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzwWherCt8LsMCmd9dQ__1RdN4OXb3BBcwYezJG0qVkFKbxowefqBLWbXHTft1QlXhprg/exec"; // Placeholder

// --- Global Variables ---
let db, auth;
let currentUserId = null;
let allCustomers = [];
let allOrders = [];
let activeOrders = [];
let map;
let orderMarkers = {};
let currentToastTimer = null;

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

// --- Initialization ---
function initApp() {
    try {
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : JSON.stringify(fallbackConfig));
        const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        db = getFirestore(app);
        auth = getAuth(app);
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                document.getElementById('auth-status').innerText = `מחובר (UID: ${currentUserId.slice(0,6)})`;
                attachListeners();
                initializeMap();
            } else {
                document.getElementById('auth-status').innerText = 'מתחבר...';
                try {
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Auth Error:", error);
                    document.getElementById('auth-status').innerText = 'כשלון התחברות';
                }
            }
        });

    } catch (e) {
        console.error("Firebase Initialization Failed:", e);
        showToast('שגיאת התחברות חמורה ל-Firebase', 'error');
    }
}

function initializeMap() {
    try {
        map = L.map('map').setView([32.0853, 34.7818], 9);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);
    } catch (e) {
        console.error("Map init failed:", e);
        document.getElementById('map-container').innerHTML = '<div class="p-4 text-red-500">שגיאה בטעינת המפה.</div>';
    }
}


function attachListeners() {
    // Attach main data listeners
    loadCustomers();
    loadOrders(null); // Load all orders
    loadActiveOrders(); // For dashboard list

    // Attach UI listeners
    document.getElementById('search-input').addEventListener('input', debounce(renderCustomerTable, 300));
    document.getElementById('edit-customer-form').addEventListener('submit', saveCustomer);
    document.getElementById('new-order-form').addEventListener('submit', createOrderForCustomer);
    
    // Attach nav buttons (they are already handled by onclick, but good practice)
    document.getElementById('dashboardBtn').addEventListener('click', () => showView('dashboard'));
    document.getElementById('historyBtn').addEventListener('click', () => showView('history'));
    
    console.log("✅ Admin Manager Loaded — /sidor/admin/index.html");
}

// --- Data Loading ---

async function loadCustomers() {
    const q = query(collection(db, "customers"), orderBy("name"));
    onSnapshot(q, (snapshot) => {
        allCustomers = [];
        snapshot.forEach(doc => {
            allCustomers.push({ id: doc.id, ...doc.data() });
        });
        renderCustomerTable();
    }, (error) => {
        console.error("Failed to load customers:", error);
        showToast("שגיאה בטעינת לקוחות", "error");
        document.getElementById('customer-table-body').innerHTML = `<tr><td colspan="6" class="text-center p-8 text-red-500">שגיאה בטעינת לקוחות.</td></tr>`;
    });
}

async function loadOrders(customerId = null) {
    let q;
    if (customerId) {
        q = query(collection(db, "orders"), where("customer.id", "==", customerId), orderBy("createdAt", "desc"), limit(50));
    } else {
        q = query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(100));
    }
    
    // This is a one-time fetch for history, not a snapshot
    try {
        const snapshot = await getDocs(q);
        allOrders = [];
        snapshot.forEach(doc => {
            allOrders.push({ id: doc.id, ...doc.data() });
        });
        // This function is just to load data, renderCustomerTable will use it
    } catch (error) {
        console.error("Failed to load orders:", error);
        showToast("שגיאה בטעינת היסטוריית הזמנות", "error");
    }
}

async function loadActiveOrders() {
    const q = query(collection(db, "orders"), where("status", "in", ["חדש", "בטיפול", "בדרך"]), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        activeOrders = [];
        snapshot.forEach(doc => {
            activeOrders.push({ id: doc.id, ...doc.data() });
        });
        renderDashboardOrderList();
        renderMapMarkers();
    }, (error) => {
        console.error("Failed to load active orders:", error);
    });
}

// --- Rendering ---

function renderDashboardOrderList() {
    const listEl = document.getElementById('orders-list-dashboard');
    listEl.innerHTML = '';
    if (activeOrders.length === 0) {
        listEl.innerHTML = '<p class="p-4 text-gray-500">אין הזמנות פעילות כרגע.</p>';
        return;
    }
    activeOrders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
            <div class="font-semibold">${order.customer?.name || 'N/A'}</div>
            <div class="text-sm text-gray-600">${order.address || 'N/A'}</div>
            <div class="text-xs text-gray-500 mt-1">${order.status}</div>
        `;
        listEl.appendChild(card);
    });
}

function renderMapMarkers() {
    if (!map) return;

    // Clear old markers
    Object.values(orderMarkers).forEach(marker => marker.remove());
    orderMarkers = {};
    const bounds = L.latLngBounds();

    activeOrders.forEach(order => {
        if (order.latitude && order.longitude) {
            const latLng = [order.latitude, order.longitude];
            const marker = L.marker(latLng).addTo(map)
                .bindPopup(`<b>${order.customer?.name}</b><br>${order.address}<br>סטטוס: ${order.status}`);
            orderMarkers[order.id] = marker;
            bounds.extend(latLng);
        }
    });

    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
}


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
                <td class="p-4">
                    <span style="color: ${status === 'active' ? 'green' : 'red'};">${status}</span>
                </td>
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
                    <button class="action-btn danger" title="מחק לקוח" onclick="confirmDeleteCustomer('${customer.id}', '${customer.name}')">
                        <i data-feather="trash-2" class="w-5 h-5"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    feather.replace();
}

// --- UI Actions (Modals, Views) ---

function showView(viewName) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById(`${viewName}Btn`).classList.add('active');
    
    if (viewName === 'dashboard' && map) {
        setTimeout(() => map.invalidateSize(), 10);
    }
}
window.showView = showView;

function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    document.getElementById('modal-overlay').classList.remove('hidden');
}
window.openModal = openModal;

function closeAllModals() {
    document.querySelectorAll('.modal-content').forEach(modal => modal.classList.add('hidden'));
    document.getElementById('modal-overlay').classList.add('hidden');
}
window.closeAllModals = closeAllModals;

async function openCustomerEditor(customerId) {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        showToast("שגיאה: לא נמצא לקוח", "error");
        return;
    }
    
    document.getElementById('edit-modal-title').innerText = `עריכת לקוח: ${customer.name}`;
    document.getElementById('edit-customer-id').value = customer.id;
    document.getElementById('edit-customer-number').value = customer.customerNumber || '';
    document.getElementById('edit-customer-name').value = customer.name || '';
    document.getElementById('edit-customer-phone').value = customer.phone || '';
    document.getElementById('edit-customer-status').value = customer.status || 'active';
    document.getElementById('edit-customer-projects').value = (customer.projects || []).join(', ');
    document.getElementById('edit-customer-notes').value = customer.notes || '';
    
    openModal('edit-customer-modal');
}
window.openCustomerEditor = openCustomerEditor;

async function showCustomerOrders(customerId, customerName) {
    document.getElementById('history-modal-title').innerText = `היסטוריית הזמנות עבור: ${customerName}`;
    const contentEl = document.getElementById('history-modal-content');
    contentEl.innerHTML = '<div class="loader"></div>';
    openModal('history-modal');

    // Fetch specific orders for this customer
    await loadOrders(customerId);
    
    if (allOrders.length === 0) {
        contentEl.innerHTML = '<p class="text-center text-gray-500">לא נמצאו הזמנות עבור לקוח זה.</p>';
        return;
    }
    
    contentEl.innerHTML = allOrders.map(order => `
        <div class="p-3 mb-2 border rounded-md">
            <p><strong>מס' הזמנה:</strong> ${order.order_id || order.id}</p>
            <p><strong>תאריך:</strong> ${order.orderDate || 'N/A'}</p>
            <p><strong>סטטוס:</strong> ${order.status || 'N/A'}</p>
            <p class="text-sm text-gray-500 truncate"><strong>תוכן:</strong> ${order.notes || '-'}</p>
            ${order.attachmentUrl ? `<a href="${order.attachmentUrl}" target="_blank" class="text-blue-500 text-sm">פתח קובץ מצורף</a>` : ''}
        </div>
    `).join('');
}
window.showCustomerOrders = showCustomerOrders;

function openNewOrderModal(customerId, customerName) {
    document.getElementById('new-order-modal-title').innerText = `יצירת הזמנה חדשה עבור: ${customerName}`;
    document.getElementById('new-order-customer-id').value = customerId;
    document.getElementById('new-order-notes').value = '';
    document.getElementById('new-order-file').value = '';
    openModal('new-order-modal');
}
window.openNewOrderModal = openNewOrderModal;

function confirmDeleteCustomer(customerId, customerName) {
    document.getElementById('delete-confirm-text').innerText = `האם אתה בטוח שברצונך למחוק את "${customerName}"? פעולה זו תמחק את כרטיס הלקוח לצמיתות (ההזמנות יישארו).`;
    document.getElementById('delete-customer-id').value = customerId;
    openModal('delete-confirm-modal');
}
window.confirmDeleteCustomer = confirmDeleteCustomer;

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
        projects: document.getElementById('edit-customer-projects').value.split(',').map(p => p.trim()).filter(Boolean),
        notes: document.getElementById('edit-customer-notes').value,
        lastModified: serverTimestamp()
    };
    
    try {
        const customerRef = doc(db, "customers", customerId);
        await setDoc(customerRef, customerData, { merge: true });
        showToast("פרטי לקוח עודכנו בהצלחה", "success");
        closeAllModals();
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
    const file = document.getElementById('new-order-file').files[0];
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        showToast("שגיאה: לא ניתן לשייך הזמנה ללקוח לא ידוע", "error");
        btn.disabled = false;
        return;
    }
    
    try {
        let attachmentUrl = null;
        if (file) {
            showToast("מעלה קובץ...", "info");
            const uploadResult = await attachFileToOrder(file, `orders/${customerId}`);
            attachmentUrl = uploadResult.url;
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
            attachmentUrl: attachmentUrl,
            orderDate: new Date().toISOString().split('T')[0],
            status: "חדש",
            createdBy: "AdminManager",
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp(),
            order_id: `AUTO-${Date.now().toString().slice(-6)}`
        };

        await addDoc(collection(db, "orders"), orderData);
        showToast("הזמנה חדשה נוצרה בהצלחה", "success");
        closeAllModals();
    } catch (e) {
        console.error("Failed to create order:", e);
        showToast("שגיאה ביצירת הזמנה", "error");
    } finally {
        btn.disabled = false;
    }
}

async function executeDeleteCustomer() {
    const customerId = document.getElementById('delete-customer-id').value;
    const btn = document.getElementById('delete-confirm-btn');
    btn.disabled = true;

    try {
        await deleteDoc(doc(db, "customers", customerId));
        showToast("לקוח נמחק בהצלחה", "success");
        closeAllModals();
    } catch (e) {
        console.error("Failed to delete customer:", e);
        showToast("שגיאה במחיקת לקוח", "error");
    } finally {
        btn.disabled = false;
    }
}

// --- Helper Functions (as requested) ---

async function attachFileToOrder(file, contextPath) {
    if (!file) throw new Error("No file provided");
    showToast("מעלה קובץ...", "info");

    // 1. Convert file to Base64
    const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });

    // 2. Prepare payload for Apps Script
    const payload = {
        fileData: base64Data,
        fileName: file.name,
        mimeType: file.type,
        customerId: contextPath // Use contextPath as identifier
    };
    
    // 3. Send to Apps Script Web App
    const response = await fetch(WEB_APP_URL, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });

    if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.success && result.url) {
        return result; // { success, url, waUrl, name }
    } else {
        throw new Error(result.error || "Unknown server error");
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        await Notification.requestPermission();
    }
}

function closeActiveChat() {
    // This function is required by the prompt, but this UI doesn't have a chat
    console.log("closeActiveChat called, but no chat UI is present in this module.");
}

function ensureIdempotency(messageId) {
    // Placeholder for idempotency logic
    // In a real scenario, this would check a set of processed IDs
    console.log(`Checking idempotency for: ${messageId}`);
    return true; // Simulate check
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout
