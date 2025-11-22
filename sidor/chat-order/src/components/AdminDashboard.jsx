import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  LayoutDashboard, Users, Package, ShoppingCart, 
  LogOut, Plus, Trash2, Edit, Check, X 
} from 'lucide-react';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'catalog', 'users'
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', sku: '', image: '' });
  const [isEditing, setIsEditing] = useState(false);

  // האזנה להזמנות
  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      // מסננים רק הודעות מסוג הזמנה
      const ordersData = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.type === 'ORDER');
      setOrders(ordersData);
    });
    return () => unsub();
  }, []);

  // האזנה למוצרים (קטלוג)
  useEffect(() => {
    const q = query(collection(db, 'products')); // וודא שיש קולקציית 'products'
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // האזנה למשתמשים (לצורך ניהול הרשאות)
  useEffect(() => {
    const q = query(collection(db, 'users')); // נניח שמשתמשים נשמרים כאן
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // --- פונקציות ניהול מוצרים ---
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price) return;
    try {
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        updatedAt: serverTimestamp()
      });
      setNewProduct({ name: '', price: '', sku: '', image: '' });
      alert('מוצר נוסף בהצלחה');
    } catch (error) {
      console.error("Error adding product: ", error);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (confirm('האם אתה בטוח שברצונך למחוק מוצר זה?')) {
      await deleteDoc(doc(db, 'products', id));
    }
  };

  // --- פונקציות ניהול הזמנות ---
  const updateOrderStatus = async (msgId, newStatus) => {
    await updateDoc(doc(db, 'messages', msgId), {
      orderStatus: newStatus
    });
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans dir-rtl">
      {/* Sidebar */}
      <nav className="w-64 bg-white border-l flex flex-col">
        <div className="p-6 border-b flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">A</div>
          <div>
            <h2 className="font-bold text-gray-800">Saban Admin</h2>
            <p className="text-xs text-gray-500">ניהול מערכת</p>
          </div>
        </div>
        <div className="p-4 space-y-2 flex-1">
          <button onClick={() => setActiveTab('orders')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'orders' ? 'bg-purple-50 text-purple-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
            <ShoppingCart size={20} /> הזמנות
          </button>
          <button onClick={() => setActiveTab('catalog')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'catalog' ? 'bg-purple-50 text-purple-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Package size={20} /> קטלוג מוצרים
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-purple-50 text-purple-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}>
            <Users size={20} /> משתמשים
          </button>
        </div>
        <div className="p-4 border-t">
          <button onClick={() => auth.signOut()} className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all">
            <LogOut size={20} /> יציאה
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">הזמנות אחרונות</h2>
            <div className="grid gap-4">
              {orders.map(order => (
                <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-lg">{order.senderName}</span>
                      <span className="text-xs text-gray-500">{new Date(order.createdAt?.seconds * 1000).toLocaleString()}</span>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg text-sm mb-2">
                      {order.orderPayload?.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between w-64">
                          <span>{item.name}</span>
                          <span className="font-bold">x{item.qty}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm font-bold text-blue-600">סה"כ פריטים: {order.orderPayload?.total}</div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <span className={`px-3 py-1 rounded-full text-center text-xs font-bold ${order.orderStatus === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {order.orderStatus === 'completed' ? 'הושלם' : 'בטיפול'}
                    </span>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => updateOrderStatus(order.id, 'completed')} className="p-2 bg-green-50 text-green-600 rounded hover:bg-green-100" title="סמן כהושלם"><Check size={18}/></button>
                      <button onClick={() => updateOrderStatus(order.id, 'cancelled')} className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100" title="בטל הזמנה"><X size={18}/></button>
                    </div>
                  </div>
                </div>
              ))}
              {orders.length === 0 && <p class="text-gray-500">אין הזמנות חדשות.</p>}
            </div>
          </div>
        )}

        {activeTab === 'catalog' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">ניהול קטלוג</h2>
            
            {/* Add Product Form */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold mb-4 text-sm uppercase text-gray-500">הוספת מוצר חדש</h3>
              <form onSubmit={handleAddProduct} className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs mb-1">שם מוצר</label>
                  <input className="border p-2 rounded-lg w-48" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} placeholder="לדוגמה: מלט" />
                </div>
                <div>
                  <label className="block text-xs mb-1">מחיר</label>
                  <input className="border p-2 rounded-lg w-24" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} placeholder="₪50" />
                </div>
                <div>
                  <label className="block text-xs mb-1">מק"ט</label>
                  <input className="border p-2 rounded-lg w-24" value={newProduct.sku} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} placeholder="101" />
                </div>
                <div>
                  <label className="block text-xs mb-1">תמונה (URL)</label>
                  <input className="border p-2 rounded-lg w-48" value={newProduct.image} onChange={e => setNewProduct({...newProduct, image: e.target.value})} placeholder="https://..." />
                </div>
                <button type="submit" className="bg-purple-600 text-white p-2.5 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2">
                  <Plus size={18} /> הוסף
                </button>
              </form>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {products.map(p => (
                <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center group hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <img src={p.image || 'https://via.placeholder.com/50'} className="w-12 h-12 rounded-lg object-cover bg-gray-100"/>
                    <div>
                      <div className="font-bold">{p.name}</div>
                      <div className="text-sm text-gray-500">{p.sku} | {p.price}</div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteProduct(p.id)} className="text-red-400 hover:bg-red-50 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="text-center py-20 text-gray-500">
            <Users size={48} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-xl font-bold">ניהול משתמשים</h3>
            <p>כאן תוכל לנהל הרשאות (נהג/לקוח/מנהל) - בפיתוח.</p>
          </div>
        )}

      </main>
    </div>
  );
}
