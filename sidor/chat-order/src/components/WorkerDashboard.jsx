import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
import { db, auth } from '../firebase'; // ייבוא מהקובץ המרכזי שלנו
import { 
  LayoutGrid, MessageCircle, LogOut, Clock, Send, MapPin, 
  CheckCircle, Check, Mic, ShoppingCart, VolumeX 
} from 'lucide-react';

// --- קבועים וצלילים ---
const NOTIF_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
const SLA_SOUND = "https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3";

export default function WorkerDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'chats'
  const [rooms, setRooms] = useState({});
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ orders: 0, unread: 0, online: 0 });
  const [inputText, setInputText] = useState('');
  
  // Refs
  const audioRef = useRef(new Audio(NOTIF_SOUND));
  const slaAudioRef = useRef(new Audio(SLA_SOUND));
  const messagesEndRef = useRef(null);

  // --- אפקטים (Logics) ---

  // 1. האזנה להודעות וחדרים (תחליף ל-logic.init הישן)
  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(500));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newRooms = {};
      let unreadCount = 0;
      let ordersCount = 0;
      let playSound = false;

      snapshot.docs.forEach(doc => {
        const m = doc.data();
        if (!m.roomId) return;

        // יצירת/עדכון חדר
        if (!newRooms[m.roomId]) {
          newRooms[m.roomId] = {
            id: m.roomId,
            name: m.senderName || 'לקוח',
            avatar: m.senderAvatar || `https://ui-avatars.com/api/?name=${m.senderName || 'C'}&background=random`,
            unread: 0,
            lastMsgTime: 0,
            lastMsgText: ''
          };
        }
        
        const room = newRooms[m.roomId];
        const msgTime = m.createdAt?.toMillis() || Date.now();

        // עדכון הודעה אחרונה
        if (msgTime > room.lastMsgTime) {
          room.lastMsgTime = msgTime;
          room.lastMsgText = m.type === 'ORDER' ? '🛒 הזמנה חדשה' : (m.text || 'קובץ/מיקום');
        }

        // ספירת לא נקראו
        if (!m.readByWorker && m.senderId !== auth.currentUser?.uid) {
          room.unread++;
          unreadCount++;
          // אם זו הודעה חדשה שנוספה עכשיו (בסנפשוט הזה) - ננגן צליל
          if (snapshot.docChanges().some(c => c.doc.id === doc.id && c.type === 'added')) {
            playSound = true;
          }
        }

        if (m.type === 'ORDER' && msgTime > Date.now() - 86400000) { // 24 שעות אחרונות
          ordersCount++;
        }
      });

      setRooms(newRooms);
      setStats(prev => ({ ...prev, unread: unreadCount, orders: ordersCount }));

      if (playSound) {
        audioRef.current.play().catch(e => console.log("Audio play failed", e));
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. האזנה להודעות בחדר פעיל
  useEffect(() => {
    if (!activeRoomId) return;

    const q = query(
      collection(db, 'messages'), 
      where('roomId', '==', activeRoomId), 
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      
      // גלילה למטה
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

      // סימון כנקרא
      snapshot.docs.forEach(doc => {
        const m = doc.data();
        if (!m.readByWorker && m.senderId !== auth.currentUser?.uid) {
          updateDoc(doc.ref, { readByWorker: true, readAt: serverTimestamp() });
        }
      });
    });

    return () => unsubscribe();
  }, [activeRoomId]);

  // --- פונקציות עזר ---

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeRoomId) return;

    try {
      await addDoc(collection(db, 'messages'), {
        roomId: activeRoomId,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'נציג',
        type: 'TEXT',
        text: inputText,
        createdAt: serverTimestamp(),
        readByWorker: true
      });
      setInputText('');
    } catch (err) {
      alert('שגיאה בשליחה: ' + err.message);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  const getSLAStatus = (room) => {
    if (room.unread === 0) return null;
    const minutes = Math.floor((Date.now() - room.lastMsgTime) / 60000);
    if (minutes >= 15) return { color: 'bg-red-100 text-red-800', text: `${minutes} דק'`, alert: true };
    if (minutes >= 5) return { color: 'bg-yellow-100 text-yellow-800', text: `${minutes} דק'`, alert: false };
    return { color: 'bg-green-100 text-green-800', text: 'חדש', alert: false };
  };

  // --- רכיבי תצוגה (Sub-components) ---

  const ChatListItem = ({ room }) => {
    const sla = getSLAStatus(room);
    return (
      <div 
        onClick={() => { setActiveRoomId(room.id); setActiveTab('chats'); }}
        className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${activeRoomId === room.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''}`}
      >
        <div className="flex items-center gap-3">
          <img src={room.avatar} alt={room.name} className="w-10 h-10 rounded-full bg-gray-200 object-cover" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-bold text-sm truncate text-gray-900">{room.name}</h3>
              {room.unread > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {room.unread}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500 truncate max-w-[120px]">{room.lastMsgText}</p>
              {sla && <span className={`text-[10px] px-1.5 rounded ${sla.color}`}>{sla.text}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- Render ---

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden dir-rtl">
      
      {/* Sidebar Navigation */}
      <nav className="w-16 bg-white border-l flex flex-col items-center py-6 shadow-sm z-20">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold mb-8 shadow-lg shadow-blue-200">S</div>
        
        <div className="flex flex-col gap-4 w-full items-center">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`p-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <LayoutGrid size={24} />
          </button>
          <button 
            onClick={() => setActiveTab('chats')}
            className={`p-3 rounded-xl transition-all relative ${activeTab === 'chats' ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <MessageCircle size={24} />
            {stats.unread > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </button>
        </div>

        <button onClick={() => auth.signOut()} className="mt-auto mb-4 text-red-400 p-3 hover:bg-red-50 rounded-xl transition-colors">
          <LogOut size={24} />
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* TAB: Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="flex-1 p-6 md:p-10 overflow-y-auto w-full animate-fade-in">
            <header className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">דשבורד ניהול</h1>
                <p className="text-gray-500 text-sm">סקירה בזמן אמת</p>
              </div>
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-sm font-bold text-gray-600">מחובר</span>
              </div>
            </header>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">הזמנות היום</div>
                <div className="text-3xl font-bold text-blue-600">{stats.orders}</div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">הודעות חדשות</div>
                <div className="text-3xl font-bold text-orange-500">{stats.unread}</div>
              </div>
              {/* ניתן להוסיף עוד כרטיסים כאן */}
            </div>

            {/* SLA Monitor */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[500px]">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Clock size={20} className="text-blue-500"/> SLA Monitor
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {Object.values(rooms)
                    .filter(r => r.unread > 0)
                    .sort((a, b) => a.lastMsgTime - b.lastMsgTime)
                    .map(room => (
                      <div key={room.id} onClick={() => {setActiveRoomId(room.id); setActiveTab('chats');}} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-3">
                          <img src={room.avatar} className="w-8 h-8 rounded-full bg-gray-200"/>
                          <span className="font-bold text-sm text-gray-800">{room.name}</span>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${getSLAStatus(room)?.color}`}>
                          {getSLAStatus(room)?.text}
                        </span>
                      </div>
                    ))}
                    {Object.values(rooms).filter(r => r.unread > 0).length === 0 && (
                      <div className="text-center text-gray-400 py-10">אין פניות ממתינות 🎉</div>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Chats (Split View) */}
        <div className={`flex-1 flex w-full h-full bg-white ${activeTab !== 'chats' ? 'hidden' : 'flex'}`}>
          
          {/* Chat List Sidebar */}
          <div className={`w-full md:w-80 border-l bg-white flex flex-col z-10 ${activeRoomId ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center sticky top-0 backdrop-blur-sm">
              <h2 className="font-bold text-lg text-gray-800">שיחות</h2>
              <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                {Object.keys(rooms).length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {Object.values(rooms)
                .sort((a, b) => b.lastMsgTime - a.lastMsgTime)
                .map(room => <ChatListItem key={room.id} room={room} />)}
            </div>
          </div>

          {/* Chat Room Area */}
          <div className={`flex-1 flex flex-col bg-[#efeae2] relative ${!activeRoomId ? 'hidden md:flex' : 'flex'}`}>
            {/* Chat Background Pattern */}
            <div className="absolute inset-0 opacity-10 z-0 pointer-events-none" style={{backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')"}}></div>

            {activeRoomId ? (
              <>
                {/* Chat Header */}
                <div className="p-3 bg-gray-50 border-b flex justify-between items-center shadow-sm z-10">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setActiveRoomId(null)} className="md:hidden p-2 hover:bg-gray-200 rounded-full">
                      <span className="text-xl">➜</span> {/* Right arrow for RTL back */}
                    </button>
                    <img src={rooms[activeRoomId]?.avatar} className="w-10 h-10 rounded-full bg-gray-300 border-2 border-white shadow-sm"/>
                    <div>
                      <h3 className="font-bold text-gray-800">{rooms[activeRoomId]?.name}</h3>
                      <p className="text-xs text-gray-500">מחובר</p>
                    </div>
                  </div>
                  <button onClick={() => { audioRef.current.pause(); audioRef.current.currentTime = 0; }} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="השתק">
                    <VolumeX size={20} />
                  </button>
                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 z-10">
                  {messages.map((msg) => {
                    const isMe = msg.senderId === auth.currentUser?.uid;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-xl shadow-sm relative ${isMe ? 'bg-[#d9fdd3] rounded-tl-none' : 'bg-white rounded-tr-none'}`}>
                          
                          {/* Order Message Special Styling */}
                          {msg.type === 'ORDER' && (
                            <div className="mb-2 pb-2 border-b border-green-200/50">
                              <div className="font-bold text-green-800 flex items-center gap-2 text-sm mb-1">
                                <ShoppingCart size={16} /> הזמנה חדשה
                              </div>
                              <div className="text-xs bg-white/50 p-2 rounded">
                                {msg.orderPayload?.items?.map((item, idx) => (
                                  <div key={idx} className="flex justify-between">
                                    <span>{item.name}</span>
                                    <span className="font-bold">x{item.qty}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Location Message */}
                          {msg.type === 'LOCATION' && (
                            <a 
                              href={`https://waze.com/ul?ll=${msg.location?.lat},${msg.location?.lon}&navigate=yes`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="flex items-center gap-2 text-blue-600 font-bold text-sm underline mb-1"
                            >
                              <MapPin size={16} /> ניווט למיקום
                            </a>
                          )}

                          {/* Text Content */}
                          {msg.text && <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{msg.text}</p>}

                          {/* Timestamp & Status */}
                          <div className="text-[10px] text-gray-400 text-left mt-1 flex items-center justify-end gap-1">
                            {formatTime(msg.createdAt)}
                            {isMe && (
                              msg.readByWorker 
                                ? <CheckCircle size={12} className="text-blue-500"/> 
                                : <Check size={12} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendMessage} className="p-3 bg-gray-50 border-t z-10 flex items-center gap-2">
                  <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="הקלד הודעה..." 
                    className="flex-1 p-3 rounded-xl border-none focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm text-sm"
                  />
                  <button type="submit" className="p-3 bg-[#00a884] text-white rounded-full shadow-md hover:bg-[#008f6f] transition-transform active:scale-95">
                    <Send size={20} />
                  </button>
                </form>
              </>
            ) : (
              <div className="m-auto text-center text-gray-400">
                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle size={40} className="text-gray-400" />
                </div>
                <p>בחר שיחה מהרשימה כדי להתחיל</p>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
