import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { streamChat, buildContent } from './api';
import { SYSTEM_PROMPT } from './systemPrompt';
import { parseCanvasDate, formatDueDate, isDueOverdue, selectCanvasContextItems } from './canvasApi';
import { MessageRenderer } from './MessageRenderer';
import TranscriptManager from './TranscriptManager';
import TopicMindMap from './TopicMindMap';

// ============================================================
// COURSE HUB — dedicated workspace for a single course
// ============================================================

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function stripReasoning(text) {
    if (!text) return '';
    let output = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const openIdx = output.lastIndexOf('<think>');
    if (openIdx !== -1) output = output.substring(0, openIdx);
    return output.trim();
}

const HubIcon = ({ type, size = 18 }) => {
    switch (type) {
        case 'chat':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
            );
        case 'transcripts':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </svg>
            );
        case 'mindmap':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /><path d="M15 15l3.5 3.5" /><path d="M9 15L5.5 18.5" /><path d="M15 9l3.5-3.5" /><path d="M9 9L5.5 5.5" />
                </svg>
            );
        case 'assignments':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
            );
        default: return null;
    }
};

const TABS = [
    { key: 'chat', label: 'Chat', icon: <HubIcon type="chat" /> },
    { key: 'transcripts', label: 'Transcripts', icon: <HubIcon type="transcripts" /> },
    { key: 'mindmap', label: 'Mind Map', icon: <HubIcon type="mindmap" /> },
    { key: 'assignments', label: 'Assignments', icon: <HubIcon type="assignments" /> },
];

