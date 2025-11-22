import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  LayoutGrid, MessageCircle, LogOut, Send, MapPin,
  FileText, ShoppingCart, Plus, Minus, ArrowRight, Search,
  CheckCircle, Clock
} from 'lucide-react';

const DEFAULT_PRODUCTS = [
  { id: "p-101", sku: "10-101", name: "לוח גבס לבן (סטנדרטי)", image: "https://placehold.co/400x300/e0e7ff/3730a3?text=Gypsum", spec: "120x260 ס\"מ | 12.5 מ\"מ", description: "לוח גבס איכותי לקירות פנים.", price: "₪38.00" },
  { id: "p-102", sku: "10-102", name: "ניצב 70 מ\"מ", image: "https://placehold.co/400x300/e0e7ff/3730a3?text=Stud", spec: "300 ס\"מ | פח מגולוון", description: "פרופיל אנכי לקונסטרוקציה.", price: "₪18.50" },
  { id: "p-103", sku: "10-103", name: "מסלול 70 מ\"מ", image: "https://placehold.co/400x300/e0e7ff/3730a3?text=Track", spec: "300 ס\"מ | פח מגולוון", description: "מסילה לרצפה/תקרה.", price: "₪16.90" },
  { id: "p-201", sku: "20-201", name: "שפכטל אמריקאי", image: "https://placehold.co/400x300/e0e7ff/3730a3?text=Putty", spec: "28 ק\"ג | דלי", description: "חומר להחלקת קירות.", price: "₪65.00" }
];

