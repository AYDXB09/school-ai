import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { streamChat, buildContent, extractPdfText } from './api';
import { SYSTEM_PROMPT } from './systemPrompt';
import { fetchAllCanvasData, filterCanvasHubItems, formatDueDate, isDueOverdue, normalizeCanvasItem, parseCanvasDate, selectCanvasContextItems, shouldRefreshCanvasContext } from './canvasApi';
import { MessageRenderer } from './MessageRenderer';
import CourseDashboard from './CourseDashboard';
import CourseHub from './CourseHub';
import QuizView from './QuizView';
import LuminaLogo from './LuminaLogo';

// ============================================================
// SVG ICONS
// ============================================================
const Icon = {
  menu: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  send: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  mic: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  micOff: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  chat: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  book: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  paperclip: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  clipboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  volume: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 010 7.07" /><path d="M19.07 4.93a10 10 0 010 14.14" />
    </svg>
  ),
  volumeOff: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  ),
  stop: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  ),
  question: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  layers: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  fileText: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  gear: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  voiceMode: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 8L13 11L16 12L13 13L12 16L11 13L8 12L11 11L12 8Z" fill="currentColor">
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </path>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity="0.3" />
    </svg>
  )
};

// Logo is imported from LuminaLogo.jsx

// ============================================================
// LOCAL STORAGE HELPERS
// ============================================================
function loadStorage(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function slimCanvasItemsForStorage(items) {
  if (!Array.isArray(items)) return items;

  return items.map(item => {
    if (!item || typeof item !== 'object') return item;
    return {
      ...item,
      description: typeof item.description === 'string' ? item.description.slice(0, 400) : item.description,
    };
  });
}

function slimRichTextEntriesForStorage(entries) {
  if (!Array.isArray(entries)) return entries;

  return entries.map(entry => {
    if (!entry || typeof entry !== 'object') return entry;
    return {
      ...entry,
      text: typeof entry.text === 'string' ? entry.text.slice(0, 12000) : entry.text,
      content: typeof entry.content === 'string' ? entry.content.slice(0, 12000) : entry.content,
    };
  });
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (key === 'sai-canvas-items') {
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify(slimCanvasItemsForStorage(value)));
        console.warn('[SchoolAI] Canvas cache was trimmed to fit local storage.');
        return true;
      } catch (trimError) {
        console.warn('[SchoolAI] Failed to save trimmed Canvas cache:', trimError);
      }
    }

    if (key === 'sai-transcripts' || key === 'sai-materials') {
      try {
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify(slimRichTextEntriesForStorage(value)));
        console.warn(`[SchoolAI] ${key} was trimmed to fit local storage.`);
        return true;
      } catch (trimError) {
        console.warn(`[SchoolAI] Failed to save trimmed ${key}:`, trimError);
      }
    }

    console.warn(`[SchoolAI] Failed to save ${key} to local storage:`, error);
    return false;
  }
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function formatCourseLabel(name = '') {
  return name
    .replace(/\s*\d{4}-\d{2,4}\s*/g, '')
    .replace(/\s*(SL|HL|SL\/HL)\s*/gi, '')
    .replace(/\s*IB\s*DP\s*/gi, '')
    .trim();
}

// ============================================================
// TTS / CONTENT HELPERS
// ============================================================
function stripReasoning(text) {
  if (!text) return '';

  let s = text;

  // Case 1: Complete <think>...</think> blocks
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Case 2: K2-style where opening tag is missing: "...thinking...</think>actual response"
  // If we see a closing tag but no opening tag before it, everything before it is reasoning.
  if (s.toLowerCase().includes('</think>')) {
    const parts = s.split(/<\/think>/i);
    // Take everything AFTER the last closing tag
    s = parts[parts.length - 1];
  }

  // Case 3: Still inside an unclosed <think> tag (at the very end)
  s = s.replace(/<think>[\s\S]*$/gi, '');

  // Case 4: Special case for models that start with raw reasoning and haven't hit a tag yet.
  // Note: We can't safely assume everything is thinking unless we have a clear differentiator,
  // but for models like K2-Think, if it starts with "We need to..." or similar meta-talk
  // and hasn't shown a tag yet, it's usually thinking.
  // However, the cleanest way is to ensure the model eventually outputs tags or markers.

  return s.trim();
}

const CORS_PROXY = 'https://corsproxy.io/?';
const GOOGLE_DOC_READER = 'https://r.jina.ai/';

function extractGoogleDocIds(text) {
  if (!text) return [];
  const regex = /https?:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{25,})/g;
  const matches = [...text.matchAll(regex)];
  return [...new Set(matches.map(m => m[1]))];
}

