import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
// Fix: Import directly from the firebase config file we created in the same structure
// Assuming lib/firebase.js exists in src/lib/firebase.js relative to src/App.jsx
import { auth, db } from './lib/firebase'; 
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

// ייבוא קומפוננטות (דמי, נחליף בהמשך בקוד האמיתי מהקבצים הישנים)
const WorkerDashboard = () => <div className="p-10 text-center"><h1 className="text-2xl font-bold text-blue-600">מסך נהג/עובד</h1><p>כאן יכנס התוכן של worker_app.html</p></div>;
const CustomerDashboard = () => <div className="p-10 text-center"><h1 className="text-2xl font-bold text-green-600">מסך לקוח</h1><p>כאן יכנס התוכן של customer_app.html</p></div>;
const AdminDashboard = () => <div className="p-10 text-center"><h1 className="text-2xl font-bold text-purple-600">מסך מנהל</h1><p>כאן יכנס התוכן של admin_master.html</p></div>;
const LoginScreen = ({ onLogin }) => (
  <div className="flex h-screen items-center justify-center bg-slate-100">
    <button onClick={onLogin} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 transition">
      כניסה למערכת (דמו)
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
        // בדיקת תפקיד המשתמש ב-Firestore
        try {
          // ננסה לבדוק אם הוא עובד
          const workerDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (workerDoc.exists()) {
            setRole(workerDoc.data().role || 'worker');
          } else {
            // אם לא עובד, נבדוק אם הוא לקוח
            const customerDoc = await getDoc(doc(db, 'customers', currentUser.uid));
            if (customerDoc.exists()) {
              setRole('customer');
            } else {
              // משתמש לא מזוהה - ברירת מחדל (למשל אורח או הרשמה)
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
    // לצורך הדמו - כניסה אנונימית
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

  // ניתוב חכם לפי תפקיד
  return (
    <div className="app-container dir-rtl">
      {role === 'admin' && <AdminDashboard />}
      {role === 'worker' && <WorkerDashboard />}
      {role === 'customer' && <CustomerDashboard />}
      {role === 'guest' && (
        <div className="text-center p-10">
          <h2 className="text-xl">ברוך הבא! החשבון שלך ממתין לאישור.</h2>
          <p className="text-gray-500">User ID: {user.uid}</p>
          <button onClick={() => auth.signOut()} className="mt-4 text-red-500 underline">התנתק</button>
        </div>
      )}
    </div>
  );
}

export default App;
