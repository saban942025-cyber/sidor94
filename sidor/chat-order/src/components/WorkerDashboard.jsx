import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, where } from 'firebase/firestore';
// שים לב: ה-import הזה מניח ש-firebase.js נמצא בתיקיית src (רמה אחת למעלה)
import { db, auth } from '../firebase'; 
import { 
  LayoutGrid, MessageCircle, LogOut, Clock, Send, MapPin, 
  CheckCircle, Check, Mic, ShoppingCart, VolumeX 
} from 'lucide-react';

const NOTIF_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

export default function WorkerDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [rooms, setRooms] = useState({});
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ orders: 0, unread: 0 });
  const [inputText, setInputText] = useState('');
  
  const audioRef = useRef(new Audio(NOTIF_SOUND));
  const messagesEndRef = useRef(null);

  // האזנה לחדרים והודעות אחרונות
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

        if (msgTime > room.lastMsgTime) {
          room.lastMsgTime = msgTime;
          room.lastMsgText = m.type === 'ORDER' ? '🛒 הזמנה חדשה' : (m.text || 'קובץ/מיקום');
        }

        if (!m.readByWorker && m.senderId !== auth.currentUser?.uid) {
          room.unread++;
          unreadCount++;
          if (snapshot.docChanges().some(c => c.doc.id === doc.id && c.type === 'added')) {
            playSound = true;
          }
        }

        if (m.type === 'ORDER' && msgTime > Date.now() - 86400000) { 
          ordersCount++;
        }
      });

      setRooms(newRooms);
      setStats({ unread: unreadCount, orders: ordersCount });

      if (playSound) {
        audioRef.current.play().catch(e => console.log("Audio play failed", e));
      }
    });

    return () => unsubscribe();
  }, []);

  // האזנה להודעות בחדר ספציפי
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
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

      snapshot.docs.forEach(doc => {
        const m = doc.data();
        if (!m.readByWorker && m.senderId !== auth.currentUser?.uid) {
          updateDoc(doc.ref, { readByWorker: true, readAt: serverTimestamp() });
        }
      });
    });

    return () => unsubscribe();
  }, [activeRoomId]);

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
  
  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden dir-rtl">
      {/* סרגל ניווט צדדי */}
      <nav className="w-16 bg-white border-l flex flex-col items-center py-6 shadow-sm z-20">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold mb-8">S</div>
        <div className="flex flex-col gap-4 w-full items-center">
          <button onClick={() => setActiveTab('dashboard')} className={`p-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}>
            <LayoutGrid size={24} />
          </button>
          <button onClick={() => setActiveTab('chats')} className={`p-3 rounded-xl transition-all relative ${activeTab === 'chats' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}>
            <MessageCircle size={24} />
            {stats.unread > 0 && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
          </button>
        </div>
        <button onClick={() => auth.signOut()} className="mt-auto mb-4 text-red-400 p-3"><LogOut size={24} /></button>
      </nav>

      {/* אזור תוכן ראשי */}
      <main className="flex-1 flex overflow-hidden relative">
        {activeTab === 'dashboard' && (
          <div className="flex-1 p-6 md:p-10 overflow-y-auto w-full">
            <header className="flex justify-between items-center mb-8">
              <h1 className="text-2xl font-bold text-gray-800">דשבורד ניהול</h1>
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><span className="text-sm font-bold">מחובר</span></div>
            </header>
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border"><div className="text-gray-400 text-xs font-bold uppercase mb-1">הזמנות היום</div><div className="text-3xl font-bold text-blue-600">{stats.orders}</div></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border"><div className="text-gray-400 text-xs font-bold uppercase mb-1">הודעות</div><div className="text-3xl font-bold text-orange-500">{stats.unread}</div></div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border p-6 h-[400px] flex flex-col">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> SLA Monitor</h3>
              <div className="flex-1 overflow-y-auto space-y-2">
                {Object.values(rooms).filter(r => r.unread > 0).map(room => (
                  <div key={room.id} onClick={() => {setActiveRoomId(room.id); setActiveTab('chats');}} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-blue-50">
                    <div className="flex items-center gap-3"><img src={room.avatar} className="w-8 h-8 rounded-full"/><span className="font-bold text-sm">{room.name}</span></div>
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded">{Math.floor((Date.now() - room.lastMsgTime)/60000)} דק'</span>
                  </div>
                ))}
                {Object.values(rooms).filter(r => r.unread > 0).length === 0 && <div className="text-center text-gray-400 py-10">אין פניות ממתינות 🎉</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="flex-1 flex w-full h-full bg-white">
            <div className={`w-full md:w-80 border-l bg-white flex flex-col ${activeRoomId ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-4 border-b font-bold text-lg">שיחות ({Object.keys(rooms).length})</div>
              <div className="flex-1 overflow-y-auto">
                {Object.values(rooms).sort((a, b) => b.lastMsgTime - a.lastMsgTime).map(room => (
                  <div key={room.id} onClick={() => setActiveRoomId(room.id)} className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${activeRoomId === room.id ? 'bg-blue-50' : ''}`}>
                    <div className="flex justify-between mb-1"><span className="font-bold text-sm">{room.name}</span>{room.unread > 0 && <span className="bg-red-500 text-white text-xs px-2 rounded-full">{room.unread}</span>}</div>
                    <div className="text-xs text-gray-500 truncate">{room.lastMsgText}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`flex-1 flex flex-col bg-[#efeae2] relative ${!activeRoomId ? 'hidden md:flex' : 'flex'}`}>
              {activeRoomId ? (
                <>
                  <div className="p-3 bg-white border-b flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setActiveRoomId(null)} className="md:hidden p-2">➜</button>
                      <span className="font-bold">{rooms[activeRoomId]?.name}</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-xl shadow-sm ${msg.senderId === auth.currentUser?.uid ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                          {msg.text}
                          <div className="text-[10px] text-gray-400 text-left mt-1">{msg.createdAt?.toDate().toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <form onSubmit={handleSendMessage} className="p-3 bg-white border-t flex gap-2">
                    <input value={inputText} onChange={e => setInputText(e.target.value)} className="flex-1 p-2 border rounded-lg" placeholder="הודעה..." />
                    <button type="submit" className="p-2 bg-[#00a884] text-white rounded-full"><Send size={20} /></button>
                  </form>
                </>
              ) : (
                <div className="m-auto text-gray-400">בחר שיחה להתחלה</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
