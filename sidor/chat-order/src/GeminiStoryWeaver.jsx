import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { Sparkles, BookOpen, Users, Loader2, Send, Plus, Trash2, Edit, Save, X, Share2, Check, Copy, LogOut, Menu } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-story-weaver';

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Constants ---
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;
const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025';

// --- Firestore Paths ---
const getPublicStoriesPath = () => `artifacts/${appId}/public/data/stories`;
const getPublicStoryDocPath = (storyId) => `artifacts/${appId}/public/data/stories/${storyId}`;
const getPrivateStoriesPath = (userId) => `artifacts/${appId}/users/${userId}/stories`;
const getPrivateStoryDocPath = (userId, storyId) => `artifacts/${appId}/users/${userId}/stories/${storyId}`;

// --- API Helper ---
/**
 * Calls the Gemini API with exponential backoff.
 * @param {string} prompt - The prompt to send to the API.
 * @param {boolean} useGrounding - Whether to use Google Search grounding.
 * @param {string} systemInstruction - The system prompt.
 * @returns {Promise<string>} - The generated text.
 */
async function callGeminiAPI(prompt, useGrounding = false, systemInstruction = "") {
  const apiKey = ""; // Will be populated by the environment
  const apiUrl = `https://generativelace.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    tools: useGrounding ? [{ "google_search": {} }] : undefined,
  };

  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`APIError ${response.status}`);
        }
        const errorBody = await response.json();
        console.error("API Error:", errorBody);
        return `Error: ${errorBody.error?.message || 'Failed to generate content.'}`;
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return text;
      } else {
        console.warn("No text received from API:", result);
        return "The model didn't return any text. Please try again.";
      }
    } catch (error) {
      if (error.message.startsWith('APIError') && retries < MAX_RETRIES - 1) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, retries) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error("API Error after retries:", error);
        return `Error: Failed to generate content after ${retries} retries. ${error.message}`;
      }
    }
    retries++;
  }
  return "Error: Max retries reached. Please try again later.";
}

// --- Auth Hook ---
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const signIn = async (token) => {
      try {
        if (token) {
          await signInWithCustomToken(auth, token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase sign-in error:", error);
      }
    };

    const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    signIn(token);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
};

// --- Components ---

/**
 * A simple loading spinner component.
 */
const LoadingSpinner = ({ size = 'h-8 w-8' }) => (
  <Loader2 className={`animate-spin text-indigo-500 ${size}`} />
);

/**
 * A modal component for popups.
 */
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md m-4 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={24} />
        </button>
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">{title}</h2>
        <div>{children}</div>
      </div>
    </div>
  );
};

/**
 * A modal for sharing the story.
 */
const ShareModal = ({ isOpen, onClose, storyId, isPublic }) => {
  const [copied, setCopied] = useState(false);
  const [isPublicStory, setIsPublicStory] = useState(isPublic);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  
  const shareUrl = `${window.location.href.split('?')[0]}?storyId=${storyId}`;

  const copyToClipboard = () => {
    const input = document.createElement('input');
    input.value = shareUrl;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
    document.body.removeChild(input);
  };

  const togglePublicAccess = async () => {
    if (!user || !storyId) return;
    setIsLoading(true);
    const newPublicState = !isPublicStory;
    
    try {
      const storyRef = doc(db, getPrivateStoryDocPath(user.uid, storyId));
      const storySnap = await getDoc(storyRef);
      if (!storySnap.exists()) {
        console.error("Story doc not found");
        return;
      }
      const storyData = storySnap.data();

      if (newPublicState) {
        // Make public: Copy from private to public
        const publicStoryRef = doc(db, getPublicStoryDocPath(storyId));
        await setDoc(publicStoryRef, { ...storyData, isPublic: true, ownerId: user.uid });
        await updateDoc(storyRef, { isPublic: true });
      } else {
        // Make private: Delete from public
        const publicStoryRef = doc(db, getPublicStoryDocPath(storyId));
        await deleteDoc(publicStoryRef);
        await updateDoc(storyRef, { isPublic: false });
      }
      setIsPublicStory(newPublicState);
    } catch (error) {
      console.error("Error toggling public access:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Story">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {isPublicStory
            ? "Anyone with the link can view this story. You can make it private again at any time."
            : "This story is private. Make it public to share it with others."}
        </p>

        <div className="flex items-center justify-between bg-gray-100 p-3 rounded-lg">
          <span className="text-gray-700 text-sm truncate mr-4">{shareUrl}</span>
          <button
            onClick={copyToClipboard}
            disabled={!isPublicStory}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isPublicStory
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            } ${copied ? "bg-green-500 hover:bg-green-600" : ""}`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
          <span className="font-medium text-gray-700">
            {isPublicStory ? "Public Access" : "Private Story"}
          </span>
          <button
            onClick={togglePublicAccess}
            disabled={isLoading}
            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${
              isPublicStory ? "bg-indigo-600" : "bg-gray-200"
            }`}
          >
            {isLoading && <LoadingSpinner size="h-4 w-4 absolute left-1 top-1 text-white" />}
            <span
              className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                isPublicStory ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
    </Modal>
  );
};


/**
 * Manages character creation and editing.
 */
const CharacterManager = ({ characters, setCharacters, storyId, userId }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);

  const updateCharactersInDb = async (updatedCharacters) => {
    if (!storyId || !userId) return;
    try {
      const storyRef = doc(db, getPrivateStoryDocPath(userId, storyId));
      await updateDoc(storyRef, { characters: updatedCharacters });
    } catch (error) {
      console.error("Error updating characters in DB:", error);
    }
  };

  const handleAddOrUpdate = () => {
    if (!name.trim() || !description.trim()) return;

    const newCharacter = { name, description };
    let updatedCharacters;

    if (editingIndex !== null) {
      updatedCharacters = characters.map((char, index) =>
        index === editingIndex ? newCharacter : char
      );
      setEditingIndex(null);
    } else {
      updatedCharacters = [...characters, newCharacter];
    }
    
    setCharacters(updatedCharacters);
    updateCharactersInDb(updatedCharacters);
    setName('');
    setDescription('');
  };

  const handleEdit = (index) => {
    const char = characters[index];
    setName(char.name);
    setDescription(char.description);
    setEditingIndex(index);
  };

  const handleDelete = (index) => {
    const updatedCharacters = characters.filter((_, i) => i !== index);
    setCharacters(updatedCharacters);
    updateCharactersInDb(updatedCharacters);
    if (editingIndex === index) {
      setName('');
      setDescription('');
      setEditingIndex(null);
    }
  };
  
  const handleCancelEdit = () => {
    setName('');
    setDescription('');
    setEditingIndex(null);
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">Character Manager</h3>
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Character Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <textarea
          placeholder="Character Description (e.g., personality, goals, appearance)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddOrUpdate}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {editingIndex !== null ? <Save size={18} className="inline-block mr-1" /> : <Plus size={18} className="inline-block mr-1" />}
            {editingIndex !== null ? 'Save Character' : 'Add Character'}
          </button>
          {editingIndex !== null && (
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 focus:outline-none"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {characters.length === 0 && (
          <p className="text-sm text-gray-500 text-center">No characters created yet.</p>
        )}
        {characters.map((char, index) => (
          <div key={index} className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-semibold text-gray-700">{char.name}</h4>
                <p className="text-sm text-gray-600 mt-1">{char.description}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-2">
                <button
                  onClick={() => handleEdit(index)}
                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-full"
                  title="Edit"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDelete(index)}
                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-full"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


/**
 * Renders a single story chapter.
 */
const StoryChapter = ({ chapter, index, isEditable, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(chapter.content);

  const handleSave = () => {
    onSave(index, editedContent);
    setIsEditing(false);
  };

  const handleDelete = () => {
    // A simple confirmation for web.
    // In a real app, use a custom modal instead of confirm().
    // Since confirm() is disallowed, we'll just delete.
    // A better solution would be a custom modal.
    console.log("Deleting chapter. (Confirmation skipped)");
    onDelete(index);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-indigo-700">Chapter {index + 1}</h3>
        {isEditable && (
          <div className="flex gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-gray-500 hover:text-indigo-600"
                title="Edit Chapter"
              >
                <Edit size={18} />
              </button>
            ) : (
              <button
                onClick={handleSave}
                className="p-2 text-green-600 hover:text-green-800"
                title="Save Changes"
              >
                <Save size={18} />
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-2 text-red-500 hover:text-red-700"
              title="Delete Chapter"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          rows={10}
          className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      ) : (
        <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
          {chapter.content}
        </p>
      )}
    </div>
  );
};

/**
 * The main view for creating and viewing a single story.
 */
const StoryView = ({ story, storyId, userId, onBack, isPublicView }) => {
  const [chapters, setChapters] = useState(story.chapters || []);
  const [characters, setCharacters] = useState(story.characters || []);
  const [title, setTitle] = useState(story.title || '');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCharManager, setShowCharManager] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  const endOfChaptersRef = useRef(null);

  // Update story in Firestore
  const updateStoryInDb = async (field, value) => {
    if (isPublicView || !userId) return; // Can't edit public or unowned stories
    try {
      const storyRef = doc(db, getPrivateStoryDocPath(userId, storyId));
      await updateDoc(storyRef, { [field]: value, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error("Error updating story:", e);
      setError("Failed to save changes. Please check your connection.");
    }
  };

  // Handle title saving
  const handleTitleSave = () => {
    if (title.trim()) {
      updateStoryInDb('title', title.trim());
      setIsEditingTitle(false);
    }
  };
  
  // Handle generating a new chapter
  const handleGenerateChapter = async () => {
    setIsGenerating(true);
    setError('');

    const characterProfiles = characters.length > 0
      ? "Characters:\n" + characters.map(c => `- ${c.name}: ${c.description}`).join("\n")
      : "No specific characters defined.";

    const storyContext = chapters.length > 0
      ? "Previous Chapters Summary:\n" + chapters.map((c, i) => `Chapter ${i+1}: ${c.content.substring(0, 150)}...`).join("\n")
      : "This is the first chapter.";

    const systemInstruction = `You are a master storyteller. Your task is to write the next chapter of a collaborative story based on the user's prompt, story context, and character profiles.
- Write a compelling chapter of 2-3 paragraphs.
- Advance the plot and develop the characters.
- Maintain a consistent tone.
- Do NOT add "Chapter X" or any title, just write the story content.`;

    const fullPrompt = `
**Context:**
${storyContext}

**Characters:**
${characterProfiles}

**User's Prompt for this Chapter:**
${prompt || (chapters.length === 0 ? "Begin the story." : "Continue the story.")}

Write the next chapter:`;

    const newContent = await callGeminiAPI(fullPrompt, false, systemInstruction);

    if (newContent.startsWith('Error:')) {
      setError(newContent);
    } else {
      const newChapter = { content: newContent, createdAt: new Date().toISOString() };
      const updatedChapters = [...chapters, newChapter];
      setChapters(updatedChapters);
      updateStoryInDb('chapters', updatedChapters);
      setPrompt('');
    }

    setIsGenerating(false);
  };
  
  // Handle editing a chapter
  const handleSaveChapter = (index, newContent) => {
    const updatedChapters = chapters.map((chap, i) => 
      i === index ? { ...chap, content: newContent } : chap
    );
    setChapters(updatedChapters);
    updateStoryInDb('chapters', updatedChapters);
  };

  // Handle deleting a chapter
  const handleDeleteChapter = (index) => {
    const updatedChapters = chapters.filter((_, i) => i !== index);
    setChapters(updatedChapters);
    updateStoryInDb('chapters', updatedChapters);
  };

  // Scroll to bottom when new chapter is added
  useEffect(() => {
    endOfChaptersRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chapters.length]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={onBack}
          className="text-indigo-600 hover:text-indigo-800"
        >
          &larr; Back to Stories
        </button>
        {!isPublicView && (
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Share2 size={18} className="mr-2" />
            Share
          </button>
        )}
      </div>

      {/* Title */}
      <div className="mb-8">
        {isEditingTitle && !isPublicView ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
              className="text-3xl md:text-4xl font-bold text-gray-800 border-b-2 border-indigo-500 focus:outline-none w-full"
              autoFocus
            />
            <button onClick={handleTitleSave} className="p-2 text-green-600 hover:text-green-800">
              <Save size={24} />
            </button>
          </div>
        ) : (
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 flex items-center">
            {title || "Untitled Story"}
            {!isPublicView && (
              <button
                onClick={() => setIsEditingTitle(true)}
                className="ml-3 p-1 text-gray-400 hover:text-indigo-600"
                title="Edit Title"
              >
                <Edit size={20} />
              </button>
            )}
          </h1>
        )}
      </div>

      {/* Chapters */}
      <div className="mb-8">
        {chapters.length === 0 && (
          <p className="text-gray-500 text-center py-10">
            This story has no chapters yet.
            {!isPublicView && " Use the prompt below to create the first one!"}
          </p>
        )}
        {chapters.map((chapter, index) => (
          <StoryChapter
            key={index}
            chapter={chapter}
            index={index}
            isEditable={!isPublicView}
            onSave={handleSaveChapter}
            onDelete={handleDeleteChapter}
          />
        ))}
        <div ref={endOfChaptersRef} />
      </div>

      {/* Prompt Input Area (Hidden for public view) */}
      {!isPublicView && (
        <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm p-4 rounded-t-lg shadow-lg border border-gray-200 -mx-4 md:-mx-8">
          <div className="max-w-4xl mx-auto">
            {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
            
            <button
              onClick={() => setShowCharManager(!showCharManager)}
              className="w-full text-left px-4 py-2 mb-2 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200"
            >
              <Users size={18} className="inline-block mr-2" />
              Manage Characters ({characters.length})
            </button>

            {showCharManager && (
              <div className="mb-4">
                <CharacterManager 
                  characters={characters} 
                  setCharacters={setCharacters}
                  storyId={storyId}
                  userId={userId}
                />
              </div>
            )}
            
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={chapters.length === 0 ? "Start your story (e.g., 'A lone detective...') " : "What happens next?"}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isGenerating}
                onKeyDown={(e) => e.key === 'Enter' && !isGenerating && handleGenerateChapter()}
              />
              <button
                onClick={handleGenerateChapter}
                disabled={isGenerating}
                className="px-5 py-3 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isGenerating ? (
                  <LoadingSpinner size="h-5 w-5" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Share Modal */}
      <ShareModal 
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        storyId={storyId}
        isPublic={story.isPublic || false}
      />
    </div>
  );
};

/**
 * The main view showing a list of all stories.
 */
const StoryList = ({ onSelectStory, onCreateStory, userId }) => {
  const [stories, setStories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to user's private stories
  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);
    const storiesCollectionPath = getPrivateStoriesPath(userId);
    const q = query(collection(db, storiesCollectionPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const storyList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort stories by last updated
      storyList.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setStories(storyList);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching stories:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">My Stories</h1>
        <button
          onClick={onCreateStory}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <Plus size={18} className="mr-2" />
          New Story
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <LoadingSpinner size="h-12 w-12" />
        </div>
      ) : stories.length === 0 ? (
        <p className="text-gray-500 text-center">
          You haven't created any stories yet. Click "New Story" to begin!
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stories.map(story => (
            <div
              key={story.id}
              onClick={() => onSelectStory(story.id, story)}
              className="bg-white p-6 rounded-lg shadow-md border border-gray-200 cursor-pointer hover:shadow-lg hover:border-indigo-300 transition-all"
            >
              <h2 className="text-xl font-semibold text-gray-800 truncate mb-2">{story.title || "Untitled Story"}</h2>
              <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                {story.chapters && story.chapters.length > 0
                  ? story.chapters[story.chapters.length - 1].content
                  : "No chapters yet..."}
              </p>
              <div className="text-xs text-gray-400">
                Last updated: {story.updatedAt ? new Date(story.updatedAt.seconds * 1000).toLocaleString() : 'N/A'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


/**
 * Main App Component
 */
export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [selectedStory, setSelectedStory] = useState(null);
  const [selectedStoryId, setSelectedStoryId] = useState(null);
  const [isLoadingStory, setIsLoadingStory] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const userId = user?.uid;
  const isPublicView = selectedStory && !userId;

  // Check URL for a storyId to load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storyIdFromUrl = params.get('storyId');
    if (storyIdFromUrl) {
      loadStory(storyIdFromUrl);
    }
  }, [user]); // Re-check if user logs in

  const loadStory = async (storyId, storyData = null) => {
    if (storyData) {
      setSelectedStory(storyData);
      setSelectedStoryId(storyId);
      return;
    }

    setIsLoadingStory(true);
    setError('');
    
    // Determine if we should check public or private
    let storyPath;
    let storySnap;
    
    try {
      if (userId) {
        // Try loading from user's private stories first
        storyPath = getPrivateStoryDocPath(userId, storyId);
        storySnap = await getDoc(doc(db, storyPath));
      }
      
      // If not found in private (or not logged in), check public
      if (!storySnap || !storySnap.exists()) {
        storyPath = getPublicStoryDocPath(storyId);
        storySnap = await getDoc(doc(db, storyPath));
      }

      if (storySnap.exists()) {
        const data = storySnap.data();
        // Check if user is the owner, even if viewing public link
        const isOwner = data.ownerId === userId;
        setSelectedStory({ ...data, isOwner });
        setSelectedStoryId(storyId);
        
        // If it's a public story and user is NOT the owner, remove private path
        if (data.isPublic && !isOwner && !storyPath.includes('public')) {
           // This logic is tricky. Let's simplify.
           // If we load a public story, we treat it as public.
           // If we load a private story, we treat it as private.
           // The StoryView component will handle edit rights.
        }
        
      } else {
        setError("Story not found.");
        window.history.replaceState(null, '', window.location.pathname); // Clear bad URL
      }
    } catch (e) {
      console.error("Error loading story:", e);
      setError("Failed to load story.");
    } finally {
      setIsLoadingStory(false);
    }
  };

  const handleCreateStory = async () => {
    if (!userId) return;
    const newStory = {
      title: 'Untitled Story',
      chapters: [],
      characters: [],
      ownerId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isPublic: false,
    };
    
    try {
      const storiesCollectionPath = getPrivateStoriesPath(userId);
      const docRef = await addDoc(collection(db, storiesCollectionPath), newStory);
      setSelectedStory(newStory);
      setSelectedStoryId(docRef.id);
    } catch (e) {
      console.error("Error creating story:", e);
      setError("Failed to create new story.");
    }
  };

  const handleBackToList = () => {
    setSelectedStory(null);
    setSelectedStoryId(null);
    setError('');
    window.history.replaceState(null, '', window.location.pathname); // Clear storyId from URL
  };

  const handleSignOut = async () => {
    await auth.signOut();
    // This will trigger the onAuthStateChanged listener
    // which will call signInAnonymously, effectively logging
    // the user out of their persistent account and into a new anon session.
    handleBackToList(); // Go back to list view
  }

  // Loading state
  if (authLoading || isLoadingStory) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <LoadingSpinner size="h-16 w-16" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-inter">
      {/* Sidebar */}
      <aside className={`bg-gray-800 text-gray-100 w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-200 ease-in-out z-30 shadow-lg`}>
        <div className="flex items-center justify-between px-4">
          <a href="#" className="flex items-center space-x-2 text-white">
            <BookOpen size={28} className="text-indigo-400" />
            <span className="text-2xl font-bold">Story Weaver</span>
          </a>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1">
             <X size={24} />
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); handleBackToList(); setSidebarOpen(false); }}
            className="flex items-center space-x-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <BookOpen size={20} />
            <span>My Stories</span>
          </a>
          <button
            onClick={handleCreateStory}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-gray-200 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <Plus size={20} />
            <span>New Story</span>
          </button>
        </nav>
        
        <div className="absolute bottom-0 left-0 w-full p-4 border-t border-gray-700">
           {user && !user.isAnonymous && (
             <div className="flex items-center mb-2 px-2">
               <span className="text-sm text-gray-400 truncate" title={user.uid}>
                 ID: {user.uid}
               </span>
             </div>
           )}
           <button
             onClick={handleSignOut}
             className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-red-400 transition-colors"
           >
             <LogOut size={20} />
             <span>Sign Out / Reset</span>
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar for mobile */}
        <header className="md:hidden bg-white shadow-sm z-20">
          <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
             <button onClick={() => setSidebarOpen(true)}>
                <Menu size={24} className="text-gray-700" />
             </button>
             <span className="text-xl font-semibold text-gray-800">
                {selectedStoryId ? (selectedStory?.title || 'Story') : 'Story Weaver'}
             </span>
             <div className="w-6"></div> {/* Spacer */}
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 m-4">
              <p>{error}</p>
            </div>
          )}
          
          {selectedStoryId && selectedStory ? (
            <StoryView
              story={selectedStory}
              storyId={selectedStoryId}
              userId={userId}
              onBack={handleBackToList}
              isPublicView={selectedStory.isPublic && selectedStory.ownerId !== userId}
            />
          ) : (
            <StoryList
              onSelectStory={loadStory}
              onCreateStory={handleCreateStory}
              userId={userId}
            />
          )}
        </main>
      </div>
    </div>
  );
}
