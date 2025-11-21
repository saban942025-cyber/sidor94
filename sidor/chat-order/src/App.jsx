import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
// תיקון: הפנייה לקובץ באותה תיקייה
import { auth, db } from './firebase'; 
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

// קומפוננטות זמניות (Placeholders)
const WorkerDashboard = () => <div className="p-10 text-center"><h1 className="text-2xl font-bold text-blue-600">מסך נהג/עובד</h1><p>מערכת הנהגים בטעינה...</p></div>;
const CustomerDashboard = () => <div className="p-10 text-center"><h1 className="text-2xl font-bold text-green-600">מסך לקוח</h1><p>מערכת הלקוחות בטעינה...</p></div>;
const AdminDashboard = () => <div className="p-10 text-center"><h1 className="text-2xl font-bold text-purple-600">מסך מנהל</h1><p>מערכת הניהול בטעינה...</p></div>;

const LoginScreen = ({ onLogin }) => (
  <div className="flex h-screen items-center justify-center bg-slate-100 flex-col gap-4">
    <div className="text-4xl font-bold text-blue-600 mb-2">Saban Pro</div>
    <p className="text-gray-500 mb-4">מערכת לוגיסטיקה מתקדמת</p>
    <button onClick={onLogin} className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-blue-700 transition flex items-center gap-2">
      כניסה למערכת
    </button>
  </div>
);

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'worker', 'customer', 'admin'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // בדיקת תפקיד המשתמש ב-Firestore
          const workerDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (workerDoc.exists()) {
            setRole(workerDoc.data().role || 'worker');
          } else {
            const customerDoc = await getDoc(doc(db, 'customers', currentUser.uid));
            if (customerDoc.exists()) {
              setRole('customer');
            } else {
              setRole('guest'); 
            }
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app-container dir-rtl min-h-screen bg-gray-50">
      {role === 'admin' && <AdminDashboard />}
      {role === 'worker' && <WorkerDashboard />}
      {role === 'customer' && <CustomerDashboard />}
      {role === 'guest' && (
        <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">ברוך הבא!</h2>
          <p className="text-gray-600 mb-6">החשבון שלך נוצר וממתין לאישור מנהל.</p>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
            <p className="text-xs text-gray-400 uppercase font-bold mb-1">מזהה משתמש (UID)</p>
            <code className="text-sm bg-gray-100 p-1 rounded select-all">{user.uid}</code>
          </div>
          <button onClick={() => auth.signOut()} className="text-red-500 hover:text-red-700 font-medium underline">התנתק</button>
        </div>
      )}
    </div>
  );
}

export default App;
