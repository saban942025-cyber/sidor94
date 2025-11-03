// --- Firebase SDK Imports ---
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, 
    collection, query, where, Timestamp, runTransaction, getDocs, orderBy, 
    serverTimestamp, limit, writeBatch, arrayUnion
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Global Variables ---
let db, auth;
let currentUserId = null;
let allCustomers = [];
let currentToastTimer = null;
let appInitialized = false;

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
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUserId = user.uid;
                document.getElementById('auth-status').innerText = `מחובר: ${currentUserId.slice(0,6)}...`;
                document.getElementById('auth-status').style.color = "#22c55e"; // green
                
                if (!appInitialized) {
                    attachListeners();
                    loadCustomers();
                    appInitialized = true;
                    console.log("✅ Customer Manager Loaded.");
                }
            } else {
                document.getElementById('auth-status').innerText = "מתחבר...";
                document.getElementById('auth-status').style.color = "#f97316"; // orange
                try {
                    // Fallback to anonymous or custom token sign-in
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
    document.getElementById('search-input').addEventListener('input', debounce(searchCustomers, 300));
    
    // Attach navigation listeners (for this standalone page)
    document.getElementById('dashboardBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showToast("דשבורד בבנייה", "info");
    });
    
    // The clientsBtn is the current view, so we just reload data
    document.getElementById('clientsBtn').addEventListener('click', (e) => {
        e.preventDefault();
        loadCustomers();
    });

    document.getElementById('historyBtn').addEventListener('click', (e) => {
        e.preventDefault();
        showCustomerOrders(); // Opens the history modal for the current customer (if selected) or general message
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

// --- Data Loading & Search ---

/**
 * @required loadCustomers()
 */
async function loadCustomers() {
    const loaderEl = document.getElementById('main-loader');
    const tableContainer = document.querySelector('.table-container');

    loaderEl.classList.remove('hidden');
    tableContainer.classList.add('hidden');

    const q = query(collection(db, "customers"), orderBy("name"));
    // Using onSnapshot for real-time updates
    onSnapshot(q, (snapshot) => {
        allCustomers = [];
        snapshot.forEach(doc => {
            allCustomers.push({ id: doc.id, ...doc.data() });
        });
        renderCustomerTable(allCustomers);
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
window.searchCustomers = searchCustomers; // Expose globally for keyup/debounce

// --- Rendering ---

function renderCustomerTable(customersToRender) {
    const tbody = document.getElementById('customer-table-body');
    
    if (customersToRender.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-8 text-gray-500">לא נמצאו לקוחות.</td></tr>';
        return;
    }

    tbody.innerHTML = customersToRender.map(customer => {
        const createDate = customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString('he-IL') : 'N/A';
        const status = customer.status || 'פעיל'; // Default to פעיל
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

/**
 * @required editCustomer()
 */
async function openCustomerEditor(customerId) {
    const customer = allCustomers.find(c => c.id === customerId);
    if (!customer) {
        showToast("שגי
