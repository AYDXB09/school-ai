import { useState, useRef, useMemo, useEffect } from 'react';
import { streamChat } from './api';
import { SYSTEM_PROMPT } from './systemPrompt';
import { parseCanvasDate, formatDueDate, isDueOverdue, selectCanvasContextItems } from './canvasApi';
import { deriveTopicMap, getPacedMaterialEntries, getTopicKey, groupAssignmentsByTimeline, refineTopicLabelsWithAI } from './courseWorkspace';
import { MessageRenderer } from './MessageRenderer';
import TranscriptManager from './TranscriptManager';
import TopicMindMap from './TopicMindMap';
import QuizView from './QuizView';

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

function getTopicLabel(topic) {
    return topic?.label || topic?.name || 'Topic';
}

function getSourceFocusId(type, id) {
    return `source-${type}-${String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function lectureKindLabel(kind) {
    if (kind === 'notes') return 'Notes';
    if (kind === 'recording') return 'Lecture Recording';
    if (kind === 'photo') return 'Photo Notes';
    if (kind === 'file') return 'Uploaded File';
    return 'Lecture Transcript';
}

function buildExcerpt(text, topicLabel = '') {
    const sourceText = String(text || '').trim();
    if (!sourceText) return '';
    const keywords = String(topicLabel || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2);

    for (const keyword of keywords) {
        const index = sourceText.toLowerCase().indexOf(keyword);
        if (index !== -1) {
            const start = Math.max(0, index - 100);
            const end = Math.min(sourceText.length, index + 220);
            return `${start > 0 ? '...' : ''}${sourceText.slice(start, end)}${end < sourceText.length ? '...' : ''}`;
        }
    }

    return sourceText.length > 220 ? `${sourceText.slice(0, 220)}...` : sourceText;
}

function buildSourceContext(entry, maxChars = 1600) {
    const sourceText = String(entry?.summary || entry?.text || entry?.content || '').trim();
    if (!sourceText) return '';
    return sourceText.length > maxChars ? `${sourceText.slice(0, maxChars)}...` : sourceText;
}

function getMasteryLabel(level) {
    if (level >= 4) return 'Mastered';
    if (level === 3) return 'Comfortable';
    if (level === 2) return 'Growing';
    return 'New';
}

function clampMasteryLevel(level) {
    return Math.max(1, Math.min(4, Math.round(level)));
}

function parseAssignmentPercent(assignment) {
    const score = Number(assignment?.score);
    const pointsPossible = Number(assignment?.points_possible);

    if (Number.isFinite(score) && Number.isFinite(pointsPossible) && pointsPossible > 0) {
        return Math.max(0, Math.min(100, (score / pointsPossible) * 100));
    }

    const gradeText = String(assignment?.grade ?? '').trim();
    if (!gradeText) return null;

    const slashMatch = gradeText.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/);
    if (slashMatch) {
        const earned = Number(slashMatch[1]);
        const possible = Number(slashMatch[2]);
        if (Number.isFinite(earned) && Number.isFinite(possible) && possible > 0) {
            return Math.max(0, Math.min(100, (earned / possible) * 100));
        }
    }

    const percentMatch = gradeText.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (percentMatch) {
        return Math.max(0, Math.min(100, Number(percentMatch[1])));
    }

    const numericGrade = Number(gradeText);
    if (Number.isFinite(numericGrade)) {
        if (Number.isFinite(pointsPossible) && pointsPossible > 0) {
            return Math.max(0, Math.min(100, (numericGrade / pointsPossible) * 100));
        }
        return Math.max(0, Math.min(100, numericGrade <= 1 ? numericGrade * 100 : numericGrade));
    }

    const letterGrade = gradeText.toUpperCase();
    const letterToPercent = {
        'A+': 98,
        A: 95,
        'A-': 91,
        'B+': 88,
        B: 85,
        'B-': 81,
        'C+': 78,
        C: 75,
        'C-': 71,
        'D+': 68,
        D: 65,
        'D-': 61,
        F: 55,
    };

    return letterToPercent[letterGrade] ?? null;
}

function deriveMasteryLevel(topic, selfAssessment) {
    if (Number.isFinite(selfAssessment) && selfAssessment >= 1) {
        return clampMasteryLevel(selfAssessment);
    }

    if (topic?.isRoot) return 3;

    let score = 0;
    score += Math.min(2, topic?.transcriptIds?.length || 0);
    score += Math.min(2, topic?.materialIds?.length || 0);
    score += Math.min(1, topic?.courseItemIds?.length || 0);

    const relatedAssignments = topic?.relatedAssignments || [];
    const performancePercents = relatedAssignments
        .map(parseAssignmentPercent)
        .filter(percent => Number.isFinite(percent));

    if (performancePercents.length > 0) {
        const averagePercent = performancePercents.reduce((sum, percent) => sum + percent, 0) / performancePercents.length;
        if (averagePercent >= 92) score += 3;
        else if (averagePercent >= 82) score += 2;
        else if (averagePercent >= 70) score += 1;
        else score -= 1;
    } else {
        score += Math.min(2, relatedAssignments.length || 0);
    }

    const missingCount = relatedAssignments.filter(item => item.missing).length;
    score -= missingCount * 1.5;

    if (score >= 6) return 4;
    if (score >= 4) return 3;
    if (score >= 2) return 2;
    return 1;
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
        case 'trash':
            return (
                <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
            );
        default: return null;
    }
};

const TABS = [
    { key: 'chat', label: 'Chat', icon: <HubIcon type="chat" /> },
    { key: 'transcripts', label: 'Lecture Content', icon: <HubIcon type="transcripts" /> },
    { key: 'mindmap', label: 'Mind Map', icon: <HubIcon type="mindmap" /> },
    { key: 'assignments', label: 'Assignments', icon: <HubIcon type="assignments" /> },
];

export default function CourseHub({
    course,
    canvasItems,
    allTranscripts,
    allMaterials,
    allTopics,
    topicAssessments,
    apiKey,
    onBack,
    onUpdateTranscripts,
    onUpdateMaterials,
    onUpdateTopics,
    onUpdateTopicAssessments,
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
    const [focusedSource, setFocusedSource] = useState(null);
    const [activeQuiz, setActiveQuiz] = useState(null);
    const [activeContextTopic, setActiveContextTopic] = useState(null);

    const chatEndRef = useRef(null);
    const chatAreaRef = useRef(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    // Filter canvas items for this specific course
    const courseAssignments = useMemo(() => {
        return (canvasItems || []).filter(item => {
            const matchesCourse = String(item?.course_id) === String(course.id) || item?.course_name === course.name;
            return matchesCourse && item.type === 'assignment';
        }).sort((a, b) => {
            const dA = parseCanvasDate(a.date);
            const dB = parseCanvasDate(b.date);
            if (!dA && !dB) return 0;
            if (!dA) return 1;
            if (!dB) return -1;
            return dA - dB;
        });
    }, [canvasItems, course.id, course.name]);

    const courseItems = useMemo(() => {
        const conceptEvidenceTypes = new Set(['announcement', 'page', 'file', 'course-item']);
        return (canvasItems || []).filter(item => {
            const matchesCourse = String(item?.course_id) === String(course.id) || item?.course_name === course.name;
            return matchesCourse && conceptEvidenceTypes.has(item?.type);
        }).sort((a, b) => {
            const dA = parseCanvasDate(a.date || a.posted_at);
            const dB = parseCanvasDate(b.date || b.posted_at);
            if (!dA && !dB) return 0;
            if (!dA) return 1;
            if (!dB) return -1;
            return dB - dA;
        });
    }, [canvasItems, course.id, course.name]);

    // Filter transcripts for this specific course
    const courseTranscripts = useMemo(() =>
        (allTranscripts || []).filter(t => String(t.courseId) === String(course.id)),
        [allTranscripts, course.id]
    );

    const courseMaterials = useMemo(() =>
        (allMaterials || []).filter(item => String(item.courseId) === String(course.id)),
        [allMaterials, course.id]
    );

    const pacedCourseMaterials = useMemo(() => (
        getPacedMaterialEntries(courseMaterials, courseAssignments)
    ), [courseMaterials, courseAssignments]);

    const assignmentBuckets = useMemo(() => (
        groupAssignmentsByTimeline(courseAssignments, new Date())
    ), [courseAssignments]);

    // Filter topics for this specific course
    const courseTopics = useMemo(() =>
        (allTopics || []).filter(t => String(t.courseId) === String(course.id)),
        [allTopics, course.id]
    );

    const courseConcepts = useMemo(() => {
        const derivedTopics = deriveTopicMap({
            courseName: course.name,
            transcriptEntries: courseTranscripts.map(entry => ({
                id: entry.id,
                title: `${lectureKindLabel(entry.kind)} · ${entry.date || ''}`,
                content: entry.text,
                date: entry.date,
            })),
            materialEntries: pacedCourseMaterials.map(entry => ({
                id: entry.id,
                kind: entry.kind || 'material',
                title: entry.title || (entry.kind === 'textbook' ? `${course.name} Textbook` : `${course.name} Class Material`),
                content: entry.text || entry.content || '',
                date: entry.date,
                pageReference: entry.pageReference || '',
            })),
            assignments: courseAssignments,
            courseItems,
            seedTopics: courseTopics,
        });

        return derivedTopics.map(topic => {
            if (topic.isRoot) {
                return {
                    ...topic,
                    name: getTopicLabel(topic),
                    assessmentKey: null,
                    selfAssessment: null,
                    masteryLevel: 3,
                    masteryLabel: 'Course Overview',
                };
            }

            const assessmentKey = `${course.id}:${getTopicKey(topic)}`;
            const rawAssessment = Number(topicAssessments?.[assessmentKey]);
            const selfAssessment = Number.isFinite(rawAssessment) && rawAssessment > 0 ? rawAssessment : null;
            const masteryLevel = deriveMasteryLevel(topic, selfAssessment);
            return {
                ...topic,
                name: getTopicLabel(topic),
                assessmentKey,
                selfAssessment,
                masteryLevel,
                masteryLabel: getMasteryLabel(masteryLevel),
            };
        });
    }, [course.name, course.id, courseAssignments, courseItems, courseTopics, courseTranscripts, pacedCourseMaterials, topicAssessments]);

    const rootCourseConcept = useMemo(
        () => courseConcepts.find(topic => topic.isRoot) || null,
        [courseConcepts],
    );

    const nonRootCourseConcepts = useMemo(
        () => courseConcepts.filter(topic => !topic.isRoot),
        [courseConcepts],
    );

    // K2 AI verification of concept labels (non-blocking, runs in background)
    const [aiRefinedConcepts, setAiRefinedConcepts] = useState(null);
    useEffect(() => {
        if (!apiKey || courseConcepts.length <= 1) return;
        let cancelled = false;
        refineTopicLabelsWithAI(courseConcepts, course.name, apiKey).then(renameMap => {
            if (cancelled || renameMap.size === 0) return;
            setAiRefinedConcepts(prev => {
                const updated = courseConcepts.map(topic => {
                    if (topic.isRoot) return topic;
                    const newLabel = renameMap.get(topic.label);
                    if (!newLabel) return topic;
                    if (newLabel === 'REMOVE') return null;
                    return { ...topic, label: newLabel, name: newLabel };
                }).filter(Boolean);
                return updated;
            });
        });
        return () => { cancelled = true; };
    }, [courseConcepts, course.name, apiKey]);

    const finalConcepts = aiRefinedConcepts || courseConcepts;
    const finalNonRoot = useMemo(() => finalConcepts.filter(t => !t.isRoot), [finalConcepts]);
    const finalRoot = useMemo(() => finalConcepts.find(t => t.isRoot) || null, [finalConcepts]);

    const activeChat = courseChats.find(c => c.id === activeChatId);
    const messages = activeChat?.messages || [];

    // Auto-scroll
    useEffect(() => {
        if (chatAreaRef.current) chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }, [courseChats, activeChatId]);

    useEffect(() => {
        if (courseChats.length === 0) {
            if (activeChatId !== null) setActiveChatId(null);
            return;
        }

        if (!courseChats.some(chat => chat.id === activeChatId)) {
            setActiveChatId(courseChats[0].id);
        }
    }, [course.id, courseChats, activeChatId]);

    useEffect(() => {
        if (activeTab !== 'assignments' || focusedSource?.type !== 'assignment') return undefined;

        const target = document.getElementById(getSourceFocusId('assignment', focusedSource.id));
        if (!target) return undefined;

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('source-focused');
        const timer = window.setTimeout(() => target.classList.remove('source-focused'), 1800);
        return () => window.clearTimeout(timer);
    }, [activeTab, focusedSource, assignmentBuckets]);

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
You have been trained on the student's lecture content, including class transcripts and study notes.
When helping the student, reference what was taught in class using the lecture content below.
Emulate the teacher's style, vocabulary, and approach as closely as possible.
Always connect your answers back to what was covered in the lecture content when relevant.`;

        // Inject lecture content
        if (courseTranscripts.length > 0) {
            const transcriptContext = courseTranscripts
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 10)
                .map(t => {
                    const dateStr = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const text = buildSourceContext(t, 2000);
                    const label = lectureKindLabel(t.kind);
                    return `### ${label} on ${dateStr}\n${text}`;
                })
                .join('\n\n');
            prompt += `\n\n## LECTURE CONTENT (Class transcripts, recordings, and notes)\n${transcriptContext}`;
        }

        if (pacedCourseMaterials.length > 0) {
            const materialContext = pacedCourseMaterials
                .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))
                .slice(0, 8)
                .map(item => {
                    const label = item.kind === 'textbook' ? 'Textbook' : 'Class Material';
                    const title = item.title || `${courseName} ${label}`;
                    const pages = item.pageReference ? ` (Pages ${item.pageReference})` : '';
                    const text = buildSourceContext(item, 1600);
                    return `### ${label}: ${title}${pages}\n${text}`;
                })
                .join('\n\n');
            prompt += `\n\n## TEXTBOOK & CLASS MATERIALS\n${materialContext}`;
        }

        // Inject extracted topics
        if (finalRoot?.summary) {
            prompt += `\n\n## COURSE CONCEPT MAP OVERVIEW\n${finalRoot.summary}`;
        }

        if (finalNonRoot.length > 0) {
            const conceptOverview = finalNonRoot
                .slice(0, 6)
                .map(item => `- ${getTopicLabel(item)} (${item.masteryLabel}): ${item.summary}`)
                .join('\n');
            prompt += `\n\n## KEY TOPICS COVERED IN CLASS\n${conceptOverview}`;
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
        let text = (forcedInput ?? input).trim();
        if ((!text && attachments.length === 0) || isStreaming) return;

        if (activeContextTopic) {
            const topicLabel = getTopicLabel(activeContextTopic);
            text += `\n\n[CONTEXT INSTRUCTION: The user is asking questions specifically about the concept "${topicLabel}". Tailor your response strictly to this topic and the current course material unless they ask otherwise.]`;
        }

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
                (token) => {
                    onUpdateChats(prev => prev.map(c => {
                        if (c.id !== targetChatId) return c;
                        return {
                            ...c,
                            messages: c.messages.map(m =>
                                m.id === assistantMsg.id
                                    ? { ...m, content: m.content + token }
                                    : m
                            )
                        };
                    }));
                },
                () => {
                    setIsStreaming(false);
                },
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
        const topicLabel = getTopicLabel(topic);

        if (topic?.isRoot) {
            setActiveContextTopic(topic);
            return;
        }

        setActiveContextTopic(topic);
        const transcriptContext = courseTranscripts
            .filter(entry => (topic.transcriptIds || []).includes(entry.id))
            .slice(0, 3)
            .map(entry => {
                const dateLabel = entry.date ? new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Class note';
                return `- ${lectureKindLabel(entry.kind)} (${dateLabel}): ${buildExcerpt(entry.summary || entry.text, topicLabel)}`;
            })
            .join('\n');
        const materialContext = pacedCourseMaterials
            .filter(entry => (topic.materialIds || []).includes(entry.id))
            .slice(0, 3)
            .map(entry => {
                const title = entry.title || (entry.kind === 'textbook' ? `${course.name} Textbook` : `${course.name} Material`);
                const pages = entry.pageReference ? ` (Pages ${entry.pageReference})` : '';
                return `- ${title}${pages}: ${buildExcerpt(entry.summary || entry.text || entry.content, topicLabel)}`;
            })
            .join('\n');
        const assignmentContext = (topic.relatedAssignments || [])
            .slice(0, 4)
            .map(assignment => {
                const fullAssignment = courseAssignments.find(item => String(item.id) === String(assignment.id)) || assignment;
                const dueLabel = fullAssignment.date ? new Date(fullAssignment.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No due date';
                const desc = (fullAssignment.description || '').slice(0, 240);
                return `- ${fullAssignment.name} (Due ${dueLabel})${desc ? `: ${desc}${desc.length >= 240 ? '...' : ''}` : ''}`;
            })
            .join('\n');

        const prompt = `Help me understand the concept "${topicLabel}" in ${course.name}.\n\nConcept summary: ${topic.summary}\nCurrent comfort level: ${topic.masteryLabel}.\n\nAssignments linked to this concept:\n${assignmentContext || '- No linked assignments yet.'}\n\nTextbook / class material references:\n${materialContext || '- No textbook or material excerpts linked yet.'}\n\nWhat the teacher explained in class:\n${transcriptContext || '- No lecture excerpt linked yet.'}\n\nPlease explain this the way my teacher does, point me to the most important references, and tell me what to study first.`;
        createNewChat();
        setTimeout(() => {
            handleSend(prompt);
        }, 200);
    }

    function openLinkedSource(source) {
        if (!source?.type || source.id == null) return;
        setFocusedSource(source);
        setActiveTab(source.type === 'assignment' ? 'assignments' : 'transcripts');
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
                        <span>{courseTranscripts.length} lecture items</span>
                        <span>&middot;</span>
                        <span>{courseMaterials.length} materials</span>
                        <span>&middot;</span>
                        <span>{finalNonRoot.length} concepts</span>
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
            <div className={`course-hub-content ${activeTab === 'mindmap' ? 'mindmap-tab-active' : ''}`}>
                {/* ===== CHAT TAB ===== */}
                {activeTab === 'chat' && (
                    <div className="course-chat-layout">
                        {/* Chat List Sidebar */}
                        <div className="course-chat-sidebar">
                            <button type="button" className="new-chat-btn" onClick={createNewChat}>+ New Chat</button>
                            <div className="chat-history-list course-chat-list">
                                {courseChats.map(chat => (
                                    <div
                                        key={chat.id}
                                        className={`chat-history-item ${chat.id === activeChatId ? 'active' : ''}`}
                                        onClick={() => setActiveChatId(chat.id)}
                                    >
                                        <span className="chat-title">{chat.title?.trim() || 'New Chat'}</span>
                                        <button
                                            type="button"
                                            className="delete-btn"
                                            aria-label={`Delete ${chat.title?.trim() || 'chat'}`}
                                            title="Delete chat"
                                            onClick={e => deleteChat(chat.id, e)}
                                        >
                                            <HubIcon type="trash" size={14} />
                                        </button>
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
                                        <h2>Chat with your {course.name} Lumina tutor</h2>
                                        <p>This AI uses your lecture content, class notes, and assignments so it can help the way your teacher teaches.</p>
                                        {finalNonRoot.length > 0 && (
                                            <div className="topic-suggestions">
                                                <p>Quick topics:</p>
                                                <div className="suggestion-chips">
                                                    {finalNonRoot.slice(0, 4).map(t => (
                                                        <button key={t.id} className="suggestion-chip" onClick={() => startTopicChat(t)}>
                                                            {getTopicLabel(t)}
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
                                                    <div className="message-text">
                                                        <MessageRenderer
                                                            content={msg.content}
                                                            isStreaming={isStreaming && i === messages.length - 1}
                                                            onStartQuiz={(quizParams) => setActiveQuiz(quizParams)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={chatEndRef} />
                                    </div>
                                )}
                            </div>

                            {/* Input */}
                            <div className="input-area">
                                {activeContextTopic && (
                                    <div className="transcript-pill" style={{ background: 'rgba(96, 165, 250, 0.15)', color: '#60A5FA', border: '1px solid rgba(96, 165, 250, 0.3)', marginBottom: '8px', padding: '6px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
                                        <span style={{ fontSize: '13px' }}>Focusing on: <strong>{getTopicLabel(activeContextTopic)}</strong></span>
                                        <button onClick={() => setActiveContextTopic(null)} style={{ background: 'none', border: 'none', color: '#60A5FA', cursor: 'pointer', padding: 0, display: 'flex' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        </button>
                                    </div>
                                )}
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
                        materials={courseMaterials}
                        focusedItem={focusedSource}
                        onUpdateTranscripts={onUpdateTranscripts}
                        onUpdateMaterials={onUpdateMaterials}
                        apiKey={apiKey}
                        onTopicsExtracted={(newTopics) => {
                            onUpdateTopics(prev => {
                                const existing = new Set(prev.filter(t => String(t.courseId) === String(course.id)).map(t => getTopicKey(t)));
                                const toAdd = [];
                                newTopics.forEach(topic => {
                                    const normalized = { ...topic, name: topic.name || topic.label, label: topic.label || topic.name };
                                    const key = getTopicKey(normalized);
                                    if (existing.has(key)) return;
                                    existing.add(key);
                                    toAdd.push({ ...normalized, id: genId(), courseId: course.id });
                                });
                                return [...prev, ...toAdd];
                            });
                        }}
                    />
                )}

                {/* ===== MIND MAP TAB ===== */}
                {activeTab === 'mindmap' && (
                    <TopicMindMap
                        topics={finalConcepts}
                        transcripts={courseTranscripts}
                        materials={pacedCourseMaterials}
                        courseItems={courseItems}
                        assignments={courseAssignments}
                        courseName={course.name}
                        onStartChat={startTopicChat}
                        onOpenSource={openLinkedSource}
                        onUpdateTopics={onUpdateTopics}
                        onUpdateAssessments={onUpdateTopicAssessments}
                        courseId={course.id}
                    />
                )}

                {/* ===== ASSIGNMENTS TAB ===== */}
                {activeTab === 'assignments' && (
                    <div className="course-assignments">
                        <h3>Assignments for {course.name}</h3>
                        <p className="assignment-bucket-copy">Grouped by what is due this week, what just happened last week, and what is coming next.</p>
                        {courseAssignments.length === 0 ? (
                            <div className="panel-empty">
                                <p>No assignments found for this course.</p>
                            </div>
                        ) : (
                            assignmentBuckets.map(bucket => (
                                <section key={bucket.key} className="assignment-bucket">
                                    <div className="assignment-bucket-header">
                                        <h4>{bucket.label}</h4>
                                        <span className="assignment-bucket-count">{bucket.items.length}</span>
                                    </div>
                                    <div className="assignment-list">
                                        {bucket.items.map((item, idx) => (
                                            <div
                                                key={`${item.id}-${idx}`}
                                                id={getSourceFocusId('assignment', item.id)}
                                                className={`assignment-card ${isDueOverdue(item.date) ? 'overdue' : ''}`}
                                            >
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
                                </section>
                            ))
                        )}
                    </div>
                )}
            </div>

            {activeQuiz && (
                <QuizView
                    topic={activeQuiz.topic}
                    count={activeQuiz.count}
                    courseName={course.name}
                    transcripts={courseTranscripts}
                    apiKey={apiKey}
                    onClose={() => setActiveQuiz(null)}
                />
            )}
        </div>
    );
}