export default function CustomerDashboard() {
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog', 'chats', 'cart', 'profile'
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [cart, setCart] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [projects, setProjects] = useState([]);
  const messagesEndRef = useRef(null);

  // טעינת פרויקטים של הלקוח
  useEffect(() => {
    const fetchProfile = async () => {
      if (!auth.currentUser) return;
      const docRef = doc(db, 'customers', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
          // ברירת מחדל: הפרויקט הראשון
          if (!activeProject) setActiveProject(data.projects[0]);
        }
      }
    };
    fetchProfile();
  }, []);

  // האזנה להודעות בפרויקט הפעיל
  useEffect(() => {
    if (!activeProject) return;

    const q = query(
      collection(db, 'messages'),
      where('roomId', '==', activeProject.projectId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => unsubscribe();
  }, [activeProject]);

  // פונקציות עגלה
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) {
        return prev.map(p => p.id === product.id ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(p => p.id !== productId));
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(p => {
      if (p.id === productId) {
        return { ...p, qty: Math.max(1, p.qty + delta) };
      }
      return p;
    }));
  };

  const sendOrder = async () => {
    if (!activeProject) return alert("אנא בחר פרויקט לשיוך ההזמנה");
    if (cart.length === 0) return;

    try {
      await addDoc(collection(db, 'messages'), {
        roomId: activeProject.projectId,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'לקוח',
        type: 'ORDER',
        orderPayload: { items: cart, total: cart.length },
        createdAt: serverTimestamp(),
        readByWorker: false
      });
      setCart([]);
      setActiveTab('chats'); // מעבר לצ'אט כדי לראות את ההזמנה
    } catch (err) {
      console.error("Order error:", err);
      alert("שגיאה בשליחת ההזמנה");
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeProject) return;

    try {
      await addDoc(collection(db, 'messages'), {
        roomId: activeProject.projectId,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'לקוח',
        type: 'TEXT',
        text: inputText,
        createdAt: serverTimestamp(),
        readByWorker: false
      });
      setInputText('');
    } catch (err) {
      console.error("Message error:", err);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden dir-rtl">
      
      {/* סרגל ניווט תחתון למובייל (או צדדי לדסקטופ אם נרצה להרחיב) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 pb-safe z-50 shadow-lg md:hidden">
        <button onClick={() => setActiveTab('catalog')} className={`flex flex-col items-center p-2 ${activeTab === 'catalog' ? 'text-blue-600' : 'text-gray-400'}`}>
          <LayoutGrid size={24} />
          <span className="text-[10px] mt-1">קטלוג</span>
        </button>
        <button onClick={() => setActiveTab('chats')} className={`flex flex-col items-center p-2 ${activeTab === 'chats' ? 'text-blue-600' : 'text-gray-400'}`}>
          <MessageCircle size={24} />
          <span className="text-[10px] mt-1">צ'אט</span>
        </button>
        <button onClick={() => setActiveTab('cart')} className={`flex flex-col items-center p-2 relative ${activeTab === 'cart' ? 'text-blue-600' : 'text-gray-400'}`}>
          <ShoppingCart size={24} />
          {cart.length > 0 && <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{cart.length}</span>}
          <span className="text-[10px] mt-1">עגלה</span>
        </button>
        <button onClick={() => auth.signOut()} className="flex flex-col items-center p-2 text-red-400">
          <LogOut size={24} />
          <span className="text-[10px] mt-1">יציאה</span>
        </button>
      </nav>

      {/* תוכן ראשי */}
      <main className="flex-1 overflow-y-auto pb-20 w-full">
        
        {/* כותרת */}
        <header className="bg-white p-4 shadow-sm sticky top-0 z-40 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Saban Pro</h1>
            {activeProject && <p className="text-xs text-gray-500">פרויקט: {activeProject.name}</p>}
          </div>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
            {auth.currentUser?.email?.[0].toUpperCase() || 'C'}
          </div>
        </header>

        {/* TAB: Catalog */}
        {activeTab === 'catalog' && (
          <div className="p-4 grid grid-cols-2 gap-4">
            {products.map(product => (
              <div key={product.id} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 flex flex-col">
                <div className="h-32 bg-gray-100 relative">
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => addToCart(product)}
                    className="absolute bottom-2 right-2 bg-blue-600 text-white p-2 rounded-full shadow-lg active:scale-95 transition-transform"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <h3 className="font-bold text-sm text-gray-800 line-clamp-2 mb-1">{product.name}</h3>
                  <p className="text-xs text-gray-500 mb-2">{product.sku}</p>
                  <div className="mt-auto font-bold text-blue-600">{product.price}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: Chats */}
        {activeTab === 'chats' && (
          <div className="flex flex-col h-full">
            {!activeProject ? (
              <div className="p-10 text-center text-gray-500">אין פרויקט פעיל. פנה למנהל.</div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#e5ded8]" style={{backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')"}}>
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderId === auth.currentUser.uid ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-xl shadow-sm ${msg.senderId === auth.currentUser.uid ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                        {msg.type === 'ORDER' && (
                          <div className="mb-2 pb-2 border-b border-green-200">
                            <div className="font-bold text-green-800 text-sm flex items-center gap-1"><ShoppingCart size={14}/> הזמנה חדשה</div>
                            <div className="text-xs mt-1 bg-white/50 p-1 rounded">
                              {msg.orderPayload?.items.map((i, idx) => (
                                <div key={idx}>{i.name} x{i.qty}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="text-sm">{msg.text}</div>
                        <div className="text-[10px] text-gray-400 text-left mt-1">{msg.createdAt?.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-3 bg-gray-50 border-t flex items-center gap-2">
                  <input 
                    className="flex-1 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                    placeholder="הודעה..." 
                    value={inputText} 
                    onChange={e => setInputText(e.target.value)} 
                  />
                  <button type="submit" className="p-3 bg-[#00a884] text-white rounded-full shadow"><Send size={20}/></button>
                </form>
              </>
            )}
          </div>
        )}

        {/* TAB: Cart */}
        {activeTab === 'cart' && (
          <div className="p-4">
            <h2 className="text-xl font-bold mb-4">סל קניות</h2>
            {cart.length === 0 ? (
              <div className="text-center py-10 text-gray-400">העגלה ריקה</div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm flex items-center gap-3">
                    <img src={item.image} className="w-16 h-16 object-cover rounded-lg bg-gray-100" />
                    <div className="flex-1">
                      <h4 className="font-bold text-sm">{item.name}</h4>
                      <div className="text-blue-600 font-bold text-sm">{item.price}</div>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1">
                      <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-white rounded"><Minus size={16}/></button>
                      <span className="w-4 text-center font-bold text-sm">{item.qty}</span>
                      <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-white rounded"><Plus size={16}/></button>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="text-red-400 p-2"><LogOut size={16}/></button>
                  </div>
                ))}
                <div className="mt-6 p-4 bg-white rounded-xl shadow-lg border border-gray-100">
                  <button onClick={sendOrder} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow hover:bg-blue-700 active:scale-95 transition-transform">
                    שלח הזמנה
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