async function fetchGoogleDocText(docId) {
  try {
    const url = `${GOOGLE_DOC_READER}https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(url);
    if (!response.ok) return `[Could not fetch Google Doc ${docId}: HTTP ${response.status}]`;
    return await response.text();
  } catch (err) {
    return `[System Error loading Google Doc ${docId}: ${err.message}]`;
  }
}

function stripMarkdown(text) {
  let s = stripReasoning(text);
  return s
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*>|]\s*/gm, '')
    .replace(/\$\$[\s\S]*?\$\$/g, 'formula')
    .replace(/\$[^$]*\$/g, 'formula')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();
}

// ============================================================
// APP
// ============================================================
export default function App() {
  // Core state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chats, setChats] = useState(() => loadStorage('sai-chats', []));
  const [activeChatId, setActiveChatId] = useState(() => loadStorage('sai-active', null));
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [showCourseManager, setShowCourseManager] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  // File attachments: [{ id, name, type:'image'|'text'|'audio', base64?, mimeType?, content? }]
  const [attachments, setAttachments] = useState([]);

  // Settings
  const [apiKey, setApiKey] = useState(() => loadStorage('sai-apikey', 'IFM-WkjDZvTiR3M7dwqV'));
  const [canvasUrl, setCanvasUrl] = useState(() => loadStorage('sai-canvas-url', ''));
  const [canvasToken, setCanvasToken] = useState(() => loadStorage('sai-canvas-token', ''));

  // Canvas
  const [canvasItems, setCanvasItems] = useState(() => loadStorage('sai-canvas-items', []).map(normalizeCanvasItem));
  const [canvasLastUpdated, setCanvasLastUpdated] = useState(() => loadStorage('sai-canvas-updated', null));
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasError, setCanvasError] = useState('');
  const [canvasTab, setCanvasTab] = useState('all');       // all | assignment | announcement
  const [canvasSearch, setCanvasSearch] = useState('');
  const [canvasCourse, setCanvasCourse] = useState('all');
  const [canvasDateFrom, setCanvasDateFrom] = useState('');
  const [canvasDateTo, setCanvasDateTo] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => loadStorage('sai-websearch', false));
  const [emojisEnabled, setEmojisEnabled] = useState(() => loadStorage('sai-emojis', false));
  const [fullCanvasContext, setFullCanvasContext] = useState(() => loadStorage('sai-full-canvas', false));
  const [hiddenCourses, setHiddenCourses] = useState(() => loadStorage('sai-hidden-courses', []));

  // Course Hub state
  const [activeCourse, setActiveCourse] = useState(null);
  const [transcripts, setTranscripts] = useState(() => loadStorage('sai-transcripts', []));
  const [materials, setMaterials] = useState(() => loadStorage('sai-materials', []));
  const [topics, setTopics] = useState(() => loadStorage('sai-topics', []));
  const [topicAssessments, setTopicAssessments] = useState(() => loadStorage('sai-topic-assessments', {}));
  const [courseChats, setCourseChats] = useState(() => loadStorage('sai-course-chats', []));
  const [courseDisplayOrder, setCourseDisplayOrder] = useState(() => loadStorage('sai-course-display-order', []));
  const [homepageCourseSlots, setHomepageCourseSlots] = useState(() => loadStorage('sai-homepage-course-slots', []));
  const [visibleCourseSlots, setVisibleCourseSlots] = useState(() => loadStorage('sai-course-visible-slots', 6));
  const [selectedHomepageSlot, setSelectedHomepageSlot] = useState(null);

  // Voice Mode
  const [showVoiceMode, setShowVoiceMode] = useState(false);
  const [voiceModeText, setVoiceModeText] = useState('SPEAK TO BEGIN');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const voiceTimeoutRef = useRef(null);
  const voiceModeActiveRef = useRef(false); // ref so TTS callbacks can read current state

  // Refs
  const chatEndRef = useRef(null);
  const chatAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  // Persist
  useEffect(() => { saveStorage('sai-chats', chats); }, [chats]);
  useEffect(() => { saveStorage('sai-active', activeChatId); }, [activeChatId]);
  useEffect(() => { saveStorage('sai-apikey', apiKey); }, [apiKey]);
  useEffect(() => { saveStorage('sai-canvas-url', canvasUrl); }, [canvasUrl]);
  useEffect(() => { saveStorage('sai-canvas-token', canvasToken); }, [canvasToken]);
  useEffect(() => { saveStorage('sai-websearch', webSearchEnabled); }, [webSearchEnabled]);
  useEffect(() => { saveStorage('sai-emojis', emojisEnabled); }, [emojisEnabled]);
  useEffect(() => { saveStorage('sai-full-canvas', fullCanvasContext); }, [fullCanvasContext]);
  useEffect(() => { saveStorage('sai-canvas-items', canvasItems); }, [canvasItems]);
  useEffect(() => { saveStorage('sai-canvas-updated', canvasLastUpdated); }, [canvasLastUpdated]);
  useEffect(() => { saveStorage('sai-hidden-courses', hiddenCourses); }, [hiddenCourses]);
  useEffect(() => { saveStorage('sai-transcripts', transcripts); }, [transcripts]);
  useEffect(() => { saveStorage('sai-materials', materials); }, [materials]);
  useEffect(() => { saveStorage('sai-topics', topics); }, [topics]);
  useEffect(() => { saveStorage('sai-topic-assessments', topicAssessments); }, [topicAssessments]);
  useEffect(() => { saveStorage('sai-course-chats', courseChats); }, [courseChats]);
  useEffect(() => { saveStorage('sai-course-display-order', courseDisplayOrder); }, [courseDisplayOrder]);
  useEffect(() => { saveStorage('sai-homepage-course-slots', homepageCourseSlots); }, [homepageCourseSlots]);
  useEffect(() => { saveStorage('sai-course-visible-slots', visibleCourseSlots); }, [visibleCourseSlots]);

  // Auto-scroll
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [chats, activeChatId]);

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  // ---- CHAT MANAGEMENT ----
  function createNewChat() {
    const nc = { id: genId(), title: 'New Chat', messages: [], createdAt: Date.now() };
    setChats(p => [nc, ...p]);
    setActiveChatId(nc.id);
    setInput('');
    setShowCanvas(false);
    setShowCourseManager(false);
  }

  function deleteChat(id, e) {
    e.stopPropagation();
    setChats(p => p.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  }

  function updateMessages(chatId, updater) {
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const newMsgs = typeof updater === 'function' ? updater(c.messages) : updater;
      let title = c.title;
      if (title === 'New Chat') {
        const first = newMsgs.find(m => m.role === 'user');
        if (first) title = first.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 52) + (first.content.length > 52 ? '...' : '');
      }
      return { ...c, messages: newMsgs, title };
    }));
  }

  // ---- FILE UPLOAD ----
  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newAtts = [];
    for (const file of files) {
      const id = genId();
      if (file.type.startsWith('image/')) {
        const base64 = await fileToBase64(file);
        newAtts.push({ id, name: file.name, type: 'image', base64, mimeType: file.type });
      } else if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const text = await file.text();
        newAtts.push({ id, name: file.name, type: 'text', content: text });
      } else if (file.name.endsWith('.pdf')) {
        try {
          const text = await extractPdfText(file);
          newAtts.push({ id, name: file.name, type: 'text', content: text });
        } catch (error) {
          newAtts.push({ id, name: file.name, type: 'text', content: `[Could not read PDF ${file.name}: ${error.message}]` });
        }
      }
      else if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        // For video/audio: attempt speech recognition via browser, or just note the file
        newAtts.push({ id, name: file.name, type: 'text', content: `[${file.name} was attached. Audio/video transcription is not supported in the browser. Please paste a transcript manually in the Class Transcript panel.]` });
      } else {
        // Unknown types - try as text
        try { const text = await file.text(); newAtts.push({ id, name: file.name, type: 'text', content: text }); }
        catch { newAtts.push({ id, name: file.name, type: 'text', content: `[Could not read ${file.name}]` }); }
      }
    }
    setAttachments(prev => [...prev, ...newAtts]);
    e.target.value = '';
  }, []);

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(id) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  // ---- SEND MESSAGE ----
  async function handleSend(forcedInput) {
    const finalInput = (typeof forcedInput === 'string' ? forcedInput : input).trim();
    if ((!finalInput && attachments.length === 0) || isStreaming) return;
    if (!apiKey) { setShowSettings(true); return; }

    let canvasContextItems = canvasItems;
    const needsCanvasRefresh = fullCanvasContext
      && canvasUrl
      && canvasToken
      && shouldRefreshCanvasContext(canvasItems, canvasLastUpdated);

    if (needsCanvasRefresh) {
      const refreshedCanvasItems = await loadCanvas();
      if (Array.isArray(refreshedCanvasItems) && refreshedCanvasItems.length > 0) {
        canvasContextItems = refreshedCanvasItems;
      }
    }

    let currentChats = [...chats];
    let chatId = activeChatId;
    const isVoiceSession = voiceModeActiveRef.current;
    let currentChat = currentChats.find(c => c.id === chatId);

    // VOICE CHAT ISOLATION
    if (isVoiceSession && (!chatId || !currentChat?.isVoice)) {
      const nc = { id: genId(), title: 'Voice Session', messages: [], createdAt: Date.now(), isVoice: true };
      currentChats = [nc, ...currentChats];
      setChats(currentChats);
      setActiveChatId(nc.id);
      chatId = nc.id;
      currentChat = nc;
    } else if (!chatId) {
      const nc = { id: genId(), title: 'New Chat', messages: [], createdAt: Date.now() };
      currentChats = [nc, ...currentChats];
      setChats(currentChats);
      setActiveChatId(nc.id);
      chatId = nc.id;
      currentChat = nc;
    }

    // Get messages for the CURRENT active chat to avoid stale history
    const currentMessages = currentChat?.messages || [];

    // Capture attachments and clear state
    const currentAtts = [...attachments];
    setAttachments([]);
    setInput('');

    // Build user message content (multimodal if images attached)
    const hasImages = currentAtts.some(a => a.type === 'image');
    const userContent = hasImages
      ? buildContent(finalInput, currentAtts)
      : finalInput + currentAtts.filter(a => a.type === 'text').map(a => `\n\n[File: ${a.name}]\n${a.content}`).join('');

    const displayText = finalInput + (currentAtts.length > 0 ? `\n\n*[${currentAtts.map(a => a.name).join(', ')}]*` : '');
    const userMsg = { role: 'user', content: displayText, id: genId() };
    const apiUserMsg = { role: 'user', content: userContent, id: userMsg.id };
    const asstMsg = { role: 'assistant', content: '', id: genId() };

    updateMessages(chatId, (prev) => [...prev, userMsg, asstMsg]);
    setIsStreaming(true);

    // Google Doc Link Auto-Detection
    const docIds = extractGoogleDocIds(finalInput);
    console.log('[SchoolAI] Google Doc IDs detected:', docIds);
    if (docIds.length > 0) {
      const docs = await Promise.all(docIds.map(id => fetchGoogleDocText(id)));
      console.log('[SchoolAI] Fetched docs:', docs.map(d => d.substring(0, 100)));
      const docContext = docs.map((content, idx) => `\n\n--- FETCHED DOCUMENT CONTENT (ID: ${docIds[idx]}) ---\n${content}\n----------------------------------\n`).join('');

      const injection = `\n\n[CRITICAL CONTEXT INJECTION: The user shared one or more Google Doc links. The frontend has FETCHED the text content from these docs and displayed it above.
You MUST prioritize this fetched content to answer.
If the fetched content is empty, invalid, or looks like an error page, tell the user you couldn't access the specific doc.
DO NOT hallucinate or make up information if the doc content is not relevant to their question.]`;

      const gdocRegex = /https?:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+\S*/gi;

      if (typeof apiUserMsg.content === 'string') {
        apiUserMsg.content = apiUserMsg.content.replace(gdocRegex, '[Document Content Injected Below]') + docContext + injection;
      } else if (Array.isArray(apiUserMsg.content)) {
        for (let part of apiUserMsg.content) {
          if (part.type === 'text') {
            part.text = part.text.replace(gdocRegex, '[Document Content Injected Below]');
          }
        }
        apiUserMsg.content.push({ type: 'text', text: docContext + injection });
      }
      console.log('[SchoolAI] Final apiUserMsg.content:', typeof apiUserMsg.content === 'string' ? apiUserMsg.content.substring(0, 300) : 'multipart');
    }

    let systemContent = SYSTEM_PROMPT;
    if (transcript.trim()) systemContent += `\n\n## Class Transcript / Context Provided:\n${transcript.trim()}`;

    // Add Full Canvas Context if enabled
    if (fullCanvasContext && canvasContextItems && canvasContextItems.length > 0) {
      // Add current date to context so AI knows what "this week" means
      const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      systemContent += `\n\n[System Info: Today's date is ${todayDate}]`;
      const genericCanvasFollowUps = new Set([
        'just tell me',
        'tell me',
        'just answer',
        'answer me',
        'what are they',
        'which ones',
        'continue',
        'go on',
      ]);
      const recentUserInputs = currentMessages
        .filter(message => message.role === 'user' && typeof message.content === 'string')
        .map(message => message.content.trim())
        .filter(Boolean);
      const canvasFilterQuery = genericCanvasFollowUps.has(finalInput.toLowerCase()) && recentUserInputs.length > 0
        ? `${recentUserInputs.slice(-2).join('\n')}\n${finalInput}`
        : finalInput;

      const filteredItems = selectCanvasContextItems(canvasContextItems, canvasFilterQuery, hiddenCourses, new Date());
      console.log(`[SchoolAI] Smart Filter: Selected ${filteredItems.length} items for query: "${finalInput}"${canvasFilterQuery !== finalInput ? ' (using recent chat context)' : ''}`);
      console.log(`[SchoolAI] Total canvasContextItems before filter: ${canvasContextItems.length}`);
      filteredItems.forEach(item => {
        console.log(`[SchoolAI]   -> "${item.name}" | course: ${item.course_name} | date: ${item.date} | type: ${item.type} | score: ${item.score}`);
      });

      if (filteredItems.length > 0) {
        const descriptionLimit = filteredItems.length <= 3 ? 1200 : 400;
        const canvasSummary = filteredItems
          .map(item => {
            const desc = item.description || 'No description';
            const shortDesc = desc.length > descriptionLimit ? desc.substring(0, descriptionLimit) + '...' : desc;
            const dueDate = parseCanvasDate(item.date);
            const dueLabel = dueDate ? dueDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No Date';
            return `[${item.type}] ${item.name} (${item.course_name || 'General'}) - Due: ${dueLabel}\nDescription: ${shortDesc}`;
          })
          .join('\n\n');

        systemContent += `\n\n## YOUR COMPLETE CANVAS LMS CONTEXT:\nThe student has enabled full Canvas integration. Use this data to answer questions about assignments, tests, and materials.
CRITICAL: Assignment descriptions are provided below. Refer to them for specific wording and requirements.
- If the user asks about a specific assignment, prioritize the best matching Canvas item below and use its description as the assignment instructions/context.
Data follows:\n${canvasSummary}`;
      } else {
        systemContent += `\n\n## YOUR COMPLETE CANVAS LMS CONTEXT:\nThe student has fully connected their Canvas account, but **there are NO assignments matching their query for the current timeframe** (e.g., nothing due this week or no upcoming assignments). If they ask for assignments, kindly inform them that their Canvas account is synced, but they have no current/upcoming assignments that match right now based on the current date (${todayDate}). You DO have access to their Canvas, it's just empty for this specific request.`;
      }
    }

    // Add strict style instructions
    if (webSearchEnabled) systemContent += `\n\n[Web Search is enabled. If knowledge may be outdated, note it and advise the student to verify online.]`;

    if (emojisEnabled) {
      systemContent += `\n\n[STYLE RULE: You MAY use emojis in your responses to be engaging.]`;
    } else {
      systemContent += `\n\n[STYLE RULE: STRICTLY FORBIDDEN: NEVER use emojis in any part of your response. Use professional formatting instead.]`;
    }

    systemContent += `\n\n[STYLE RULE: STRICTLY FORBIDDEN: NEVER use em dashes (—). Use a comma or colon instead.]`;

    const apiMessages = [
      { role: 'system', content: systemContent },
      ...currentMessages.map(m => ({ role: m.role, content: m.content })),
      apiUserMsg
    ];

    let accumulated = '';
    try {
      await streamChat(
        apiMessages,
        apiKey,
        (chunk) => {
          accumulated += chunk;
          const cur = accumulated;
          updateMessages(chatId, (prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: cur };
            return updated;
          });
          if (voiceModeActiveRef.current) {
            const stripped = stripReasoning(cur);
            // If the ONLY thing we have is reasoning, keep showing "Thinking..."
            setVoiceModeText(stripped || 'Thinking...');
          }
        },
        () => {
          setIsStreaming(false);
          const finalTotal = accumulated;
          if (voiceModeActiveRef.current && !voiceMuted) {
            speakMessage({ id: asstMsg.id, content: finalTotal }, true);
          } else if (voiceModeActiveRef.current && voiceMuted) {
            startVoiceModeSTT();
          }
        },
        (err) => {
          updateMessages(chatId, (prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: `**Error:** ${err}` };
            return updated;
          });
          setIsStreaming(false);
          if (voiceModeActiveRef.current) setVoiceModeText('Error. Tap circle to retry.');
        },
        { canvasUrl, canvasToken }
      );
    } catch (e) {
      setIsStreaming(false);
      if (voiceModeActiveRef.current) setVoiceModeText('Error. Check your API key.');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleInputChange(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }

  // ---- VOICE INPUT ----
  function toggleRecording() {
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition requires Chrome.'); return; }
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    let finalText = '';
    r.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript + ' ';
        else interim += ev.results[i][0].transcript;
      }
      setInput(finalText + interim);
    };
    r.onerror = () => setIsRecording(false);
    r.onend = () => { setIsRecording(false); setInput(p => p.trim()); };
    recognitionRef.current = r;
    r.start();
    setIsRecording(true);
  }

  // ---- TTS ----
  function speakMessage(msg, isVoiceModeFlow = false) {
    if (isSpeaking && speakingMsgId === msg.id && !isVoiceModeFlow) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const fullText = stripMarkdown(msg.content);
    if (!fullText) {
      if (isVoiceModeFlow) startVoiceModeSTT();
      return;
    }

    // Split into sentences for one-at-a-time display
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
    let sentenceIndex = 0;

    // Prefer higher quality voices
    const getVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      let v = voices.find(v => v.name.includes('Online (Natural)') && v.lang.startsWith('en'));
      if (!v) v = voices.find(v => (v.name.includes('Google') || v.name.includes('Premium')) && v.lang.startsWith('en'));
      if (!v) v = voices.find(v => v.lang.startsWith('en') && v.localService);
      if (!v) v = voices.find(v => v.lang.startsWith('en'));
      return v;
    };

    const speakNext = () => {
      if (sentenceIndex >= sentences.length) {
        setIsSpeaking(false);
        setSpeakingMsgId(null);
        setVoiceModeText('');
        if (voiceModeActiveRef.current && !voiceMuted) startVoiceModeSTT();
        return;
      }
      const sentence = sentences[sentenceIndex++].trim();
      if (!sentence) { speakNext(); return; }

      setVoiceModeText(sentence);
      const utt = new SpeechSynthesisUtterance(sentence);
      utt.rate = 1.05;
      utt.pitch = 1.0;
      const voice = getVoice();
      if (voice) utt.voice = voice;
      utt.onend = () => speakNext();
      utt.onerror = () => {
        setIsSpeaking(false);
        setSpeakingMsgId(null);
        if (voiceModeActiveRef.current && !voiceMuted) startVoiceModeSTT();
      };
      window.speechSynthesis.speak(utt);
    };

    setIsSpeaking(true);
    setSpeakingMsgId(msg.id);
    // voices may not be ready yet
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; speakNext(); };
    } else {
      speakNext();
    }
  }

  function handleCircleClick() {
    if (isSpeaking) {
      // Interrupt TTS and start listening
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setSpeakingMsgId(null);
      setVoiceModeText('');
      startVoiceModeSTT();
    } else if (!isRecording) {
      // Start listening
      startVoiceModeSTT();
    }
  }

  // ---- VOICE MODE SPECIFIC STT ----
  function startVoiceModeSTT() {
    if (recognitionRef.current) recognitionRef.current.stop();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    setVoiceModeText('Listening...');
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';

    let finalText = '';

    r.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript + ' ';
        else interim += ev.results[i][0].transcript;
      }

      const currentInput = finalText + interim;
      setInput(currentInput);
      setVoiceModeText(currentInput || 'Listening...');

      // Auto-submit logic: clear existing timeout
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);

      // If we have text, set a timer to auto-send after user stops talking for 2s
      if (currentInput.trim()) {
        voiceTimeoutRef.current = setTimeout(() => {
          r.stop();
          setVoiceModeText('Thinking...');
          handleSend(currentInput.trim());
        }, 2000);
      }
    };

    r.onerror = () => setVoiceModeText('SPEAK TO BEGIN');
    r.onend = () => setIsRecording(false);

    recognitionRef.current = r;
    r.start();
    setIsRecording(true);
  }

  function toggleVoiceMode() {
    if (showVoiceMode) {
      // Turn off
      voiceModeActiveRef.current = false;
      if (recognitionRef.current) recognitionRef.current.stop();
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
      window.speechSynthesis.cancel();
      setShowVoiceMode(false);
      setIsRecording(false);
      setIsSpeaking(false);
    } else {
      // Turn on
      voiceModeActiveRef.current = true;
      setShowVoiceMode(true);
      setVoiceModeText('SPEAK TO BEGIN');

      // Ensure we are in a voice chat
      const activeChat = chats.find(c => c.id === activeChatId);
      if (!activeChat || !activeChat.isVoice) {
        const recentVoice = chats.find(c => c.isVoice);
        if (recentVoice) {
          setActiveChatId(recentVoice.id);
        } else {
          const nc = { id: genId(), title: 'Voice Session', messages: [], createdAt: Date.now(), isVoice: true };
          setChats(p => [nc, ...p]);
          setActiveChatId(nc.id);
        }
      }

      startVoiceModeSTT();
    }
  }

  // ---- CANVAS ----
  async function loadCanvas() {
    if (!canvasUrl || !canvasToken) return null;
    setCanvasLoading(true); setCanvasError('');
    try {
      const data = await fetchAllCanvasData(canvasUrl, canvasToken);
      const normalizedItems = data.map(normalizeCanvasItem);
      // Debug: log what Canvas returned
      console.log(`[SchoolAI Canvas] Fetched ${normalizedItems.length} total items from Canvas`);
      const withDates = normalizedItems.filter(i => i.date);
      const assignments = normalizedItems.filter(i => i.type === 'assignment');
      console.log(`[SchoolAI Canvas] ${assignments.length} assignments, ${withDates.length} items with dates`);
      // Group by course
      const byCourse = {};
      assignments.forEach(a => {
        const c = a.course_name || 'Unknown';
        if (!byCourse[c]) byCourse[c] = [];
        byCourse[c].push(a);
      });
      Object.entries(byCourse).forEach(([course, items]) => {
        const withDate = items.filter(i => i.date).length;
        console.log(`[SchoolAI Canvas]   Course: "${course}" -> ${items.length} assignments (${withDate} with dates)`);
        // If economics, log ALL items
        if (course.toLowerCase().includes('econ')) {
          items.forEach(a => {
            console.log(`[SchoolAI Canvas]     ECON: "${a.name}" | date: ${a.date} | source: ${a.source}`);
          });
        }
      });
      setCanvasItems(normalizedItems);
      setCanvasLastUpdated(Date.now());
      return normalizedItems;
    }
    catch (e) {
      setCanvasError(e.message);
      return null;
    }
    finally { setCanvasLoading(false); }
  }

  // Derived list based on active filters
  const canvasCourses = [...new Set(canvasItems.map(i => i.course_name).filter(Boolean))].sort();
  const visibleCanvasCourses = canvasCourses.filter(course => !hiddenCourses.includes(course));
  const hasActiveCanvasFilters = canvasTab !== 'all'
    || canvasCourse !== 'all'
    || canvasSearch.trim().length > 0
    || Boolean(canvasDateFrom || canvasDateTo);
  const filteredCanvasItems = filterCanvasHubItems(canvasItems, {
    hiddenCourses,
    tab: canvasTab,
    course: canvasCourse,
    search: canvasSearch,
    dateFrom: canvasDateFrom,
    dateTo: canvasDateTo,
  });

  function toggleCourseHidden(courseName) {
    setHiddenCourses(prev =>
      prev.includes(courseName)
        ? prev.filter(c => c !== courseName)
        : [...prev, courseName]
    );
  }

  // Derive unique course objects for the dashboard
  const derivedCourses = useMemo(() => {
    const courseMap = new Map();
    canvasItems.forEach(item => {
      if (item.course_name && item.course_id && !courseMap.has(item.course_id)) {
        courseMap.set(item.course_id, { id: item.course_id, name: item.course_name });
      }
    });

    // Determine current academic year automatically
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    // If it's before July, we are in the later half of the academic year starting last year
    const startYear = currentMonth < 6 ? currentYear - 1 : currentYear;
    const endYear = startYear + 1;
    const shortStart = startYear.toString().slice(-2);
    const shortEnd = endYear.toString().slice(-2);

    // E.g., for March 2026, startYear=2025, endYear=2026. 
    // Look for phrases like "2025-26", "25-26", "25/26", or just "2025" in names
    const yearRegex = new RegExp(`(${startYear}-?${shortEnd}|${shortStart}-?${shortEnd}|${startYear}\\/${shortEnd}|${startYear}|${startYear}-${endYear})`, 'i');

    return [...courseMap.values()]
      .filter(c => !hiddenCourses.includes(c.name))
      // Filter for current academic year OR courses that don't specify a year at all (to be safe)
      .filter(c => {
        const hasAnyYear = /\b20\d{2}\b|\b\d{2}-\d{2}\b/.test(c.name);
        return !hasAnyYear || yearRegex.test(c.name);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [canvasItems, hiddenCourses]);

  useEffect(() => {
    const validIds = derivedCourses.map(course => String(course.id));

    setCourseDisplayOrder(prev => {
      const normalizedPrev = (prev || []).map(id => String(id));
      const retained = normalizedPrev.filter(id => validIds.includes(id));
      const missing = validIds.filter(id => !retained.includes(id));
      const next = [...retained, ...missing];
      return next.length === normalizedPrev.length && next.every((id, idx) => id === normalizedPrev[idx]) ? prev : next;
    });

    setVisibleCourseSlots(prev => {
      const maxSlots = Math.max(6, validIds.length + 3);
      const normalized = Number.isFinite(prev) ? prev : 6;
      return Math.min(Math.max(normalized, 6), maxSlots);
    });
  }, [derivedCourses]);

  const orderedCourses = useMemo(() => {
    const courseMap = new Map(derivedCourses.map(course => [String(course.id), course]));
    const ordered = [];

    courseDisplayOrder.forEach(id => {
      const course = courseMap.get(String(id));
      if (course) {
        ordered.push(course);
        courseMap.delete(String(id));
      }
    });

    return [...ordered, ...courseMap.values()];
  }, [derivedCourses, courseDisplayOrder]);

  const orderedCourseIds = useMemo(() => orderedCourses.map(course => String(course.id)), [orderedCourses]);
  const maxVisibleCourseSlots = Math.max(6, orderedCourses.length + 3);
  const clampedVisibleCourseSlots = Math.min(Math.max(visibleCourseSlots, 6), maxVisibleCourseSlots);

  useEffect(() => {
    setHomepageCourseSlots(prev => {
      const normalizedPrev = Array.isArray(prev)
        ? prev.map(id => (id == null ? null : String(id)))
        : [];
      const seen = new Set();
      const cleaned = normalizedPrev.map(id => {
        if (id == null || !orderedCourseIds.includes(id) || seen.has(id)) return null;
        seen.add(id);
        return id;
      });

      let next = cleaned.slice(0, clampedVisibleCourseSlots);

      if (normalizedPrev.length === 0) {
        next = orderedCourseIds.slice(0, clampedVisibleCourseSlots);
      }

      while (next.length < clampedVisibleCourseSlots) next.push(null);

      const unchanged = next.length === normalizedPrev.length
        && next.every((id, idx) => id === normalizedPrev[idx]);

      return unchanged ? prev : next;
    });

    setSelectedHomepageSlot(prev => (prev != null && prev >= clampedVisibleCourseSlots ? null : prev));
  }, [orderedCourseIds, clampedVisibleCourseSlots]);

  const featuredSlotIds = useMemo(
    () => Array.from({ length: clampedVisibleCourseSlots }, (_, index) => homepageCourseSlots[index] ?? null),
    [homepageCourseSlots, clampedVisibleCourseSlots]
  );

  const featuredCourseIdSet = useMemo(
    () => new Set(featuredSlotIds.filter(Boolean)),
    [featuredSlotIds]
  );

  const featuredCourses = useMemo(() => {
    const courseMap = new Map(orderedCourses.map(course => [String(course.id), course]));
    return featuredSlotIds.map(id => (id ? courseMap.get(id) || null : null));
  }, [orderedCourses, featuredSlotIds]);

  const homepageCourses = useMemo(
    () => featuredCourses.filter(Boolean),
    [featuredCourses]
  );

  const availableCourses = useMemo(
    () => orderedCourses.filter(course => !featuredCourseIdSet.has(String(course.id))),
    [orderedCourses, featuredCourseIdSet]
  );

  const featuredCourseCount = homepageCourses.length;

  // Filter course chats for the active course
  const activeCourseChats = useMemo(() => {
    if (!activeCourse) return [];
    return courseChats.filter(c => c.courseId === activeCourse.id);
  }, [courseChats, activeCourse]);

  function handleSelectCourse(course) {
    setActiveCourse(course);
    setShowCourseManager(false);
    if (canvasUrl && canvasToken && shouldRefreshCanvasContext(canvasItems, canvasLastUpdated)) {
      loadCanvas();
    }
  }

  function toggleCourseManager() {
    if (!showCourseManager && canvasUrl && canvasToken && derivedCourses.length === 0) {
      loadCanvas();
    }
    setShowCourseManager(prev => !prev);
  }

  function changeVisibleCourseSlots(delta) {
    setVisibleCourseSlots(prev => {
      const next = prev + delta;
      return Math.min(Math.max(next, 6), maxVisibleCourseSlots);
    });
  }

  function toggleHomepageSlotSelection(slotIndex) {
    setSelectedHomepageSlot(prev => (prev === slotIndex ? null : slotIndex));
  }

  function clearHomepageSlot(slotIndex) {
    setHomepageCourseSlots(prev => prev.map((id, index) => (index === slotIndex ? null : id)));
    setSelectedHomepageSlot(prev => (prev === slotIndex ? null : prev));
  }

  function assignCourseToHomepageSlot(courseId) {
    if (selectedHomepageSlot == null) return;

    const nextCourseId = String(courseId);
    setHomepageCourseSlots(prev => {
      const next = Array.from({ length: clampedVisibleCourseSlots }, (_, index) => prev[index] ?? null);
      const previousSlotValue = next[selectedHomepageSlot] ?? null;
      const existingIndex = next.findIndex((id, index) => index !== selectedHomepageSlot && id === nextCourseId);

      if (existingIndex !== -1) {
        next[existingIndex] = previousSlotValue;
      }

      next[selectedHomepageSlot] = nextCourseId;
      return next;
    });
    setSelectedHomepageSlot(null);
  }

  function useCanvasItem(item) {
    const dateLabel = item.date ? formatDueDate(item.date) : 'No date';
    const pts = item.points_possible ? ` · ${item.points_possible} pts` : '';
    setInput(`I need help with this ${item.type}:\n\n**${item.name}**\nCourse: ${item.course_name}\n${dateLabel}${pts}\n\n${item.description || ''}`);
    setShowCanvas(false);
    textareaRef.current?.focus();
  }

  function addCanvasToContext(item) {
    const dateLabel = item.date ? formatDueDate(item.date) : 'No date';
    const pts = item.points_possible ? ` · ${item.points_possible} pts` : '';
    const contextText = `\n\n---\n[Canvas ${item.type}] **${item.name}** — ${item.course_name} — ${dateLabel}${pts}\n${item.description || ''}`;
    setTranscript(prev => prev + contextText);
  }

  function handleSaveSettings(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setApiKey(fd.get('apiKey'));
    setCanvasUrl(fd.get('canvasUrl'));
    setCanvasToken(fd.get('canvasToken'));
    setEmojisEnabled(fd.get('emojisEnabled') === 'on');
    setFullCanvasContext(fd.get('fullCanvasContext') === 'on');
    setShowSettings(false);
  }

  // ---- WELCOME CARDS ----
  function welcomeAction(type) {
    if (type === 'ask') { createNewChat(); setTimeout(() => textareaRef.current?.focus(), 100); }
    if (type === 'canvas') { setShowCanvas(true); if (canvasUrl && canvasToken) loadCanvas(); }
    if (type === 'settings') setShowSettings(true);
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="app-layout">

      {/* ---- SIDEBAR ---- */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <LuminaLogo size={28} />
          </div>
        </div>

        <div className="sidebar-nav">
          <button className="nav-item active-pill" onClick={createNewChat}>
            {Icon.chat} AI Chat Assistant
          </button>

          <div className="nav-section">
            <button className="nav-item" onClick={() => { setShowCanvas(!showCanvas); if (!showCanvas && canvasUrl && canvasToken) loadCanvas(); }}>
              {Icon.book} Canvas Assignments
            </button>
          </div>

          <div className="nav-section spacer"></div>

          <div className="nav-section chat-history-section">
            <button className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>
            <div className="chat-history-list">
              {chats.map(chat => (
                <div key={chat.id} className={`chat-history-item ${chat.id === activeChatId ? 'active' : ''}`} onClick={() => setActiveChatId(chat.id)}>
                  <span className="chat-title">{chat.title}</span>
                  <button className="delete-btn" onClick={e => deleteChat(chat.id, e)}>{Icon.trash}</button>
                </div>
              ))}
            </div>
          </div>

          <div className="nav-section">
            <button className="nav-item" onClick={() => setShowSettings(true)}>
              {Icon.settings} Settings
            </button>
            <button className="nav-item" onClick={() => setShowHelp(true)}>
              {Icon.question} Help
            </button>
          </div>
        </div>
      </aside>

      {/* ---- MAIN AREA ---- */}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="toggle-sidebar-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>{Icon.menu}</button>
            <span className="model-pill">K2-Think-v2</span>
            <span className={`status-badge ${apiKey ? 'connected' : 'disconnected'}`}>
              <span className="status-dot" />
              {apiKey ? 'Connected' : 'No API Key'}
            </span>
          </div>
          <div className="topbar-right">
            <button className="toggle-sidebar-btn" onClick={() => { setShowCanvas(!showCanvas); if (!showCanvas && canvasUrl && canvasToken) loadCanvas(); }} title="Canvas Hub">{Icon.book}</button>
          </div>
        </header>

        {/* MAIN CONTENT: CourseHub, CourseDashboard, or Chat */}
        {activeCourse ? (
          <CourseHub
            course={activeCourse}
            canvasItems={canvasItems}
            allTranscripts={transcripts}
            allMaterials={materials}
            allTopics={topics}
            topicAssessments={topicAssessments}
            apiKey={apiKey}
            onBack={() => setActiveCourse(null)}
            onUpdateTranscripts={setTranscripts}
            onUpdateMaterials={setMaterials}
            onUpdateTopics={setTopics}
            onUpdateTopicAssessments={setTopicAssessments}
            onUpdateChats={setCourseChats}
            courseChats={activeCourseChats}
            SchoolAILogo={LuminaLogo}
            hiddenCourses={hiddenCourses}
          />
        ) : (
          <div className="chat-area" ref={chatAreaRef}>
            {!activeChatId || messages.length === 0 ? (
              <div className="welcome-screen">
                <LuminaLogo size={64} />
                <h1 className="welcome-title">Lumina</h1>
                <p className="welcome-subtitle">
                  Your intelligent study companion. Ask a question, load your assignments, or share your class notes to get started.
                </p>
                <div className="welcome-cards">
                  {[
                    { key: 'ask', icon: Icon.question, title: 'Ask a Question', desc: 'Get guided through any subject with targeted hints' },
                    { key: 'canvas', icon: Icon.book, title: 'Canvas Assignments', desc: 'Pull your assignments from Canvas LMS and get help' },
                    { key: 'courses', icon: Icon.layers, title: 'Your Courses', desc: 'Open a course workspace with lecture content, topics, and assignment help' },
                    { key: 'settings', icon: Icon.gear, title: 'Configure', desc: 'Set up your API keys and Canvas integration' },
                  ].map(card => (
                    <div key={card.key} className="welcome-card" onClick={() => {
                      if (card.key === 'courses') {
                        if (canvasUrl && canvasToken && derivedCourses.length === 0) loadCanvas();
                        setShowCourseManager(true);
                        // Scroll to inline course section
                        document.querySelector('.inline-course-dashboard')?.scrollIntoView({ behavior: 'smooth' });
                      } else {
                        welcomeAction(card.key);
                      }
                    }}>
                      <div className="card-icon">{card.icon}</div>
                      <div className="card-title">{card.title}</div>
                      <div className="card-desc">{card.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Course Dashboard inline when courses are available */}
                {derivedCourses.length > 0 && (
                  <div className="inline-course-dashboard">
                    <h2>Your Courses</h2>
                    <p className="inline-course-summary">
                      Open a course workspace for chat, assignments, mind maps, and lecture content.
                    </p>
                    <div className="inline-course-grid">
                      {homepageCourses.map(course => (
                        <div key={course.id} className="inline-course-card" onClick={() => handleSelectCourse(course)}>
                          <div className="inline-course-name">{formatCourseLabel(course.name)}</div>
                          <span className="inline-course-arrow">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                            </svg>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="inline-course-actions">
                      <button className={`inline-course-manager-btn ${showCourseManager ? 'active' : ''}`} onClick={toggleCourseManager}>
                        {showCourseManager ? 'Hide Course Manager' : 'View All Courses'}
                      </button>
                    </div>

                    {showCourseManager && (
                      <div className="inline-course-manager-panel">
                        <div className="inline-course-manager-top">
                          <div>
                            <h3>Choose what shows in Your Courses</h3>
                            <p>
                              Click a homepage slot to select it, then click a course below to swap it in. You can also clear a slot to leave an empty box.
                            </p>
                          </div>

                          <div className="course-slot-stepper">
                            <span className="course-slot-label">Visible slots</span>
                            <div className="course-slot-controls">
                              <button
                                type="button"
                                className="course-slot-btn"
                                onClick={() => changeVisibleCourseSlots(-1)}
                                disabled={clampedVisibleCourseSlots <= 6}
                              >
                                −
                              </button>
                              <span className="course-slot-value">{clampedVisibleCourseSlots}</span>
                              <button
                                type="button"
                                className="course-slot-btn"
                                onClick={() => changeVisibleCourseSlots(1)}
                                disabled={clampedVisibleCourseSlots >= maxVisibleCourseSlots}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="course-manager-section-title">
                          <h4>Homepage slots</h4>
                          <p>
                            {selectedHomepageSlot == null
                              ? 'Choose a slot above, then pick a course below.'
                              : `Slot ${selectedHomepageSlot + 1} is selected. Pick a course below to swap it in.`}
                          </p>
                        </div>

                        <div className="course-manager-grid homepage-slots-grid">
                          {featuredCourses.map((course, index) => {
                            const isSelected = selectedHomepageSlot === index;
                            return (
                              <div
                                key={`homepage-slot-${index}`}
                                className={`course-manager-card featured selectable ${isSelected ? 'selected' : ''} ${course ? '' : 'empty-slot'}`}
                                onClick={() => toggleHomepageSlotSelection(index)}
                              >
                                <div className="course-manager-card-top">
                                  <span className="course-manager-rank">Slot {index + 1}</span>
                                  <span className={`course-manager-chip featured ${course ? '' : 'empty'}`}>
                                    {course ? 'Homepage' : 'Empty'}
                                  </span>
                                </div>
                                <div className="course-manager-card-name">
                                  {course ? formatCourseLabel(course.name) : 'Empty homepage slot'}
                                </div>
                                <div className="course-manager-card-hint">
                                  {isSelected
                                    ? 'Now click a course below to swap it into this slot.'
                                    : course
                                      ? 'Click to choose this slot, or clear it to leave an empty box.'
                                      : 'Click to choose this empty slot for a new course.'}
                                </div>
                                {course && (
                                  <button
                                    type="button"
                                    className="course-manager-card-action"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      clearHomepageSlot(index);
                                    }}
                                  >
                                    Clear slot
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="course-manager-section-title pool-title">
                          <h4>Other courses</h4>
                          <p>
                            Click one of these after selecting a homepage slot and it will swap into that slot.
                          </p>
                        </div>

                        <div className="course-manager-grid pool-grid">
                          {availableCourses.map(course => (
                            <button
                              key={course.id}
                              type="button"
                              className={`course-manager-card course-manager-pool-card ${selectedHomepageSlot == null ? 'disabled' : 'pickable'}`}
                              onClick={() => assignCourseToHomepageSlot(course.id)}
                              disabled={selectedHomepageSlot == null}
                            >
                              <div className="course-manager-card-top">
                                <span className="course-manager-rank">Available</span>
                                <span className="course-manager-chip">More courses</span>
                              </div>
                              <div className="course-manager-card-name">{formatCourseLabel(course.name)}</div>
                              <div className="course-manager-card-hint">
                                {selectedHomepageSlot == null
                                  ? 'Select a homepage slot first.'
                                  : `Swap into slot ${selectedHomepageSlot + 1}.`}
                              </div>
                            </button>
                          ))}
                        </div>

                        <p className="inline-course-manager-footnote">
                          Showing {featuredCourseCount} of {orderedCourses.length} courses on the homepage, with {clampedVisibleCourseSlots - featuredCourseCount} empty slot{clampedVisibleCourseSlots - featuredCourseCount === 1 ? '' : 's'} available.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="chat-messages">
                {messages.map((msg, i) => (
                  <div key={msg.id || i} className={`message message-${msg.role}`}>
                    <div className={`message-avatar ${msg.role}`}>
                      {msg.role === 'user' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      ) : (
                        <LuminaLogo size={22} />
                      )}
                    </div>
                    <div className="message-content">
                      <div className="message-role-row">
                        <span className="message-role">{msg.role === 'user' ? 'You' : 'Lumina'}</span>
                        {msg.role === 'assistant' && msg.content && !isStreaming && (
                          <button
                            className={`tts-btn ${speakingMsgId === msg.id ? 'speaking' : ''}`}
                            onClick={() => speakMessage(msg)}
                            title={speakingMsgId === msg.id ? 'Stop speaking' : 'Read aloud'}
                          >
                            {speakingMsgId === msg.id ? Icon.volumeOff : Icon.volume}
                          </button>
                        )}
                      </div>
                      <MessageRenderer
                        content={msg.content}
                        isStreaming={isStreaming && i === messages.length - 1}
                        onStartQuiz={(quizParams) => setActiveQuiz(quizParams)}
                      />
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        )}

        {/* INPUT AREA — only show when NOT in CourseHub */}
        {!activeCourse && (
          <div className="input-area">
            {transcript.trim() && (
              <div className="transcript-pill">
                <span>{Icon.clipboard}</span>
                <span>Extra study context active</span>
                <button onClick={() => setTranscript('')}>{Icon.close}</button>
              </div>
            )}
            {/* File attachment preview */}
            {attachments.length > 0 && (
              <div className="attachment-strip">
                {attachments.map(att => (
                  <div key={att.id} className="attachment-chip">
                    {att.type === 'image' ? (
                      <img src={`data:${att.mimeType};base64,${att.base64}`} alt={att.name} className="attachment-thumb" />
                    ) : (
                      <span className="attachment-icon">{Icon.paperclip}</span>
                    )}
                    <span className="attachment-name">{att.name}</span>
                    <button className="attachment-remove" onClick={() => removeAttachment(att.id)}>{Icon.close}</button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              multiple
              accept="image/*,text/*,.pdf,.md,.txt,audio/*,video/*"
            />
            <div className="input-wrapper">
              <div className="input-row">
                <div className="input-actions-left">
                  <button
                    className="input-action-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    disabled={isStreaming}
                  >
                    {Icon.paperclip}
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything... I will guide you to the answer"
                  rows={1}
                  disabled={isStreaming}
                />
                <div className="input-actions">
                  <button className={`input-action-btn ${showVoiceMode ? 'recording' : ''}`} onClick={toggleVoiceMode} title="Voice Mode">
                    {Icon.voiceMode}
                  </button>
                  <button className={`input-action-btn ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} title={isRecording ? 'Stop recording' : 'Dictate text'}>
                    {isRecording ? Icon.micOff : Icon.mic}
                  </button>
                  {isStreaming ? (
                    <button className="send-btn stop" onClick={() => setIsStreaming(false)} title="Stop">{Icon.stop}</button>
                  ) : (
                    <button className="send-btn" onClick={() => handleSend()} disabled={!input.trim() && attachments.length === 0} title="Send">{Icon.send}</button>
                  )}
                </div>
              </div>
            </div>
            <div className="input-footer">
              <span>Powered by K2-Think-v2</span>
            </div>
          </div>
        )}
      </main>

      {/* ---- VOICE MODE OVERLAY ---- */}
      {showVoiceMode && (
        <div className="voice-mode-overlay">
          <button className="voice-close-btn" onClick={toggleVoiceMode} title="Close Voice Mode">
            {Icon.close}
          </button>

          <div className="voice-center-container">
            <div
              className={`voice-circle-animation ${isSpeaking ? 'speaking' : isRecording ? 'listening' : isStreaming ? 'thinking' : 'idle'}`}
              onClick={handleCircleClick}
              style={{ cursor: 'pointer' }}
              title={isSpeaking ? 'Tap to interrupt' : isRecording ? 'Listening...' : 'Tap to speak'}
            ></div>
            <div className="voice-text-display">
              {isStreaming && !isSpeaking && (
                <p className="voice-sentence thinking">{voiceModeText}</p>
              )}
              {isSpeaking && voiceModeText && (
                <p className="voice-sentence speaking">{voiceModeText}</p>
              )}
              {isRecording && !isSpeaking && !isStreaming && voiceModeText && (
                <p className="voice-sentence listening">{voiceModeText}</p>
              )}
              {!isSpeaking && !isRecording && !isStreaming && (
                <p className="voice-sentence idle">Tap the circle to speak</p>
              )}
              {isSpeaking && (
                <p className="voice-interrupt-hint">Tap circle to interrupt</p>
              )}
            </div>
          </div>

          <button className={`voice-mute-btn ${voiceMuted ? 'muted' : ''}`} onClick={() => setVoiceMuted(!voiceMuted)} title={voiceMuted ? 'Unmute AI' : 'Mute AI'}>
            {voiceMuted ? Icon.micOff : Icon.mic}
          </button>
        </div>
      )
      }

      {/* ---- CANVAS HUB PANEL ---- */}
      {
        showCanvas && (
          <div className="side-panel canvas-hub">
            <div className="panel-header">
              <div>
                <h3>Canvas Hub</h3>
                {canvasLastUpdated && (
                  <div className="canvas-last-updated">
                    Last updated: {new Date(canvasLastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={loadCanvas}>Refresh</button>
                <button className="modal-close" onClick={() => setShowCanvas(false)}>{Icon.close}</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="canvas-tabs">
              {['all', 'assignment', 'announcement'].map(tab => (
                <button key={tab} className={`canvas-tab ${canvasTab === tab ? 'active' : ''}`} onClick={() => setCanvasTab(tab)}>
                  {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1) + 's'}
                </button>
              ))}
            </div>

            {/* Filters */}
            {canvasItems.length > 0 && (
              <div className="canvas-filters">
                <input
                  className="canvas-search"
                  placeholder="Search..."
                  value={canvasSearch}
                  onChange={e => setCanvasSearch(e.target.value)}
                />
                <select className="canvas-select" value={canvasCourse} onChange={e => setCanvasCourse(e.target.value)}>
                  <option value="all">All Courses</option>
                  {visibleCanvasCourses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="canvas-date-row">
                  <input type="date" className="canvas-date" value={canvasDateFrom} onChange={e => setCanvasDateFrom(e.target.value)} title="From date" />
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>to</span>
                  <input type="date" className="canvas-date" value={canvasDateTo} onChange={e => setCanvasDateTo(e.target.value)} title="To date" />
                  {(canvasDateFrom || canvasDateTo) && (
                    <button className="canvas-clear-date" onClick={() => { setCanvasDateFrom(''); setCanvasDateTo(''); }} title="Clear dates">{Icon.close}</button>
                  )}
                </div>
              </div>
            )}

            {canvasItems.length > 0 && (
              <div className="course-management">
                <div className="course-mgmt-header">Manage Courses</div>
                <div className="course-mgmt-list">
                  {canvasCourses.map(course => (
                    <div key={course} className={`course-mgmt-item ${hiddenCourses.includes(course) ? 'hidden' : ''}`}>
                      <span className="course-mgmt-name">{course}</span>
                      <button
                        className="course-mgmt-toggle"
                        onClick={() => toggleCourseHidden(course)}
                        title={hiddenCourses.includes(course) ? 'Show course' : 'Hide course'}
                      >
                        {hiddenCourses.includes(course) ? Icon.plus : Icon.trash}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="panel-body">
              {!canvasUrl || !canvasToken ? (
                <div className="panel-empty">
                  <div className="panel-empty-icon">{Icon.layers}</div>
                  <p>Connect your Canvas LMS account in Settings to load your assignments.</p>
                  <button className="btn-primary" onClick={() => { setShowCanvas(false); setShowSettings(true); }}>Open Settings</button>
                </div>
              ) : canvasLoading ? (
                <div className="panel-empty">
                  <div className="typing-indicator" style={{ justifyContent: 'center', marginBottom: 12 }}><span /><span /><span /></div>
                  <p>Loading Canvas data...</p>
                </div>
              ) : canvasError ? (
                <div className="panel-empty">
                  <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{canvasError}</p>
                  <button className="btn-primary" onClick={loadCanvas}>Retry</button>
                </div>
              ) : filteredCanvasItems.length === 0 ? (
                <div className="panel-empty"><p>{canvasItems.length === 0 ? 'No data found. Click Refresh.' : hasActiveCanvasFilters ? 'No items match your filters. Try clearing the course/date/search filters or click Refresh.' : 'No Canvas items found. Click Refresh.'}</p></div>
              ) : (
                filteredCanvasItems.map((item, idx) => (
                  <div key={`${item.id || 'item'}-${idx}`} className={`assignment-card canvas-item-card ${item.type}`}>
                    <div className="canvas-item-type-badge">{item.type}</div>
                    <div className="assignment-name">{item.name}</div>
                    <div className="assignment-course">{item.course_name}</div>
                    {item.date && (
                      <div className={`assignment-due ${item.type === 'assignment' && isDueOverdue(item.date) ? 'overdue' : ''}`}>
                        {formatDueDate(item.date)}{item.points_possible ? ` · ${item.points_possible} pts` : ''}
                      </div>
                    )}
                    {item.description && item.description !== 'Canvas Page' && (
                      <div className="canvas-item-desc">{item.description.slice(0, 120)}{item.description.length > 120 ? '…' : ''}</div>
                    )}
                    <div className="canvas-item-actions">
                      <button className="use-btn" onClick={() => useCanvasItem(item)}>Get Help</button>
                      <button className="btn-secondary canvas-ctx-btn" onClick={() => addCanvasToContext(item)} title="Add this item to AI context">
                        + Context
                      </button>
                      <a className="btn-secondary canvas-ctx-btn" href={item.html_url || item.url} target="_blank" rel="noreferrer">
                        Open
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }}>
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      }

      {/* QUIZ OVERLAY */}
      {activeQuiz && (
        <QuizView
          topic={activeQuiz.topic}
          count={activeQuiz.count}
          courseName="General Knowledge"
          transcripts={[]}
          apiKey={apiKey}
          onClose={() => setActiveQuiz(null)}
        />
      )}

      {/* ---- SETTINGS MODAL ---- */}
      {
        showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Settings</h2>
                <button className="modal-close" onClick={() => setShowSettings(false)}>{Icon.close}</button>
              </div>
              <form className="modal-body" onSubmit={handleSaveSettings}>
                <div className="form-group">
                  <label>MBZUAI API Key</label>
                  <input type="password" name="apiKey" defaultValue={apiKey} placeholder="IFM-..." />
                  <div className="hint">Stored locally in your browser only. Never sent anywhere else.</div>
                </div>
                <div className="form-group">
                  <label>Canvas LMS URL</label>
                  <input type="url" name="canvasUrl" defaultValue={canvasUrl} placeholder="https://yourschool.instructure.com" />
                  <div className="hint">Your school's Canvas URL</div>
                </div>
                <div className="form-group">
                  <label>Canvas API Token</label>
                  <input type="password" name="canvasToken" defaultValue={canvasToken} placeholder="Canvas access token" />
                  <div className="hint">Canvas: Account &gt; Settings &gt; Approved Integrations &gt; New Access Token</div>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" name="emojisEnabled" defaultChecked={emojisEnabled} />
                    <span>Enable Emojis in AI responses</span>
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" name="fullCanvasContext" defaultChecked={fullCanvasContext} />
                    <span>Enable Full Canvas Context (AI knows all assignments)</span>
                  </label>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
                  <button type="submit" className="btn-primary">Save</button>
                </div>
              </form>
            </div>
          </div>
        )
      }
      {/* ---- HELP MODAL ---- */}
      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Help & Usage Guide</h2>
              <button className="modal-close" onClick={() => setShowHelp(false)}>{Icon.close}</button>
            </div>
            <div className="modal-body">
              <h3>Welcome to Lumina</h3>
              <p>Lumina is your intelligent AI companion designed to help you organize, understand, and excel in your courses.</p>

              <h4 style={{ marginTop: '16px' }}>Features</h4>
              <ul style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
                <li><strong>Your Courses:</strong> Enter a dedicated space for any course to get tailored help based on its lecture content, topics, and assignments.</li>
                <li><strong>Canvas Assignments:</strong> Connect your LMS to automatically track and receive hints on upcoming assignments.</li>
                <li><strong>Lecture Content:</strong> Paste, record, upload, or transcribe lecture notes directly inside each course workspace.</li>
                <li><strong>Voice Mode:</strong> Tap the microphone or the voice mode circle to converse with Lumina hands-free.</li>
              </ul>
              <div className="form-actions" style={{ marginTop: '24px' }}>
                <button type="button" className="btn-primary" onClick={() => setShowHelp(false)}>Got it!</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div >
  );
}
