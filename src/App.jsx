import { useState, useEffect, useRef, useCallback } from 'react';
import { streamChat, buildContent } from './api';
import { SYSTEM_PROMPT } from './systemPrompt';
import { fetchAllCanvasData, formatDueDate, isDueOverdue } from './canvasApi';
import { MessageRenderer } from './MessageRenderer';

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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="22"></line>
      <circle cx="12" cy="12" r="10" strokeWidth="1" strokeDasharray="2 2" opacity="0.5"></circle>
    </svg>
  )
};

// ============================================================
// SCHOOL AI LOGO SVG
// ============================================================
function SchoolAILogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6c5ce7" />
          <stop offset="1" stopColor="#00cec9" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#logoGrad)" />
      {/* Book/graduation cap shape */}
      <path d="M20 10L8 16l12 6 12-6-12-6z" fill="white" fillOpacity="0.95" />
      <path d="M14 18.5v5.5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5L20 21l-6-2.5z" fill="white" fillOpacity="0.7" />
      <path d="M32 16v7" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="24" r="1.5" fill="white" fillOpacity="0.8" />
    </svg>
  );
}

// ============================================================
// LOCAL STORAGE HELPERS
// ============================================================
function loadStorage(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveStorage(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ============================================================
// TTS HELPER
// ============================================================
function stripMarkdown(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
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
  const [showTranscript, setShowTranscript] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
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
  const [canvasItems, setCanvasItems] = useState(() => loadStorage('sai-canvas-items', []));
  const [canvasLastUpdated, setCanvasLastUpdated] = useState(() => loadStorage('sai-canvas-updated', null));
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasError, setCanvasError] = useState('');
  const [canvasTab, setCanvasTab] = useState('all');       // all | assignment | file | page | announcement
  const [canvasSearch, setCanvasSearch] = useState('');
  const [canvasCourse, setCanvasCourse] = useState('all');
  const [canvasDateFrom, setCanvasDateFrom] = useState('');
  const [canvasDateTo, setCanvasDateTo] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => loadStorage('sai-websearch', false));
  const [emojisEnabled, setEmojisEnabled] = useState(() => loadStorage('sai-emojis', false));

  // Voice Mode
  const [showVoiceMode, setShowVoiceMode] = useState(false);
  const [voiceModeText, setVoiceModeText] = useState('SPEAK TO BEGIN');
  const [voiceMuted, setVoiceMuted] = useState(false);
  const voiceTimeoutRef = useRef(null);

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
  useEffect(() => { saveStorage('sai-canvas-items', canvasItems); }, [canvasItems]);
  useEffect(() => { saveStorage('sai-canvas-items', canvasItems); }, [canvasItems]);
  useEffect(() => { saveStorage('sai-canvas-updated', canvasLastUpdated); }, [canvasLastUpdated]);

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
    setShowTranscript(false);
    setShowCanvas(false);
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
      } else if (file.type.startsWith('text/') || file.name.endsWith('.pdf') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const text = await file.text();
        newAtts.push({ id, name: file.name, type: 'text', content: text });
      } else if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
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
  async function handleSend() {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    if (!apiKey) { setShowSettings(true); return; }

    let chatId = activeChatId;
    if (!chatId) {
      const nc = { id: genId(), title: 'New Chat', messages: [], createdAt: Date.now() };
      setChats(p => [nc, ...p]);
      setActiveChatId(nc.id);
      chatId = nc.id;
    }

    // Build user message content (multimodal if images attached)
    const hasImages = attachments.some(a => a.type === 'image');
    const userContent = hasImages
      ? buildContent(input.trim(), attachments)
      : input.trim() + attachments.filter(a => a.type === 'text').map(a => `\n\n[File: ${a.name}]\n${a.content}`).join('');

    const displayText = input.trim() + (attachments.length > 0 ? `\n\n*[${attachments.map(a => a.name).join(', ')}]*` : '');
    const userMsg = { role: 'user', content: displayText, id: genId() };
    const apiUserMsg = { role: 'user', content: userContent, id: userMsg.id };
    const asstMsg = { role: 'assistant', content: '', id: genId() };

    let systemContent = SYSTEM_PROMPT;
    if (transcript.trim()) systemContent += `\n\n## Class Transcript / Context Provided:\n${transcript.trim()}`;

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
      ...messages.map(m => ({ role: m.role, content: m.content })),
      apiUserMsg,
    ];
    updateMessages(chatId, [...messages, userMsg, asstMsg]);
    setInput('');
    setAttachments([]);
    setIsStreaming(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let accumulated = '';
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
        if (showVoiceMode) setVoiceModeText(cur);
      },
      () => {
        setIsStreaming(false);
        if (showVoiceMode && !voiceMuted) {
          speakMessage({ id: asstMsg.id, content: accumulated }, true);
        } else if (showVoiceMode && voiceMuted) {
          // Restart STT immediately if muted
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
        if (showVoiceMode) setVoiceModeText('Error connecting to AI.');
      }
    );
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
    const text = stripMarkdown(msg.content);
    if (!text) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0;
    utt.pitch = 1.0;

    // Prefer higher quality voices
    const voices = window.speechSynthesis.getVoices();
    let preferred = voices.find(v => v.name.includes('Online (Natural)') && v.lang.startsWith('en'));
    if (!preferred) preferred = voices.find(v => (v.name.includes('Google') || v.name.includes('Premium')) && v.lang.startsWith('en'));
    if (!preferred) preferred = voices.find(v => v.lang.startsWith('en') && v.localService);
    if (!preferred) preferred = voices.find(v => v.lang.startsWith('en'));

    if (preferred) utt.voice = preferred;

    utt.onend = () => {
      setIsSpeaking(false);
      setSpeakingMsgId(null);
      // Auto-restart listening in Voice Mode
      if (showVoiceMode && !voiceMuted) {
        startVoiceModeSTT();
      }
    };
    utt.onerror = () => {
      setIsSpeaking(false);
      setSpeakingMsgId(null);
    };
    setIsSpeaking(true);
    setSpeakingMsgId(msg.id);
    window.speechSynthesis.speak(utt);
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
      if (recognitionRef.current) recognitionRef.current.stop();
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
      window.speechSynthesis.cancel();
      setShowVoiceMode(false);
      setIsRecording(false);
      setIsSpeaking(false);
    } else {
      // Turn on
      setShowVoiceMode(true);
      setVoiceModeText('SPEAK TO BEGIN');
      startVoiceModeSTT();
    }
  }

  // ---- CANVAS ----
  async function loadCanvas() {
    if (!canvasUrl || !canvasToken) return;
    setCanvasLoading(true); setCanvasError('');
    try {
      const data = await fetchAllCanvasData(canvasUrl, canvasToken);
      setCanvasItems(data);
      setCanvasLastUpdated(Date.now());
    }
    catch (e) { setCanvasError(e.message); }
    finally { setCanvasLoading(false); }
  }

  // Derived list based on active filters
  const canvasCourses = [...new Set(canvasItems.map(i => i.course_name))].sort();
  const filteredCanvasItems = canvasItems.filter(item => {
    if (canvasTab !== 'all' && item.type !== canvasTab) return false;
    if (canvasCourse !== 'all' && item.course_name !== canvasCourse) return false;
    if (canvasSearch && !item.name.toLowerCase().includes(canvasSearch.toLowerCase())) return false;
    if (canvasDateFrom && item.date && new Date(item.date) < new Date(canvasDateFrom)) return false;
    if (canvasDateTo && item.date && new Date(item.date) > new Date(canvasDateTo + 'T23:59:59')) return false;
    return true;
  });

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
    setShowSettings(false);
  }

  // ---- WELCOME CARDS ----
  function welcomeAction(type) {
    if (type === 'ask') { createNewChat(); setTimeout(() => textareaRef.current?.focus(), 100); }
    if (type === 'canvas') { setShowCanvas(true); if (canvasUrl && canvasToken) loadCanvas(); }
    if (type === 'transcript') setShowTranscript(true);
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
            <SchoolAILogo size={30} />
            <span>School AI</span>
          </div>
        </div>

        <button className="new-chat-btn" onClick={createNewChat}>
          {Icon.plus}
          New Chat
        </button>

        <div className="chat-list">
          {chats.map(chat => (
            <div key={chat.id} className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`} onClick={() => setActiveChatId(chat.id)}>
              <span className="chat-icon">{Icon.chat}</span>
              <span className="chat-title">{chat.title}</span>
              <button className="delete-btn" onClick={e => deleteChat(chat.id, e)}>{Icon.trash}</button>
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <button className="sidebar-bottom-btn" onClick={() => setShowTranscript(!showTranscript)}>
            <span className="btn-icon">{Icon.clipboard}</span> Class Transcript
            {transcript.trim() && <span className="active-dot" />}
          </button>
          <button className="sidebar-bottom-btn" onClick={() => { setShowCanvas(!showCanvas); if (!showCanvas && canvasUrl && canvasToken) loadCanvas(); }}>
            <span className="btn-icon">{Icon.book}</span> Canvas Assignments
          </button>
          <button className="sidebar-bottom-btn" onClick={() => setShowSettings(true)}>
            <span className="btn-icon">{Icon.settings}</span> Settings
          </button>
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
            <button className="toggle-sidebar-btn" onClick={() => setShowTranscript(!showTranscript)} title="Class Transcript">{Icon.clipboard}</button>
            <button className="toggle-sidebar-btn" onClick={() => { setShowCanvas(!showCanvas); if (!showCanvas && canvasUrl && canvasToken) loadCanvas(); }} title="Canvas Hub">{Icon.book}</button>
          </div>
        </header>

        {/* CHAT AREA */}
        <div className="chat-area" ref={chatAreaRef}>
          {!activeChatId || messages.length === 0 ? (
            <div className="welcome-screen">
              <SchoolAILogo size={64} />
              <h1 className="welcome-title">School AI</h1>
              <p className="welcome-subtitle">
                Your intelligent study companion. Ask a question, load your assignments, or share your class notes to get started.
              </p>
              <div className="welcome-cards">
                {[
                  { key: 'ask', icon: Icon.question, title: 'Ask a Question', desc: 'Get guided through any subject with targeted hints' },
                  { key: 'canvas', icon: Icon.layers, title: 'Canvas Assignments', desc: 'Pull your assignments from Canvas LMS and get help' },
                  { key: 'transcript', icon: Icon.fileText, title: 'Class Transcript', desc: 'Paste or record your lesson notes for context' },
                  { key: 'settings', icon: Icon.gear, title: 'Configure', desc: 'Set up your API keys and Canvas integration' },
                ].map(card => (
                  <div key={card.key} className="welcome-card" onClick={() => welcomeAction(card.key)}>
                    <div className="card-icon">{card.icon}</div>
                    <div className="card-title">{card.title}</div>
                    <div className="card-desc">{card.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={`message message-${msg.role}`}>
                  <div className={`message-avatar ${msg.role}`}>
                    {msg.role === 'user' ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    ) : (
                      <SchoolAILogo size={22} />
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-role-row">
                      <span className="message-role">{msg.role === 'user' ? 'You' : 'School AI'}</span>
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
                    />
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <div className="input-area">
          {transcript.trim() && (
            <div className="transcript-pill">
              <span>{Icon.clipboard}</span>
              <span>Class transcript active</span>
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
                <button
                  className={`input-action-btn ${webSearchEnabled ? 'active-icon' : ''}`}
                  onClick={() => setWebSearchEnabled(p => !p)}
                  title={webSearchEnabled ? 'Web search ON' : 'Web search OFF'}
                  disabled={isStreaming}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
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
            <div className="input-footer">
              <span>Powered by K2-Think-v2</span>
            </div>
          </div>
        </div>
      </main>

      {/* ---- VOICE MODE OVERLAY ---- */}
      {showVoiceMode && (
        <div className="voice-mode-overlay">
          <button className="voice-close-btn" onClick={toggleVoiceMode} title="Close Voice Mode">
            {Icon.close}
          </button>

          <div className="voice-center-container">
            <div className={`voice-circle-animation ${isSpeaking ? 'speaking' : isRecording ? 'listening' : ''}`}></div>
            <div className="voice-text">
              {voiceModeText}
            </div>
          </div>

          <button className={`voice-mute-btn ${voiceMuted ? 'muted' : ''}`} onClick={() => setVoiceMuted(!voiceMuted)} title={voiceMuted ? 'Unmute AI' : 'Mute AI'}>
            {voiceMuted ? Icon.micOff : Icon.mic}
          </button>
        </div>
      )}

      {/* ---- TRANSCRIPT PANEL ---- */}
      {showTranscript && (
        <div className="side-panel">
          <div className="panel-header">
            <h3>Class Transcript</h3>
            <button className="modal-close" onClick={() => setShowTranscript(false)}>{Icon.close}</button>
          </div>
          <div className="panel-body">
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste your class transcript here, or use the microphone in the chat to transcribe live audio.

The AI will use this as context when answering your questions."
            />
          </div>
          <div className="panel-footer">
            <button className="btn-secondary" onClick={() => setTranscript('')}>Clear</button>
            <button className="btn-primary" onClick={() => {
              setShowTranscript(false);
              if (transcript.trim()) setInput(`Here is my class transcript for context:\n\n${transcript.trim()}\n\nCan you help me understand the key concepts from this lesson?`);
            }}>Use in Chat</button>
          </div>
        </div>
      )}

      {/* ---- CANVAS HUB PANEL ---- */}
      {showCanvas && (
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
            {['all', 'assignment', 'file', 'page', 'announcement'].map(tab => (
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
                {canvasCourses.map(c => <option key={c} value={c}>{c}</option>)}
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
              <div className="panel-empty"><p>{canvasItems.length === 0 ? 'No data found. Click Refresh.' : 'No items match your filters.'}</p></div>
            ) : (
              filteredCanvasItems.map((item, idx) => (
                <div key={item.id || idx} className={`assignment-card canvas-item-card ${item.type}`}>
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
                    {(item.html_url || item.url) && (
                      <a className="btn-secondary canvas-ctx-btn" href={item.html_url || item.url} target="_blank" rel="noreferrer">Open ↗</a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ---- SETTINGS MODAL ---- */}
      {showSettings && (
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
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
