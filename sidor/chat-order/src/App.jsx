import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth, db, doc, getDoc } from './firebase'; 
import { Loader2 } from 'lucide-react';

// ייבוא כל הקומפוננטות
import WorkerDashboard from './components/WorkerDashboard';
import CustomerDashboard from './components/CustomerDashboard';
import AdminDashboard from './components/AdminDashboard'; // הייבוא החדש

const LoginScreen = ({ onLogin }) => (
  <div className="flex h-screen items-center justify-center bg-slate-100 flex-col gap-6">
    <h1 className="text-5xl font-bold text-blue-600">Saban Pro</h1>
    <button 
      onClick={onLogin} 
      className="bg-blue-600 text-white px-10 py-4 rounded-full font-bold shadow-xl hover:bg-blue-700 transition-all"
    >
      כניסה למערכת
    </button>
  </div>
);

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const workerDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (workerDoc.exists()) {
            setRole(workerDoc.data().role || 'worker');
          } else {
            const customerDoc = await getDoc(doc(db, 'customers', currentUser.uid));
            if (customerDoc.exists()) {
              setRole('customer');
            } else {
              // לבדיקה: אם אתה רוצה להיכנס כמנהל לצורך פיתוח, אפשר לשנות כאן זמנית ל-'admin'
              // או להגדיר את עצמך ב-Firestore עם שדה role: 'admin'
              setRole('guest'); 
            }
          }
        } catch (error) {
          console.error("Error fetching role:", error);
          setRole('guest');
        }
        setUser(currentUser);
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = () => {
    signInAnonymously(auth).catch((error) => alert(error.message));
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="dir-rtl">
      {role === 'admin' && <AdminDashboard />} {/* השימוש בקומפוננטה החדשה */}
      {role === 'worker' && <WorkerDashboard />}
      {role === 'customer' && <CustomerDashboard />}
      
      {role === 'guest' && (
        <div className="text-center p-10">
          <h2>ממתין לאישור ({user.uid})</h2>
          <p className="text-gray-500 mt-2">כדי לראות את מסך המנהל, שנה את התפקיד ב-DB ל-admin</p>
          <button onClick={() => auth.signOut()} className="text-red-500 mt-4">יציאה</button>
        </div>
      )}
    </div>
  );
}

export default App;