export default function CourseHub({
    course,
    canvasItems,
    allTranscripts,
    allTopics,
    apiKey,
    onBack,
    onUpdateTranscripts,
    onUpdateTopics,
    onUpdateChats,
    courseChats,
    SchoolAILogo,
    hiddenCourses,
}) {
    const [activeTab, setActiveTab] = useState('chat');
    const [activeChatId, setActiveChatId] = useState(() => courseChats[0]?.id || null);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [speakingMsgId, setSpeakingMsgId] = useState(null);

    const chatEndRef = useRef(null);
    const chatAreaRef = useRef(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    // Filter canvas items for this specific course
    const courseAssignments = useMemo(() => {
        return (canvasItems || []).filter(item =>
            item.course_name === course.name && item.type === 'assignment'
        ).sort((a, b) => {
            const dA = parseCanvasDate(a.date);
            const dB = parseCanvasDate(b.date);
            if (!dA && !dB) return 0;
            if (!dA) return 1;
            if (!dB) return -1;
            return dA - dB;
        });
    }, [canvasItems, course.name]);

    // Filter transcripts for this specific course
    const courseTranscripts = useMemo(() =>
        (allTranscripts || []).filter(t => t.courseId === course.id),
        [allTranscripts, course.id]
    );

    // Filter topics for this specific course
    const courseTopics = useMemo(() =>
        (allTopics || []).filter(t => t.courseId === course.id),
        [allTopics, course.id]
    );

    const activeChat = courseChats.find(c => c.id === activeChatId);
    const messages = activeChat?.messages || [];

    // Auto-scroll
    useEffect(() => {
        if (chatAreaRef.current) chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }, [courseChats, activeChatId]);

    function createNewChat() {
        const nc = { id: genId(), courseId: course.id, title: 'New Chat', messages: [], createdAt: Date.now() };
        onUpdateChats(prev => [nc, ...prev]);
        setActiveChatId(nc.id);
        setInput('');
        setTimeout(() => textareaRef.current?.focus(), 100);
    }

    function deleteChat(id, e) {
        e?.stopPropagation();
        onUpdateChats(prev => prev.filter(c => c.id !== id));
        if (activeChatId === id) setActiveChatId(null);
    }

    // Build teacher-emulation system prompt
    function buildCourseSystemPrompt(userInput) {
        const courseName = course.name;
        let prompt = SYSTEM_PROMPT;

        // Teacher emulation framing
        prompt += `\n\n## COURSE CONTEXT: ${courseName}
You are acting as the AI teaching assistant specifically for the course "${courseName}".
You have been trained on the student's class transcripts (what the teacher actually said in class).
When helping the student, reference what was taught in class using the transcripts below.
Emulate the teacher's style, vocabulary, and approach as closely as possible.
Always connect your answers back to what was covered in the class transcripts when relevant.`;

        // Inject transcripts
        if (courseTranscripts.length > 0) {
            const transcriptContext = courseTranscripts
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 10) // Last 10 transcripts
                .map(t => {
                    const dateStr = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const text = t.text.length > 2000 ? t.text.substring(0, 2000) + '...' : t.text;
                    return `### Class on ${dateStr}\n${text}`;
                })
                .join('\n\n');
            prompt += `\n\n## CLASS TRANSCRIPTS (What the teacher said)\n${transcriptContext}`;
        }

        // Inject extracted topics
        if (courseTopics.length > 0) {
            const topicsSummary = courseTopics
                .map(t => `- **${t.name}**: ${t.summary}`)
                .join('\n');
            prompt += `\n\n## KEY TOPICS COVERED IN CLASS\n${topicsSummary}`;
        }

        // Inject relevant Canvas assignments
        const filtered = selectCanvasContextItems(canvasItems || [], userInput, hiddenCourses || [], new Date());
        const courseFiltered = filtered.filter(i => i.course_name === courseName);
        if (courseFiltered.length > 0) {
            const assignmentContext = courseFiltered
                .map(item => {
                    const dueDate = parseCanvasDate(item.date);
                    const dueLabel = dueDate ? dueDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Date';
                    const desc = item.description || 'No description';
                    const shortDesc = desc.length > 600 ? desc.substring(0, 600) + '...' : desc;
                    return `[${item.type}] ${item.name} - Due: ${dueLabel}\nDescription: ${shortDesc}`;
                })
                .join('\n\n');
            prompt += `\n\n## COURSE ASSIGNMENTS\n${assignmentContext}`;
        }

        // Add current date
        const todayDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        prompt += `\n\n[System Info: Today's date is ${todayDate}]`;

        return prompt;
    }

    // ---- SEND MESSAGE ----
    async function handleSend(forcedInput) {
        const text = (forcedInput ?? input).trim();
        if ((!text && attachments.length === 0) || isStreaming) return;

        let targetChatId = activeChatId;

        // If no active chat, create one immediately
        if (!targetChatId) {
            const nc = { id: genId(), courseId: course.id, title: text.slice(0, 40) || 'New Chat', messages: [], createdAt: Date.now() };
            onUpdateChats(prev => [nc, ...prev]);
            setActiveChatId(nc.id);
            targetChatId = nc.id;
        }

        // Create new messages
        const userMsg = { id: genId(), role: 'user', content: text, ts: Date.now() };
        const assistantMsg = { id: genId(), role: 'assistant', content: '', ts: Date.now() };

        // Append to the specific chat via functional update to prevent closure staleness
        onUpdateChats(prevChats => {
            return prevChats.map(c => {
                if (c.id !== targetChatId) return c;
                const updatedMessages = [...c.messages, userMsg, assistantMsg];
                const title = c.messages.length === 0 ? (text.slice(0, 40) || 'New Chat') : c.title;
                return { ...c, messages: updatedMessages, title };
            });
        });

        setInput('');
        setAttachments([]);
        setIsStreaming(true);

        // We need the current chat's history for the API call. Since state update is async,
        // we extract it from the current hook or reconstruct it manually.
        const currentChatObj = courseChats.find(c => c.id === targetChatId) || { messages: [] };
        const historyForApi = [...currentChatObj.messages, userMsg]; // Add the new user msg

        const systemPrompt = buildCourseSystemPrompt(text);
        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...historyForApi.map(m => ({ role: m.role, content: m.content }))
        ];

        try {
            await streamChat(
                apiMessages,
                apiKey,
                // onChunk
                (token) => {
                    onUpdateChats(prev => prev.map(c => {
                        if (c.id !== targetChatId) return c;
                        return {
                            ...c,
                            messages: c.messages.map(m =>
                                m.id === assistantMsg.id
                                    ? { ...m, content: stripReasoning(m.content + token) }
                                    : m
                            )
                        };
                    }));
                },
                // onDone
                () => {
                    setIsStreaming(false);
                },
                // onError
                (err) => {
                    onUpdateChats(prev => prev.map(c => {
                        if (c.id !== targetChatId) return c;
                        return {
                            ...c,
                            messages: c.messages.map(m =>
                                m.id === assistantMsg.id
                                    ? { ...m, content: 'Error: ' + err }
                                    : m
                            )
                        };
                    }));
                    setIsStreaming(false);
                },
                // options
                {}
            );
        } catch (e) {
            setIsStreaming(false);
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }

    // ---- Start chat about a topic ----
    function startTopicChat(topic) {
        setActiveTab('chat');
        const prompt = `I'm struggling with the topic "${topic.name}" that we covered in class. Can you help me understand it better? Here's what I know so far: ${topic.summary}`;
        createNewChat();
        setTimeout(() => {
            setInput(prompt);
            handleSend(prompt);
        }, 200);
    }

    // ---- RENDER ----
    return (
        <div className="course-hub">
            {/* Course Header */}
            <div className="course-hub-header">
                <button className="course-back-btn" onClick={onBack}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to Courses
                </button>
                <div className="course-hub-title">
                    <h2>{course.name}</h2>
                    <div className="course-hub-stats">
                        <span>{courseAssignments.length} assignments</span>
                        <span>&middot;</span>
                        <span>{courseTranscripts.length} transcripts</span>
                        <span>&middot;</span>
                        <span>{courseTopics.length} topics</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="course-hub-tabs">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`course-tab ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="tab-icon">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="course-hub-content">
                {/* ===== CHAT TAB ===== */}
                {activeTab === 'chat' && (
                    <div className="course-chat-layout">
                        {/* Chat List Sidebar */}
                        <div className="course-chat-sidebar">
                            <button className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>
                            <div className="course-chat-list">
                                {courseChats.map(chat => (
                                    <div
                                        key={chat.id}
                                        className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                                        onClick={() => setActiveChatId(chat.id)}
                                    >
                                        <span className="chat-title">{chat.title}</span>
                                        <button className="delete-btn" onClick={e => deleteChat(chat.id, e)}>×</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Chat Main */}
                        <div className="course-chat-main">
                            <div className="chat-area" ref={chatAreaRef}>
                                {messages.length === 0 ? (
                                    <div className="welcome-screen">
                                        {SchoolAILogo && <SchoolAILogo size={48} />}
                                        <h2>Chat with your {course.name} AI tutor</h2>
                                        <p>This AI has been trained on your class transcripts and assignments. Ask anything about what was covered in class.</p>
                                        {courseTopics.length > 0 && (
                                            <div className="topic-suggestions">
                                                <p>Quick topics:</p>
                                                <div className="suggestion-chips">
                                                    {courseTopics.slice(0, 4).map(t => (
                                                        <button key={t.id} className="suggestion-chip" onClick={() => startTopicChat(t)}>
                                                            {t.name}
                                                        </button>
                                                    ))}
                                                </div>
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
                                                        SchoolAILogo && <SchoolAILogo size={22} />
                                                    )}
                                                </div>
                                                <div className="message-content">
                                                    <div className="message-role-row">
                                                        <span className="message-role">{msg.role === 'user' ? 'You' : course.name + ' AI'}</span>
                                                    </div>
                                                    <MessageRenderer content={msg.content} isStreaming={isStreaming && i === messages.length - 1} />
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={chatEndRef} />
                                    </div>
                                )}
                            </div>

                            {/* Input */}
                            <div className="input-area">
                                <div className="input-row">
                                    <textarea
                                        ref={textareaRef}
                                        className="chat-input"
                                        placeholder={`Ask about ${course.name}...`}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        rows={1}
                                    />
                                    <button className="send-btn" onClick={() => handleSend()} disabled={isStreaming || (!input.trim() && attachments.length === 0)}>
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== TRANSCRIPTS TAB ===== */}
                {activeTab === 'transcripts' && (
                    <TranscriptManager
                        courseId={course.id}
                        courseName={course.name}
                        transcripts={courseTranscripts}
                        onUpdateTranscripts={onUpdateTranscripts}
                        apiKey={apiKey}
                        onTopicsExtracted={(newTopics) => {
                            onUpdateTopics(prev => {
                                const existing = new Set(prev.filter(t => t.courseId === course.id).map(t => t.name.toLowerCase()));
                                const toAdd = newTopics
                                    .filter(t => !existing.has(t.name.toLowerCase()))
                                    .map(t => ({ ...t, id: genId(), courseId: course.id }));
                                return [...prev, ...toAdd];
                            });
                        }}
                    />
                )}

                {/* ===== MIND MAP TAB ===== */}
                {activeTab === 'mindmap' && (
                    <TopicMindMap
                        topics={courseTopics}
                        transcripts={courseTranscripts}
                        assignments={courseAssignments}
                        courseName={course.name}
                        onStartChat={startTopicChat}
                        onUpdateTopics={onUpdateTopics}
                        courseId={course.id}
                    />
                )}

                {/* ===== ASSIGNMENTS TAB ===== */}
                {activeTab === 'assignments' && (
                    <div className="course-assignments">
                        <h3>Assignments for {course.name}</h3>
                        {courseAssignments.length === 0 ? (
                            <div className="panel-empty">
                                <p>No assignments found for this course.</p>
                            </div>
                        ) : (
                            <div className="assignment-list">
                                {courseAssignments.map((item, idx) => (
                                    <div key={`${item.id}-${idx}`} className={`assignment-card ${isDueOverdue(item.date) ? 'overdue' : ''}`}>
                                        <div className="assignment-name">{item.name}</div>
                                        {item.date && (
                                            <div className={`assignment-due ${isDueOverdue(item.date) ? 'overdue' : ''}`}>
                                                {formatDueDate(item.date)}
                                                {item.points_possible ? ` · ${item.points_possible} pts` : ''}
                                            </div>
                                        )}
                                        {item.description && item.description !== 'No description' && (
                                            <div className="assignment-desc">
                                                {item.description.slice(0, 200)}{item.description.length > 200 ? '…' : ''}
                                            </div>
                                        )}
                                        <button className="use-btn" onClick={() => {
                                            setActiveTab('chat');
                                            const prompt = `Help me with the assignment "${item.name}". ${item.description ? 'Here are the instructions: ' + item.description.slice(0, 500) : ''}`;
                                            createNewChat();
                                            setTimeout(() => handleSend(prompt), 200);
                                        }}>
                                            Get Help
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
