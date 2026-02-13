import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query
} from 'firebase/firestore';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  X,
  Check,
  Settings,
  Info,
  LogOut,
  LogIn
} from 'lucide-react';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'community-calendar-v1';

// Preset Avatars for users to choose from
const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jasper',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Sasha',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Toby',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Milo',
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function App() {
  const [user, setUser] = useState(null);
  const [entries, setEntries] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(true);

  // 1. Authentication Lifecycle
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Use Google profile data, fall back to localStorage overrides
        const savedName = localStorage.getItem(`name_${u.uid}`);
        const savedAvatar = localStorage.getItem(`avatar_${u.uid}`);
        setUserName(savedName || u.displayName || '');
        setUserAvatar(savedAvatar || u.photoURL || AVATARS[0]);
        // Always start on today's month when user logs in
        setCurrentDate(new Date());
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Sign-In Error:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUserName('');
      setUserAvatar(AVATARS[0]);
    } catch (error) {
      console.error("Sign-Out Error:", error);
    }
  };

  // 2. Real-time Data Synchronization
  useEffect(() => {
    if (!user) return;

    const entriesRef = collection(db, 'artifacts', appId, 'public', 'data', 'userEntries');
    const q = query(entriesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEntries(data);
    }, (err) => {
      console.error("Firestore Error:", err);
    });

    return () => unsubscribe();
  }, [user]);

  // Find the current user's entry (if any)
  const myEntry = useMemo(() => entries.find(e => e.id === user?.uid), [entries, user]);

  // Generate Calendar Data for the current view
  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];

    // Prev month padding
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, isCurrentMonth: false, dateStr: null });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      cells.push({ day: i, isCurrentMonth: true, dateStr });
    }

    // Next month padding to fill 6 weeks (42 cells)
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ day: i, isCurrentMonth: false, dateStr: null });
    }

    return cells;
  }, [currentDate]);

  // Handlers
  const handleDateClick = async (dateStr) => {
    if (!user) return;
    const displayName = userName.trim() || user.displayName || '';
    if (!displayName) {
      setShowProfileModal(true);
      return;
    }

    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'userEntries', user.uid);
    await setDoc(docRef, {
      userId: user.uid,
      displayName: displayName || 'New User',
      avatar: userAvatar,
      date: dateStr,
      timestamp: Date.now()
    });
  };

  const handleClearEntry = async () => {
    if (!user || !myEntry) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'userEntries', user.uid);
    await deleteDoc(docRef);
  };

  const saveProfile = () => {
    localStorage.setItem(`name_${user?.uid}`, userName);
    localStorage.setItem(`avatar_${user?.uid}`, userAvatar);
    setShowProfileModal(false);
    // Refresh existing DB entry with new profile data if user already has a day claimed
    if (myEntry) {
      handleDateClick(myEntry.date);
    }
  };

  const navigateMonth = (offset) => {
    const next = new Date(currentDate);
    next.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(next);
  };

  const jumpToDate = (dateStr) => {
    const [year, month] = dateStr.split('-').map(Number);
    setCurrentDate(new Date(year, month - 1, 1));
  };

  // Sort entries by date for the summary strip
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-10 max-w-sm w-full text-center space-y-6">
          <CalendarIcon className="text-blue-600 w-12 h-12 mx-auto" />
          <h1 className="text-2xl font-black text-slate-800">Digitals Calendar</h1>
          <p className="text-slate-500 text-sm">Sign in to select your day on the calendar</p>
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-2xl font-bold text-sm transition-all shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900">
      <div className="max-w-6xl mx-auto">

        {/* Navbar */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
              <CalendarIcon className="text-blue-600 w-8 h-8" />
              Digitals Calendar
            </h1>
            <p className="text-slate-500 text-sm font-medium">One person, One day. Claim yours! Don't be serious</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-3 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 transition-colors rounded-full font-bold text-sm border border-slate-200 shadow-sm"
            >
              <img src={userAvatar} alt="Me" className="w-8 h-8 rounded-full bg-white border border-slate-200" referrerPolicy="no-referrer" />
              <span>{userName || 'Setup Profile'}</span>
              <Settings size={16} className="text-slate-400" />
            </button>
            <button
              onClick={handleSignOut}
              className="p-2.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 transition-colors rounded-full border border-slate-200 shadow-sm"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Avatar Summary Strip */}
        {sortedEntries.length > 0 && (
          <div className="mb-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
              {sortedEntries.length} {sortedEntries.length === 1 ? 'person' : 'people'} selected
            </p>
            <div className="flex flex-wrap gap-2">
              {sortedEntries.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => jumpToDate(entry.date)}
                  className="group relative"
                  title={`${entry.displayName} — ${new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                >
                  <img
                    src={entry.avatar}
                    alt={entry.displayName}
                    referrerPolicy="no-referrer"
                    className={`
                      w-10 h-10 rounded-full object-cover border-2 shadow-sm transition-all hover:scale-110 hover:shadow-md cursor-pointer
                      ${entry.id === user?.uid ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-white hover:border-slate-300'}
                    `}
                  />
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-20">
                    <div className="bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap font-bold shadow-lg">
                      {entry.displayName}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User Engagement Banner */}
        <div className="mb-8">
          {myEntry ? (
            <div className="bg-blue-600 text-white p-5 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Check size={24} />
                </div>
                <div>
                  <p className="font-bold">You selected {new Date(myEntry.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  <p className="text-blue-100 text-sm">Need a different day? Just click a new date on calendar.</p>
                </div>
              </div>
              <button
                onClick={handleClearEntry}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-black uppercase tracking-widest transition-colors"
              >
                Cancel this day!
              </button>
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-300 p-6 rounded-2xl flex items-center gap-4 text-slate-500 italic">
              <Info size={24} className="text-slate-400" />
              <p>Your profile isn't on the board yet. Pick a day to get started!</p>
            </div>
          )}
        </div>

        {/* Calendar Navigation */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <button onClick={() => navigateMonth(-1)} className="p-3 hover:bg-slate-50 transition border-r border-slate-100">
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-6 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition"
            >
              Today
            </button>
            <button onClick={() => navigateMonth(1)} className="p-3 hover:bg-slate-50 transition border-l border-slate-100">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="py-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarCells.map((cell, i) => {
              const dayEntries = entries.filter(e => e.date === cell.dateStr);
              const isToday = cell.dateStr === new Date().toISOString().split('T')[0];
              const isSelectedByMe = myEntry?.date === cell.dateStr;

              return (
                <div
                  key={i}
                  onClick={() => cell.isCurrentMonth && handleDateClick(cell.dateStr)}
                  className={`
                    relative min-h-[120px] md:min-h-[160px] p-3 border-r border-b border-slate-100 transition-all
                    ${cell.isCurrentMonth ? 'bg-white cursor-pointer hover:bg-slate-50' : 'bg-slate-50/50 opacity-40 grayscale pointer-events-none'}
                    ${isSelectedByMe ? 'ring-4 ring-inset ring-blue-500/10 bg-blue-50/30' : ''}
                  `}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className={`
                      text-sm font-bold w-8 h-8 flex items-center justify-center rounded-xl transition-colors
                      ${isToday ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-400'}
                      ${isSelectedByMe ? 'text-blue-600 font-black' : ''}
                    `}>
                      {cell.day}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {dayEntries.map(entry => (
                      <div key={entry.id} className="group relative">
                        <img
                          src={entry.avatar}
                          alt={entry.displayName}
                          className={`
                            w-10 h-10 md:w-14 md:h-14 rounded-2xl object-cover border-2 shadow-sm transition-transform hover:scale-110
                            ${entry.id === user?.uid ? 'border-blue-500 ring-4 ring-blue-500/10 scale-105' : 'border-white'}
                          `}
                        />
                        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                          <div className="bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap font-bold shadow-lg">
                            {entry.displayName} {entry.id === user?.uid ? '(You)' : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Profile Setup Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black text-slate-800">Your Identity</h3>
              <button onClick={() => setShowProfileModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={24} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Display Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Astro Explorer"
                  className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all font-bold"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Choose Avatar</label>
                <div className="grid grid-cols-3 gap-4">
                  {AVATARS.map((av, i) => (
                    <button
                      key={i}
                      onClick={() => setUserAvatar(av)}
                      className={`
                        relative aspect-square rounded-2xl border-4 transition-all overflow-hidden
                        ${userAvatar === av ? 'border-blue-500 scale-105 shadow-xl' : 'border-transparent bg-slate-50 hover:bg-slate-100'}
                      `}
                    >
                      <img src={av} alt="option" className="w-full h-full p-1" />
                      {userAvatar === av && (
                        <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                          <Check className="text-blue-600" size={32} strokeWidth={4} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={saveProfile}
                disabled={!userName.trim()}
                className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-black rounded-2xl shadow-xl shadow-blue-200 transition-all transform active:scale-95"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
