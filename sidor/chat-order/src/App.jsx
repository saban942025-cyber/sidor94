import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth, db, doc, getDoc } from './firebase'; 
import { Loader2 } from 'lucide-react';

// ייבוא הקומפוננטה החדשה
import WorkerDashboard from './components/WorkerDashboard';

const CustomerDashboard = () => (
  <div className="p-10 text-center bg-green-50 min-h-screen">
    <h1 className="text-3xl font-bold text-green-700">לקוח</h1>
  </div>
);

const AdminDashboard = () => (
  <div className="p-10 text-center bg-purple-50 min-h-screen">
    <h1 className="text-3xl font-bold text-purple-700">מנהל</h1>
  </div>
);

const LoginScreen = ({ onLogin }) => (
  <div className="flex h-screen items-center justify-center bg-slate-100 flex-col gap-6">
    <h1 className="text-5xl font-bold text-blue-600">Saban Pro</h1>
    <button onClick={onLogin} className="bg-blue-600 text-white px-10 py-4 rounded-full font-bold shadow-xl">כניסה</button>
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
            setRole('guest'); // ברירת מחדל לאורח עד שיאושר
          }
        } catch (error) {
          console.error("Error:", error);
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
      {role === 'admin' && <AdminDashboard />}
      {role === 'worker' && <WorkerDashboard />} {/* כאן מוצגת הקומפוננטה החדשה */}
      {role === 'customer' && <CustomerDashboard />}
      {role === 'guest' && <div className="text-center p-10"><h2>ממתין לאישור ({user.uid})</h2><button onClick={() => auth.signOut()} className="text-red-500 mt-4">יציאה</button></div>}
    </div>
  );
}

export default App;
