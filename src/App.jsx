import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, Plus, Image as ImageIcon, 
  X, Check, Clock, FileText, MapPin, Loader2, Save, Trash2,
  Filter, LayoutGrid, List as ListIcon, ExternalLink, Maximize2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, collection, query, onSnapshot, addDoc, 
  updateDoc, deleteDoc, doc, serverTimestamp, orderBy 
} from 'firebase/firestore';
// Make sure this import is here!
import { 
  getStorage, ref, uploadBytes, getDownloadURL 
} from 'firebase/storage';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDZtMiSEq34ScxPVhFUrJhsUeiVZ09WB3M",
  authDomain: "j-marinez-content-calendar.firebaseapp.com",
  projectId: "j-marinez-content-calendar",
  storageBucket: "j-marinez-content-calendar.firebasestorage.app",
  messagingSenderId: "253025943686",
  appId: "1:253025943686:web:def6b6d2cc235d5b375107"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // <--- This is the line you were missing!
const appId = 'j-marinez-calendar';

// --- Helper Functions ---
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200; // Increased resolution for better review quality
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8)); 
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

const POST_TYPES = {
  BLOG: { label: 'Monthly Blog', icon: FileText, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  GMB: { label: 'GMB Post', icon: MapPin, color: 'bg-green-100 text-green-700 border-green-200' }
};

const BUSINESSES = {
  HOWDY: { 
    label: 'Howdy, Sore Loser', 
    theme: 'bg-green-50', 
    color: 'text-green-900 border-green-200 ring-green-500', 
    icon: '🤠' 
  },
  PINK: { 
    label: 'Pink Shark', 
    theme: 'bg-pink-50', 
    color: 'text-pink-900 border-pink-200 ring-pink-500', 
    icon: '🦈' 
  }
};

const STATUSES = {
  IDEA: { label: 'Idea', color: 'bg-gray-100 text-gray-600' },
  DRAFT: { label: 'Drafting', color: 'bg-yellow-100 text-yellow-700' },
  REVIEW: { label: 'In Review', color: 'bg-purple-100 text-purple-700' },
  APPROVED: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
  PUBLISHED: { label: 'Published', color: 'bg-blue-600 text-white' }
};

// --- Components ---

const StatusBadge = ({ status }) => {
  const config = STATUSES[status] || STATUSES.IDEA;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
};

const PostModal = ({ isOpen, onClose, post, onSave, onDelete, date, initialType }) => {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'GMB',
    business: 'HOWDY',
    status: 'IDEA',
    imageUrl: '',
    externalLink: '',
    date: date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  });
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (post) {
      setFormData({
        title: post.title || '',
        content: post.content || '',
        type: post.type || 'GMB',
        business: post.business || 'HOWDY',
        status: post.status || 'IDEA',
        imageUrl: post.imageUrl || '',
        externalLink: post.externalLink || '',
        date: post.date || new Date().toISOString().split('T')[0]
      });
    } else if (date) {
      setFormData(prev => ({ 
        ...prev, 
        date: date.toISOString().split('T')[0], 
        title: '', 
        content: '', 
        imageUrl: '',
        type: initialType || 'GMB',
        business: 'HOWDY' 
      }));
    }
  }, [post, date, isOpen, initialType]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsProcessingImg(true);
    try {
      if (file.size > 5 * 1024 * 1024) {
        alert("File is too large. Please select an image under 5MB.");
        return;
      }
      const compressed = await compressImage(file);
      setFormData(prev => ({ ...prev, imageUrl: compressed }));
    } catch (err) {
      console.error("Image processing failed", err);
      alert("Failed to process image.");
    } finally {
      setIsProcessingImg(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, id: post?.id });
  };

  const currentBizConfig = BUSINESSES[formData.business] || BUSINESSES.HOWDY;
  const themeBgClass = currentBizConfig.theme;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        key={formData.business}
        className={`${themeBgClass} rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto`}
      >
        <div className={`flex items-center justify-between p-6 border-b border-black/5 sticky top-0 ${themeBgClass} z-10`}>
          <h2 className="text-xl font-bold text-slate-800">
            {post ? 'Edit Content' : (formData.type === 'BLOG' ? 'New Monthly Blog' : 'New Content Idea')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Business Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Select Business</label>
            <div className="grid grid-cols-2 gap-3">
              {Object.keys(BUSINESSES).map(bizKey => (
                <button
                  key={bizKey}
                  type="button"
                  onClick={() => setFormData({...formData, business: bizKey})}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold border transition-all duration-200 ${
                    formData.business === bizKey 
                      ? `${BUSINESSES[bizKey].theme} ${BUSINESSES[bizKey].color} ring-2 ring-offset-1 shadow-sm transform scale-[1.02]` 
                      : 'bg-white/50 border-slate-200 text-slate-500 hover:bg-white/80'
                  }`}
                >
                  <span className="text-lg">{BUSINESSES[bizKey].icon}</span>
                  {BUSINESSES[bizKey].label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input 
                type="date" 
                required
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="w-full p-2 border border-black/10 rounded-lg focus:ring-2 focus:ring-black/20 outline-none bg-white/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Content Type</label>
              <div className="flex gap-2">
                {Object.keys(POST_TYPES).map(typeKey => {
                  if (!post && !initialType && typeKey === 'BLOG') return null;
                  return (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => setFormData({...formData, type: typeKey})}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                        formData.type === typeKey 
                          ? 'bg-white border-black/10 text-slate-900 shadow-sm font-bold' 
                          : 'border-transparent text-slate-500 hover:bg-white/30'
                      }`}
                    >
                      {POST_TYPES[typeKey].label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(STATUSES).map(statusKey => (
                <button
                  key={statusKey}
                  type="button"
                  onClick={() => setFormData({...formData, status: statusKey})}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    formData.status === statusKey
                      ? 'ring-2 ring-offset-1 ring-black/10 border-transparent shadow-sm'
                      : 'border-transparent opacity-50 hover:opacity-100'
                  } ${STATUSES[statusKey].color}`}
                >
                  {STATUSES[statusKey].label}
                </button>
              ))}
            </div>
          </div>

          {/* Text Content */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title / Headline</label>
              <input 
                type="text" 
                placeholder="e.g., Top 5 Tips for Spring Cleaning..."
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
                className="w-full p-2 border border-black/10 rounded-lg focus:ring-2 focus:ring-black/20 outline-none bg-white/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description / Notes</label>
              <textarea 
                rows={4}
                placeholder="Jot down the main points, keywords, or draft content here..."
                value={formData.content}
                onChange={e => setFormData({...formData, content: e.target.value})}
                className="w-full p-2 border border-black/10 rounded-lg focus:ring-2 focus:ring-black/20 outline-none resize-none bg-white/50"
              />
            </div>
          </div>

          {/* IMAGE SECTION - UPDATED FOR BETTER VISIBILITY */}
          <div className="space-y-4 border-t border-black/5 pt-4">
            <label className="block text-sm font-medium text-slate-700">Image / Visual Asset</label>
            
            {formData.imageUrl ? (
              <div className="relative group w-full bg-slate-100/50 rounded-xl border border-black/5 p-2">
                <div className="relative overflow-hidden rounded-lg">
                  {/* Large Preview Image */}
                  <img 
                    src={formData.imageUrl} 
                    alt="Content Preview" 
                    className="w-full max-h-96 object-contain mx-auto"
                  />
                  
                  {/* Actions Overlay */}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, imageUrl: ''})}
                      className="bg-white/90 text-red-600 p-2 rounded-lg shadow-sm hover:bg-red-50 transition-colors border border-red-100"
                      title="Remove Image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                 <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-slate-300 bg-white/40 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-white/60 transition-all group"
                >
                  {isProcessingImg ? (
                    <div className="text-center">
                       <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-2" />
                       <span className="text-xs text-indigo-600 font-medium">Compressing...</span>
                    </div>
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 transition-colors mb-2" />
                      <span className="text-sm font-medium text-slate-600">Click to upload image</span>
                      <span className="text-xs text-slate-400">Supports PNG, JPG (Max 5MB)</span>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* Hidden Input */}
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
            />

            {/* External Link Fallback */}
            <div className="flex items-center gap-2">
               <ExternalLink className="w-4 h-4 text-slate-400" />
               <input 
                type="text" 
                placeholder="Or paste an external Drive/Dropbox link here..."
                value={formData.externalLink}
                onChange={e => setFormData({...formData, externalLink: e.target.value})}
                className="flex-1 text-sm p-2 border border-black/10 rounded-lg focus:ring-2 focus:ring-black/20 outline-none bg-white/50"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-black/5">
            {post && (
              <button 
                type="button"
                onClick={() => {
                  if(confirm("Are you sure you want to delete this content?")) onDelete(post.id);
                }}
                className="flex items-center text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button 
                type="button" 
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-sm transition-all transform active:scale-95 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" /> Save Content
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [posts, setPosts] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'list'
  const [loading, setLoading] = useState(true);
  const [initialPostType, setInitialPostType] = useState(null);

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    
    initAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, setUser);
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Using public collection for collaboration (shared view)
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'content_posts'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPosts(fetchedPosts);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // --- Actions ---
  const handleSave = async (postData) => {
    if (!user) return;
    const { id, ...data } = postData;
    
    try {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'content_posts');
      
      if (id) {
        await updateDoc(doc(colRef, id), {
          ...data,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        });
      } else {
        await addDoc(colRef, {
          ...data,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
      }
      setEditingPost(null);
      setSelectedDate(null);
      setInitialPostType(null);
    } catch (err) {
      console.error("Error saving post:", err);
      alert("Failed to save. Check your connection.");
    }
  };

  const handleDelete = async (postId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'content_posts', postId));
      setEditingPost(null);
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const handleAddMonthlyBlog = () => {
    // Set date to 1st of current month view so it appears at the start
    const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    setInitialPostType('BLOG');
    setSelectedDate(firstOfMonth);
  };

  // --- Calendar Logic ---
  const daysInMonth = useMemo(() => getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth()), [currentDate]);
  const firstDay = useMemo(() => getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth()), [currentDate]);
  
  const calendarDays = useMemo(() => {
    const days = [];
    // Padding for prev month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
    }
    return days;
  }, [daysInMonth, firstDay, currentDate]);

  const changeMonth = (delta) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1));
  };

  const getPostsForDate = (date) => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return posts.filter(p => p.date === dateStr);
  };

  // --- Render Helpers ---
  const renderPostCard = (post, isCompact = false) => {
    const TypeIcon = POST_TYPES[post.type]?.icon || FileText;
    const bizConfig = BUSINESSES[post.business] || BUSINESSES.HOWDY;
    const bizTheme = BUSINESSES[post.business] ? BUSINESSES[post.business].color : BUSINESSES.HOWDY.color;
    
    // Extract a color for the badge
    const badgeColor = bizTheme.split(' ')[0].replace('text-', 'bg-').replace('-900', '-50'); // simple heuristic or just use config

    return (
      <div 
        key={post.id}
        onClick={(e) => { e.stopPropagation(); setEditingPost(post); }}
        className={`group bg-white rounded border shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden ${isCompact ? 'p-1 mb-1 text-[10px]' : 'p-3 mb-3'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-1">
              {/* Business Icon Badge */}
              <span title={bizConfig.label} className="text-xs mr-1">{bizConfig.icon}</span>
              <TypeIcon className={`w-3 h-3 ${post.type === 'BLOG' ? 'text-blue-500' : 'text-green-500'}`} />
              {!isCompact && <StatusBadge status={post.status} />}
            </div>
            <p className={`font-medium text-slate-800 truncate ${isCompact ? 'leading-tight' : ''}`}>
              {post.title || 'Untitled Idea'}
            </p>
          </div>
          {(post.imageUrl || post.externalLink) && (
            <div className="w-8 h-8 rounded bg-slate-100 flex-shrink-0 overflow-hidden">
               {post.imageUrl ? (
                 <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
               ) : (
                 <ExternalLink className="w-4 h-4 m-2 text-slate-400" />
               )}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!user || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-700 to-purple-600 bg-clip-text text-transparent hidden sm:block">
              J-Marinez Content Calendar
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode('calendar')}
                className={`p-2 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ListIcon className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => setSelectedDate(new Date())}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" /> New Idea
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Stats / Quick Legend */}
        <div className="mb-6 flex flex-wrap gap-4 items-center text-sm text-slate-600">
          <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border shadow-sm">
            <span>🤠 Howdy SL</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border shadow-sm">
            <span>🦈 Pink Shark</span>
          </div>
          <div className="h-4 w-px bg-slate-300 mx-2 hidden sm:block"></div>
          <span className="hidden sm:inline">Total Ideas: <strong>{posts.length}</strong></span>
        </div>

        {viewMode === 'calendar' ? (
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            {/* Calendar Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b bg-slate-50/50 gap-4">
              <div className="flex items-center justify-between w-full sm:w-auto sm:justify-start gap-4">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                <h2 className="text-lg font-bold text-slate-800 w-40 text-center">
                  {currentDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <button
                onClick={handleAddMonthlyBlog}
                className="w-full sm:w-80 flex items-center justify-center gap-3 px-6 py-3 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-xl text-base font-bold transition-all shadow-sm hover:shadow-md"
              >
                <FileText className="w-5 h-5" />
                Plan Monthly Blog
              </button>
            </div>

            {/* Week Headers */}
            <div className="grid grid-cols-7 border-b divide-x divide-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center py-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-2">{day}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-50">
              {calendarDays.map((date, idx) => {
                const isToday = date && new Date().toDateString() === date.toDateString();
                const dayPosts = getPostsForDate(date);

                return (
                  <div 
                    key={idx} 
                    onClick={() => date && setSelectedDate(date)}
                    className={`min-h-[120px] bg-white relative group transition-colors ${date ? 'hover:bg-indigo-50/30 cursor-pointer' : ''}`}
                  >
                    {date && (
                      <>
                        <div className={`p-2 flex justify-between items-start ${isToday ? 'bg-indigo-50/50' : ''}`}>
                          <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'}`}>
                            {date.getDate()}
                          </span>
                          <button 
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-indigo-100 rounded text-indigo-600 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setSelectedDate(date); }}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="px-1 pb-1 space-y-1 overflow-y-auto max-h-[100px]">
                          {dayPosts.map(post => renderPostCard(post, true))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                  <Calendar className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">No content yet</h3>
                <p className="text-slate-500 mb-4">Get started by planning your first post.</p>
                <button 
                  onClick={() => setSelectedDate(new Date())}
                  className="text-indigo-600 hover:underline font-medium"
                >
                  Create a Post
                </button>
              </div>
            ) : (
              [...posts].sort((a,b) => new Date(a.date) - new Date(b.date)).map(post => {
                 const bizConfig = BUSINESSES[post.business] || BUSINESSES.HOWDY;
                 const bizTheme = bizConfig.color;
                 const badgeColor = bizTheme.split(' ')[0].replace('text-', 'bg-').replace('-900', '-50');

                 return (
                 <div key={post.id} onClick={() => setEditingPost(post)} className="bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row gap-4">
                   <div className="w-full sm:w-32 h-32 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden border">
                      {post.imageUrl ? (
                        <img src={post.imageUrl} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                   </div>
                   <div className="flex-1">
                     <div className="flex items-center gap-2 mb-2">
                       <span className={`text-xs font-bold px-2 py-1 rounded-full border ${badgeColor} ${bizTheme}`}>
                          {bizConfig.icon} {bizConfig.label}
                       </span>
                       <StatusBadge status={post.status} />
                       <span className="text-xs text-slate-400 flex items-center">
                         <Clock className="w-3 h-3 mr-1" />
                         {post.date}
                       </span>
                     </div>
                     <h3 className="text-lg font-bold text-slate-800 mb-1">{post.title || 'Untitled Post'}</h3>
                     <p className="text-slate-600 text-sm line-clamp-2 mb-3">{post.content}</p>
                     <div className="flex items-center gap-2">
                       {post.type === 'BLOG' ? (
                         <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">Blog Post</span>
                       ) : (
                         <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100">GMB Post</span>
                       )}
                     </div>
                   </div>
                 </div>
              )})
            )}
          </div>
        )}

        {/* Modals */}
        <PostModal 
          isOpen={!!selectedDate || !!editingPost} 
          onClose={() => { setSelectedDate(null); setEditingPost(null); setInitialPostType(null); }}
          post={editingPost}
          date={selectedDate}
          initialType={initialPostType}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}