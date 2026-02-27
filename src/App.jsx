import { useState, useEffect, useRef, useCallback } from 'react';
import { streamChat } from './api';
import { SYSTEM_PROMPT } from './systemPrompt';
import { fetchAllAssignments, formatDueDate, isDueOverdue } from './canvasApi';

// SVG Icons
const Icons = {
  menu: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>,
  send: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>,
  mic: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>,
  micOff: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 1l22 22M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .84-.15 1.65-.42 2.4M12 19v4M8 23h8" /></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>,
  close: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>,
  chat: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>,
  book: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>,
  clipboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>,
  fileText: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>,
  stop: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>,
};

// Local storage helpers
function loadFromStorage(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function App() {
  // ===== STATE =====
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chats, setChats] = useState(() => loadFromStorage('school-ai-chats', []));
  const [activeChatId, setActiveChatId] = useState(() => loadFromStorage('school-ai-active', null));
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  // Settings
  const [apiKey, setApiKey] = useState(() => loadFromStorage('school-ai-apikey', 'IFM-WkjDZvTiR3M7dwqV'));
  const [canvasUrl, setCanvasUrl] = useState(() => loadFromStorage('school-ai-canvas-url', ''));
  const [canvasToken, setCanvasToken] = useState(() => loadFromStorage('school-ai-canvas-token', ''));

  // Canvas
  const [assignments, setAssignments] = useState([]);
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasError, setCanvasError] = useState('');

  // Refs
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const recognitionRef = useRef(null);

  // ===== PERSISTENCE =====
  useEffect(() => { saveToStorage('school-ai-chats', chats); }, [chats]);
  useEffect(() => { saveToStorage('school-ai-active', activeChatId); }, [activeChatId]);
  useEffect(() => { saveToStorage('school-ai-apikey', apiKey); }, [apiKey]);
  useEffect(() => { saveToStorage('school-ai-canvas-url', canvasUrl); }, [canvasUrl]);
  useEffect(() => { saveToStorage('school-ai-canvas-token', canvasToken); }, [canvasToken]);

  // ===== DERIVED =====
  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  // ===== AUTO-SCROLL =====
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ===== CHAT MANAGEMENT =====
  function createNewChat() {
    const newChat = { id: generateId(), title: 'New Chat', messages: [], createdAt: Date.now() };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setInput('');
    setShowTranscript(false);
    setShowCanvas(false);
  }

  function deleteChat(chatId, e) {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
  }

  function updateChatMessages(chatId, updater) {
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const newMessages = typeof updater === 'function' ? updater(c.messages) : updater;
      // Auto-set title from first user message
      let title = c.title;
      if (title === 'New Chat') {
        const firstUser = newMessages.find(m => m.role === 'user');
        if (firstUser) {
          title = firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '...' : '');
        }
      }
      return { ...c, messages: newMessages, title };
    }));
  }

  // ===== SEND MESSAGE =====
  async function handleSend() {
    if (!input.trim() || isStreaming) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    let chatId = activeChatId;
    if (!chatId) {
      const newChat = { id: generateId(), title: 'New Chat', messages: [], createdAt: Date.now() };
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      chatId = newChat.id;
    }

    const userMessage = { role: 'user', content: input.trim() };
    const assistantMessage = { role: 'assistant', content: '' };

    // Build context with transcript if available
    let systemContent = SYSTEM_PROMPT;
    if (transcript.trim()) {
      systemContent += `\n\n## Current Class Transcript Context:\n${transcript.trim()}`;
    }

    const apiMessages = [
      { role: 'system', content: systemContent },
      ...messages,
      userMessage,
    ];

    updateChatMessages(chatId, [...messages, userMessage, assistantMessage]);
    setInput('');
    setIsStreaming(true);

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    let accumulated = '';

    await streamChat(
      apiMessages,
      apiKey,
      (chunk) => {
        accumulated += chunk;
        const current = accumulated;
        updateChatMessages(chatId, (prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: current };
          return updated;
        });
      },
      () => {
        setIsStreaming(false);
      },
      (error) => {
        updateChatMessages(chatId, (prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: `⚠️ Error: ${error}` };
          return updated;
        });
        setIsStreaming(false);
      }
    );
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }

  // ===== KEYBOARD =====
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ===== TEXT AREA AUTO-RESIZE =====
  function handleInputChange(e) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  }

  // ===== SPEECH-TO-TEXT =====
  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in your browser. Please use Chrome.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setInput(prev => {
        const base = prev.replace(/\[listening...\].*$/, '').trim();
        return (base ? base + ' ' : '') + finalTranscript + (interim ? `[listening...] ${interim}` : '');
      });
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInput(prev => prev.replace(/\[listening...\].*$/, '').trim());
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  // ===== CANVAS LMS =====
  async function loadCanvasAssignments() {
    if (!canvasUrl || !canvasToken) return;
    setCanvasLoading(true);
    setCanvasError('');
    try {
      const data = await fetchAllAssignments(canvasUrl, canvasToken);
      setAssignments(data);
    } catch (e) {
      setCanvasError(e.message);
    } finally {
      setCanvasLoading(false);
    }
  }

  function useAssignment(assignment) {
    const text = `I need help with this assignment:\n\n**${assignment.name}**\nCourse: ${assignment.course_name}\nDue: ${formatDueDate(assignment.due_at)}\nPoints: ${assignment.points_possible || 'N/A'}\n\nDescription:\n${assignment.description}`;
    setInput(text);
    setShowCanvas(false);
    textareaRef.current?.focus();
  }

  // ===== SAVE SETTINGS =====
  function handleSaveSettings(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    setApiKey(formData.get('apiKey'));
    setCanvasUrl(formData.get('canvasUrl'));
    setCanvasToken(formData.get('canvasToken'));
    setShowSettings(false);
  }

  // ===== WELCOME CARD ACTIONS =====
  function handleWelcomeCard(type) {
    switch (type) {
      case 'ask':
        createNewChat();
        setInput("Can you help me understand the concept of photosynthesis?");
        break;
      case 'canvas':
        setShowCanvas(true);
        if (canvasUrl && canvasToken) loadCanvasAssignments();
        break;
      case 'transcript':
        setShowTranscript(true);
        break;
      case 'settings':
        setShowSettings(true);
        break;
    }
  }

  // ===== RENDER =====
  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon">S</div>
            <span>School AI</span>
          </div>
        </div>

        <button className="new-chat-btn" onClick={createNewChat}>
          {Icons.plus}
          New Chat
        </button>

        <div className="chat-list">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
              onClick={() => setActiveChatId(chat.id)}
            >
              <span className="chat-icon">{Icons.chat}</span>
              <span className="chat-title">{chat.title}</span>
              <button className="delete-btn" onClick={(e) => deleteChat(chat.id, e)}>
                {Icons.trash}
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <button className="sidebar-bottom-btn" onClick={() => setShowTranscript(!showTranscript)}>
            <span className="btn-icon">{Icons.clipboard}</span>
            Class Transcript
          </button>
          <button className="sidebar-bottom-btn" onClick={() => {
            setShowCanvas(!showCanvas);
            if (!showCanvas && canvasUrl && canvasToken) loadCanvasAssignments();
          }}>
            <span className="btn-icon">{Icons.book}</span>
            Canvas Assignments
          </button>
          <button className="sidebar-bottom-btn" onClick={() => setShowSettings(true)}>
            <span className="btn-icon">{Icons.settings}</span>
            Settings
          </button>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main-area">
        {/* TOPBAR */}
        <header className="topbar">
          <div className="topbar-left">
            <button className="toggle-sidebar-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {Icons.menu}
            </button>
            <span className="model-selector">K2-Think-v2</span>
            {apiKey ? (
              <span className="status-badge connected">
                <span className="status-dot" />
                Connected
              </span>
            ) : (
              <span className="status-badge disconnected">
                <span className="status-dot" />
                No API Key
              </span>
            )}
          </div>
          <div className="topbar-right">
            <button className="toggle-sidebar-btn" onClick={() => setShowTranscript(!showTranscript)} title="Class Transcript">
              {Icons.clipboard}
            </button>
            <button className="toggle-sidebar-btn" onClick={() => {
              setShowCanvas(!showCanvas);
              if (!showCanvas && canvasUrl && canvasToken) loadCanvasAssignments();
            }} title="Canvas Assignments">
              {Icons.book}
            </button>
          </div>
        </header>

        {/* CHAT AREA */}
        <div className="chat-area">
          {!activeChatId || messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-logo">S</div>
              <h1 className="welcome-title">School AI</h1>
              <p className="welcome-subtitle">
                Your intelligent study companion. I guide you to answers through Socratic questioning — helping you truly learn, not just copy.
              </p>
              <div className="welcome-cards">
                <div className="welcome-card" onClick={() => handleWelcomeCard('ask')}>
                  <div className="card-icon">💡</div>
                  <div className="card-title">Ask a Question</div>
                  <div className="card-desc">Get guided through any subject with hints and questions</div>
                </div>
                <div className="welcome-card" onClick={() => handleWelcomeCard('canvas')}>
                  <div className="card-icon">📚</div>
                  <div className="card-title">Canvas Assignments</div>
                  <div className="card-desc">Pull your assignments from Canvas LMS and get help</div>
                </div>
                <div className="welcome-card" onClick={() => handleWelcomeCard('transcript')}>
                  <div className="card-icon">📝</div>
                  <div className="card-title">Class Transcript</div>
                  <div className="card-desc">Paste or record your class transcript for context</div>
                </div>
                <div className="welcome-card" onClick={() => handleWelcomeCard('settings')}>
                  <div className="card-icon">⚙️</div>
                  <div className="card-title">Configure</div>
                  <div className="card-desc">Set up your API keys and Canvas integration</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className="message">
                  <div className={`message-avatar ${msg.role}`}>
                    {msg.role === 'user' ? 'U' : 'S'}
                  </div>
                  <div className="message-content">
                    <div className="message-role">
                      {msg.role === 'user' ? 'You' : 'School AI'}
                    </div>
                    <div className="message-text">
                      {msg.content || (
                        <div className="typing-indicator">
                          <span /><span /><span />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* INPUT AREA */}
        <div className="input-area">
          <div className="input-wrapper">
            <div className="input-row">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything... I'll guide you to the answer 💡"
                rows={1}
                disabled={isStreaming}
              />
              <div className="input-actions">
                <button
                  className={`input-action-btn ${isRecording ? 'recording' : ''}`}
                  onClick={toggleRecording}
                  title={isRecording ? 'Stop recording' : 'Start voice input'}
                >
                  {isRecording ? Icons.micOff : Icons.mic}
                </button>
                {isStreaming ? (
                  <button className="send-btn" onClick={handleStop} title="Stop generating">
                    {Icons.stop}
                  </button>
                ) : (
                  <button className="send-btn" onClick={handleSend} disabled={!input.trim()} title="Send message">
                    {Icons.send}
                  </button>
                )}
              </div>
            </div>
            <div className="input-footer">
              <span>Shift+Enter for new line</span>
              <span>Powered by K2-Think-v2</span>
            </div>
          </div>
        </div>
      </main>

      {/* TRANSCRIPT PANEL */}
      {showTranscript && (
        <div className="transcript-panel">
          <div className="panel-header">
            <h3>📝 Class Transcript</h3>
            <button className="modal-close" onClick={() => setShowTranscript(false)}>
              {Icons.close}
            </button>
          </div>
          <div className="panel-body">
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your class transcript here, or use the microphone button in the chat to transcribe live audio.

The AI will use this transcript as context to help you with subject-specific questions from your lesson."
            />
          </div>
          <div className="panel-footer">
            <button className="btn-secondary" onClick={() => setTranscript('')}>Clear</button>
            <button className="btn-primary" onClick={() => {
              setShowTranscript(false);
              if (transcript.trim()) {
                setInput(`Here's my class transcript for context:\n\n${transcript.trim()}\n\nCan you help me understand the key concepts from this lesson?`);
              }
            }}>
              Use in Chat
            </button>
          </div>
        </div>
      )}

      {/* CANVAS PANEL */}
      {showCanvas && (
        <div className="canvas-panel">
          <div className="panel-header">
            <h3>📚 Canvas Assignments</h3>
            <button className="modal-close" onClick={() => setShowCanvas(false)}>
              {Icons.close}
            </button>
          </div>
          <div className="panel-body">
            {!canvasUrl || !canvasToken ? (
              <div className="canvas-setup">
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔗</div>
                <p>Connect your Canvas LMS account in Settings to pull your assignments.</p>
                <button className="btn-primary" onClick={() => { setShowCanvas(false); setShowSettings(true); }}>
                  Open Settings
                </button>
              </div>
            ) : canvasLoading ? (
              <div className="no-assignments">
                <div className="typing-indicator" style={{ justifyContent: 'center', marginBottom: '12px' }}>
                  <span /><span /><span />
                </div>
                Loading assignments from Canvas...
              </div>
            ) : canvasError ? (
              <div className="no-assignments">
                <p style={{ color: 'var(--danger)', marginBottom: '12px' }}>⚠️ {canvasError}</p>
                <button className="btn-primary" onClick={loadCanvasAssignments}>Retry</button>
              </div>
            ) : assignments.length === 0 ? (
              <div className="no-assignments">
                <p>No assignments found.</p>
                <button className="btn-primary" onClick={loadCanvasAssignments} style={{ marginTop: '12px' }}>Refresh</button>
              </div>
            ) : (
              <>
                <button className="btn-secondary" onClick={loadCanvasAssignments} style={{ marginBottom: '12px', width: '100%' }}>
                  Refresh Assignments
                </button>
                {assignments.map(a => (
                  <div key={a.id} className="assignment-card">
                    <div className="assignment-name">{a.name}</div>
                    <div className="assignment-course">{a.course_name}</div>
                    <div className={`assignment-due ${isDueOverdue(a.due_at) ? 'overdue' : ''}`}>
                      {formatDueDate(a.due_at)}
                      {a.points_possible ? ` · ${a.points_possible} pts` : ''}
                    </div>
                    <button className="use-btn" onClick={() => useAssignment(a)}>
                      Get Help with This
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚙️ Settings</h2>
              <button className="modal-close" onClick={() => setShowSettings(false)}>
                {Icons.close}
              </button>
            </div>
            <form className="modal-body" onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label>MBZUAI API Key</label>
                <input
                  type="password"
                  name="apiKey"
                  defaultValue={apiKey}
                  placeholder="Enter your K2-Think-v2 API key"
                />
                <div className="hint">Your API key is stored locally in your browser only.</div>
              </div>
              <div className="form-group">
                <label>Canvas LMS URL</label>
                <input
                  type="url"
                  name="canvasUrl"
                  defaultValue={canvasUrl}
                  placeholder="https://yourschool.instructure.com"
                />
                <div className="hint">Your school's Canvas URL (e.g. https://myschool.instructure.com)</div>
              </div>
              <div className="form-group">
                <label>Canvas API Token</label>
                <input
                  type="password"
                  name="canvasToken"
                  defaultValue={canvasToken}
                  placeholder="Enter your Canvas API access token"
                />
                <div className="hint">Generate from Canvas → Account → Settings → New Access Token</div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowSettings(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
