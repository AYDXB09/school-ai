import { useEffect, useMemo, useRef, useState } from 'react';
import { buildContent, extractPdfText, streamChat } from './api';
import {
    buildFallbackSummary,
    normalizeSummaryText,
    sanitizeSmartSummary,
    stripModelFormatting,
} from './smartSummary';

// ============================================================
// TRANSCRIPT MANAGER — per-course transcript upload & list
// ============================================================

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export default function TranscriptManager({
    courseId,
    courseName,
    transcripts,
    materials,
    focusedItem,
    onUpdateTranscripts,
    onUpdateMaterials,
    apiKey,
    onTopicsExtracted,
}) {
    const [newText, setNewText] = useState('');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const [entryGroup, setEntryGroup] = useState('lecture');
    const [contentKind, setContentKind] = useState('notes');
    const [draftTitle, setDraftTitle] = useState('');
    const [referencePages, setReferencePages] = useState('');
    const [isExtracting, setIsExtracting] = useState(false);
    const [isImportingFile, setIsImportingFile] = useState(false);
    const [isTranscribingPhotos, setIsTranscribingPhotos] = useState(false);
    const [isRecordingLecture, setIsRecordingLecture] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [progressValue, setProgressValue] = useState(0);
    const [rawVisibleIds, setRawVisibleIds] = useState({});

    const textFileInputRef = useRef(null);
    const photoInputRef = useRef(null);
    const recognitionRef = useRef(null);
    const recordingTimeoutRef = useRef(null);
    const recordingBaseTextRef = useRef('');
    const recordedLectureTextRef = useRef('');
    const recordingActiveRef = useRef(false);
    const manualStopRef = useRef(false);

    const sanitizedTranscripts = useMemo(
        () => (transcripts || []).map(entry => sanitizeStoredEntry(entry)),
        [transcripts],
    );
    const sanitizedMaterials = useMemo(
        () => (materials || []).map(entry => sanitizeStoredEntry(entry)),
        [materials],
    );
    const sortedTranscripts = [...sanitizedTranscripts].sort((a, b) => new Date(b.date) - new Date(a.date));
    const sortedMaterials = [...sanitizedMaterials].sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
    const isBusy = isExtracting || isImportingFile || isTranscribingPhotos;
    const cachedSummaryMap = useMemo(() => {
        const map = new Map();
        [...sanitizedTranscripts, ...sanitizedMaterials].forEach(entry => {
            const sourceText = normalizeSummaryText(entry?.text || entry?.content || '');
            const summary = String(entry?.summary || '').trim();
            if (sourceText && summary && !map.has(sourceText)) {
                map.set(sourceText, summary);
            }
        });
        return map;
    }, [sanitizedMaterials, sanitizedTranscripts]);

    useEffect(() => {
        if (!focusedItem?.type || focusedItem.id == null) return undefined;
        if (!['transcript', 'material'].includes(focusedItem.type)) return undefined;

        const nextExpandedId = focusedItem.type === 'transcript'
            ? `lecture:${focusedItem.id}`
            : `material:${focusedItem.id}`;
        setExpandedId(nextExpandedId);

        const timer = window.setTimeout(() => {
            const target = document.getElementById(getSourceFocusId(focusedItem.type, focusedItem.id));
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('source-focused');
            window.setTimeout(() => target.classList.remove('source-focused'), 1800);
        }, 50);

        return () => window.clearTimeout(timer);
    }, [focusedItem, sortedTranscripts.length, sortedMaterials.length]);

    useEffect(() => {
        return () => {
            manualStopRef.current = true;
            recordingActiveRef.current = false;
            if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
            recognitionRef.current?.stop?.();
        };
    }, []);

    useEffect(() => {
        onUpdateTranscripts(prev => repairStoredEntries(prev));
        onUpdateMaterials(prev => repairStoredEntries(prev));
    }, [onUpdateMaterials, onUpdateTranscripts]);

    function appendToDraft(text, heading = '') {
        const cleaned = text?.trim();
        if (!cleaned) return;
        const block = heading ? `[${heading}]\n${cleaned}` : cleaned;
        setNewText(prev => [prev.trim(), block].filter(Boolean).join('\n\n'));
    }

    function getSavedKind(kind) {
        if (kind === 'notes') return 'notes';
        if (kind === 'recording') return 'recording';
        if (kind === 'photo') return 'photo';
        if (kind === 'file') return 'file';
        return 'transcript';
    }

    function kindLabel(kind) {
        if (kind === 'notes') return 'Notes';
        if (kind === 'recording') return 'Recording';
        if (kind === 'photo') return 'Photo Notes';
        if (kind === 'file') return 'File Upload';
        return 'Transcript';
    }

    function entryGroupLabel(kind) {
        if (kind === 'textbook') return 'Textbook';
        if (kind === 'material') return 'Class Material';
        return 'Lecture Content';
    }

    function buildDefaultTitle() {
        if (draftTitle.trim()) return draftTitle.trim();
        const firstLine = newText
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(Boolean);

        if (firstLine && firstLine.length <= 80) return firstLine;
        if (entryGroup === 'textbook') return `${courseName} Textbook Excerpt`;
        if (entryGroup === 'material') return `${courseName} Class Material`;
        return `${courseName} Lecture Content`;
    }

    function sanitizeStoredEntry(entry) {
        const sourceText = entry?.text || entry?.content || '';
        const fallbackSummary = buildFallbackSummary(sourceText);
        const summary = sanitizeSmartSummary(entry?.summary, fallbackSummary);
        if (summary === String(entry?.summary || '').trim()) return entry;
        return { ...entry, summary };
    }

    function repairStoredEntries(entries = []) {
        let changed = false;
        const nextEntries = (entries || []).map(entry => {
            const nextEntry = sanitizeStoredEntry(entry);
            if (nextEntry !== entry) changed = true;
            return nextEntry;
        });
        return changed ? nextEntries : entries;
    }

    function updateProgress(message, value) {
        setStatusMessage(message);
        setProgressValue(Math.max(0, Math.min(100, Math.round(value))));
    }

    function clearProgress() {
        setProgressValue(0);
    }

    function toggleRawContent(cardId) {
        setRawVisibleIds(prev => ({
            ...prev,
            [cardId]: !prev[cardId],
        }));
    }

    async function generateSmartSummary(text, { title = '', contentLabel = 'course content' } = {}) {
        const normalized = normalizeSummaryText(text);
        if (!normalized) return '';

        const cached = cachedSummaryMap.get(normalized);
        if (cached) return cached;

        const fallback = buildFallbackSummary(text);
        if (!apiKey) return fallback;

        try {
            const summaryInput = splitLongText(text, 7000).slice(0, 2).join('\n\n');
            let fullResponse = '';
            let errorMessage = '';

            await streamChat(
                [
                    {
                        role: 'system',
                        content: 'You turn course content into concise smart study notes. Return plain text only. Never mention the prompt, the user, or your reasoning. Do not include analysis, thinking, or labels like "Summary:". Keep it grounded in the source, highlight the most important ideas, vocabulary, steps, and likely quiz-worthy takeaways, and keep it under 170 words.',
                    },
                    {
                        role: 'user',
                        content: `Summarize this ${contentLabel} for ${courseName}. Title: ${title || 'Untitled'}\n\n${summaryInput}`,
                    },
                ],
                apiKey,
                token => { fullResponse += token; },
                () => {},
                (err) => { errorMessage = err; },
            );

            if (errorMessage) throw new Error(errorMessage);
            const cleaned = sanitizeSmartSummary(fullResponse, fallback);
            return cleaned || fallback;
        } catch (error) {
            console.error('Failed to summarize course content:', error);
            return fallback;
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function looksBinary(text) {
        const sample = (text || '').slice(0, 2000);
        if (!sample) return false;
        let bad = 0;
        for (let i = 0; i < sample.length; i += 1) {
            const code = sample.charCodeAt(i);
            if (code === 65533 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) bad += 1;
        }
        return bad / sample.length > 0.05;
    }

    function getSourceFocusId(type, id) {
        return `source-${type}-${String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }

    function splitLongText(text, maxChars = 9000) {
        const normalized = String(text || '').trim();
        if (!normalized) return [];

        const chunks = [];
        let remaining = normalized;
        while (remaining.length > maxChars) {
            let cut = Math.max(
                remaining.lastIndexOf('\n\n', maxChars),
                remaining.lastIndexOf('. ', maxChars),
                remaining.lastIndexOf(' ', maxChars),
            );
            if (cut < Math.floor(maxChars * 0.6)) cut = maxChars;
            chunks.push(remaining.slice(0, cut).trim());
            remaining = remaining.slice(cut).trim();
        }

        if (remaining) chunks.push(remaining);
        return chunks.filter(Boolean);
    }

    function splitTextbookSections(text, baseTitle) {
        const lines = String(text || '').split(/\r?\n/);
        const headingRegex = /^(chapter|unit|module|lesson|section|topic)\s+[0-9a-z.-]+.*$/i;
        const rawSections = [];
        let currentTitle = baseTitle;
        let buffer = [];

        function pushSection() {
            const sectionText = buffer.join('\n').trim();
            if (!sectionText) return;
            rawSections.push({ title: currentTitle, text: sectionText });
            buffer = [];
        }

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (headingRegex.test(line)) {
                if (buffer.join('\n').trim().length >= 500) pushSection();
                currentTitle = line || baseTitle;
            }
            buffer.push(rawLine);
        }
        pushSection();

        const sections = rawSections.length > 1
            ? rawSections
            : [{ title: baseTitle, text: String(text || '').trim() }];

        return sections.flatMap(section => {
            const chunks = splitLongText(section.text, 9000);
            return chunks.map((chunk, index) => ({
                title: chunks.length > 1 ? `${section.title} · Part ${index + 1}` : section.title,
                text: chunk,
            }));
        });
    }

    function buildMaterialEntries(savedText, savedKind) {
        const baseTitle = buildDefaultTitle();
        const sections = entryGroup === 'textbook'
            ? splitTextbookSections(savedText, baseTitle)
            : splitLongText(savedText, 12000).map((chunk, index, chunks) => ({
                title: chunks.length > 1 ? `${baseTitle} · Part ${index + 1}` : baseTitle,
                text: chunk,
            }));

        return sections.map(section => ({
            id: genId(),
            courseId,
            date: newDate,
            title: section.title,
            text: section.text,
            kind: entryGroup,
            sourceKind: savedKind,
            pageReference: referencePages.trim(),
            createdAt: Date.now(),
        }));
    }

    function composeRecordingDraft(finalText = '', interimText = '') {
        const recordingText = [finalText.trim(), interimText.trim()].filter(Boolean).join(' ').trim();
        return [recordingBaseTextRef.current.trim(), recordingText].filter(Boolean).join('\n\n');
    }

    function stopLectureRecording(reason = 'Lecture recording stopped. Review and save the text below.') {
        manualStopRef.current = true;
        recordingActiveRef.current = false;
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        recognitionRef.current?.stop?.();
        recognitionRef.current = null;
        setIsRecordingLecture(false);
        setStatusMessage(reason);
        setContentKind('recording');
        setNewText(composeRecordingDraft(recordedLectureTextRef.current));
    }

    function startRecognitionSession() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setStatusMessage('Lecture recording transcription needs Chrome speech recognition.');
            return;
        }

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let finalChunk = '';
            let interimChunk = '';

            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const piece = event.results[i][0]?.transcript || '';
                if (event.results[i].isFinal) finalChunk += piece + ' ';
                else interimChunk += piece;
            }

            if (finalChunk.trim()) {
                recordedLectureTextRef.current = `${recordedLectureTextRef.current} ${finalChunk}`.trim();
            }

            setNewText(composeRecordingDraft(recordedLectureTextRef.current, interimChunk));
        };

        recognition.onerror = (event) => {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                stopLectureRecording('Microphone access was blocked. Allow microphone access to transcribe your lecture.');
                return;
            }
            setStatusMessage(`Lecture transcription issue: ${event.error || 'unknown error'}. Trying to continue...`);
        };

        recognition.onend = () => {
            recognitionRef.current = null;
            if (recordingActiveRef.current && !manualStopRef.current) {
                startRecognitionSession();
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
    }

    function toggleLectureRecording() {
        if (isRecordingLecture) {
            stopLectureRecording();
            return;
        }

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setStatusMessage('Lecture recording transcription needs Chrome speech recognition.');
            return;
        }

        manualStopRef.current = false;
        recordingActiveRef.current = true;
        recordingBaseTextRef.current = newText.trim();
        recordedLectureTextRef.current = '';
        setContentKind('recording');
        setIsRecordingLecture(true);
        setStatusMessage('Recording lecture now. The transcript will appear live below for up to 40 minutes.');

        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = window.setTimeout(() => {
            stopLectureRecording('Lecture recording reached the 40-minute limit. Review the transcript below and save it.');
        }, 40 * 60 * 1000);

        startRecognitionSession();
    }

    async function extractTopics(text) {
        if (!apiKey || !text.trim()) return [];

        try {
            const systemPrompt = `You are a curriculum analysis AI. Extract the key topics and concepts taught in the following lecture content.
Return ONLY a valid JSON array of objects, each with "name" (short topic title, 2-5 words) and "summary" (1-2 sentence description of what was taught).
Example: [{"name": "Derivatives", "summary": "Introduction to derivatives as rates of change, including the power rule and chain rule."}]
Do NOT include any text outside the JSON array. Respond with ONLY the JSON array.`;

            const slices = splitLongText(text, 6000).slice(0, 6);
            const collectedTopics = [];

            for (const slice of slices) {
                let fullResponse = '';
                let errorMessage = '';
                await streamChat(
                    [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Extract topics from this lecture content:\n\n${slice}` }
                    ],
                    apiKey,
                    (token) => { fullResponse += token; },
                    () => { },
                    (err) => { errorMessage = err; }
                );

                if (errorMessage) throw new Error(errorMessage);

                let cleaned = stripModelFormatting(fullResponse);
                const startIdx = cleaned.indexOf('[');
                const endIdx = cleaned.lastIndexOf(']');
                if (startIdx !== -1 && endIdx !== -1) cleaned = cleaned.substring(startIdx, endIdx + 1);

                const topics = JSON.parse(cleaned);
                if (Array.isArray(topics)) collectedTopics.push(...topics);
            }

            const deduped = [];
            const seen = new Set();
            collectedTopics.forEach((topic) => {
                const key = String(topic?.name || topic?.label || '').trim().toLowerCase();
                if (!key || seen.has(key)) return;
                seen.add(key);
                deduped.push(topic);
            });
            return deduped;
        } catch (e) {
            console.error('Failed to extract topics:', e);
            return [];
        }
    }

    async function handleTextFileImport(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        setIsImportingFile(true);
        updateProgress(`Importing ${files.length} ${entryGroup === 'textbook' ? 'textbook' : 'study'} file${files.length > 1 ? 's' : ''}...`, 8);

        try {
            const importedBlocks = [];
            for (const [index, file] of files.entries()) {
                updateProgress(`Reading ${file.name}...`, 15 + Math.round((index / files.length) * 55));
                if (/\.pdf$/i.test(file.name || '')) {
                    updateProgress(`Extracting text from ${file.name}...`, 30 + Math.round((index / files.length) * 35));
                    const extracted = await extractPdfText(file);
                    importedBlocks.push({
                        name: `${file.name}${extracted.page_count ? ` (${extracted.page_count} pages)` : ''}`,
                        text: String(extracted.text || '').trim(),
                    });
                    continue;
                }

                if (/\.(doc|docx)$/i.test(file.name || '')) {
                    throw new Error(`${file.name} is not supported yet. Use PDF, .txt, .md, .html, or .rtf instead.`);
                }

                const text = await file.text();
                if (!text.trim()) continue;
                if (looksBinary(text)) {
                    throw new Error(`${file.name} is not readable text. Try PDF, a .txt/.md export, or upload note photos instead.`);
                }
                importedBlocks.push({ name: file.name, text: text.trim() });
                updateProgress(`Imported ${index + 1} of ${files.length} files...`, 35 + Math.round(((index + 1) / files.length) * 45));
            }

            if (importedBlocks.length === 0) {
                setStatusMessage('No readable text was found in that file.');
                return;
            }

            importedBlocks.forEach(block => appendToDraft(block.text, `Imported from ${block.name}`));
            setContentKind('file');
            updateProgress(`Added ${importedBlocks.length} file${importedBlocks.length > 1 ? 's' : ''} into the editor.`, 100);
            setStatusMessage(`Added ${importedBlocks.length} file${importedBlocks.length > 1 ? 's' : ''} into the editor.`);
        } catch (error) {
            setStatusMessage(error.message || 'Could not read that file.');
        } finally {
            setIsImportingFile(false);
            clearProgress();
            event.target.value = '';
        }
    }

    async function handlePhotoImport(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        if (!apiKey) {
            setStatusMessage('Add your API key before transcribing note photos.');
            event.target.value = '';
            return;
        }

        setIsTranscribingPhotos(true);
        updateProgress(`Transcribing ${files.length} note photo${files.length > 1 ? 's' : ''}...`, 10);

        try {
            const attachments = await Promise.all(files.map(async (file) => ({
                id: genId(),
                name: file.name,
                type: 'image',
                base64: await fileToBase64(file),
                mimeType: file.type || 'image/png',
            })));
            updateProgress('Running OCR on your note photos...', 35);

            let fullResponse = '';
            let errorMessage = '';
            await streamChat(
                [
                    { role: 'system', content: 'You transcribe lecture note photos into clean plain text. Preserve headings, bullet points, equations, and order. Return plain text only.' },
                    {
                        role: 'user',
                        content: buildContent(
                            `Transcribe these notes for ${courseName}. Merge all pages into one clean set of text. If text is unclear, make the best faithful transcription you can and do not invent extra content.`,
                            attachments
                        )
                    }
                ],
                apiKey,
                (token) => { fullResponse += token; },
                () => { },
                (err) => { errorMessage = err; }
            );

            if (errorMessage) throw new Error(errorMessage);

            updateProgress('Cleaning the transcribed notes...', 80);
            const cleaned = stripModelFormatting(fullResponse);
            if (!cleaned) throw new Error('The photo transcription came back empty.');

            appendToDraft(cleaned, `Transcribed from ${files.length} photo${files.length > 1 ? 's' : ''}`);
            setContentKind('photo');
            updateProgress(`Transcribed ${files.length} photo${files.length > 1 ? 's' : ''} into your draft.`, 100);
            setStatusMessage(`Transcribed ${files.length} photo${files.length > 1 ? 's' : ''} into your draft.`);
        } catch (error) {
            setStatusMessage(error.message || 'Could not transcribe those photos.');
        } finally {
            setIsTranscribingPhotos(false);
            clearProgress();
            event.target.value = '';
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!newText.trim()) return;

        const savedKind = getSavedKind(contentKind);
        const savedText = newText.trim();
        const saveTitle = buildDefaultTitle();
        let sourceLink = null;
        let savedMaterialEntries = [];
        let topics = [];
        setIsExtracting(true);
        updateProgress(
            entryGroup === 'lecture'
                ? 'Generating smart notes and extracting concepts...'
                : `Generating smart notes for your ${entryGroupLabel(entryGroup).toLowerCase()}...`,
            10,
        );

        try {
            if (entryGroup === 'lecture') {
                const transcriptId = genId();
                const [summary, extractedTopics] = await Promise.all([
                    generateSmartSummary(savedText, {
                        title: saveTitle,
                        contentLabel: contentKind === 'notes' ? 'lecture notes' : 'lecture transcript',
                    }),
                    extractTopics(savedText),
                ]);
                updateProgress('Saving lecture content...', 78);

                const transcript = {
                    id: transcriptId,
                    courseId,
                    date: newDate,
                    text: savedText,
                    kind: savedKind,
                    summary,
                    createdAt: Date.now(),
                };

                onUpdateTranscripts(prev => [...prev, transcript]);
                sourceLink = { sourceTranscriptId: transcript.id };
                topics = extractedTopics;
            } else {
                const draftEntries = buildMaterialEntries(savedText, savedKind);
                const localSummaryCache = new Map();
                savedMaterialEntries = [];

                for (const [index, entry] of draftEntries.entries()) {
                    updateProgress(
                        `Creating smart notes for section ${index + 1} of ${draftEntries.length}...`,
                        22 + Math.round((index / Math.max(draftEntries.length, 1)) * 56),
                    );
                    const sourceText = entry.text || entry.content || '';
                    const normalized = normalizeSummaryText(sourceText);
                    const cached = localSummaryCache.get(normalized) || cachedSummaryMap.get(normalized);
                    const summary = cached
                        || (apiKey && index < 6
                            ? await generateSmartSummary(sourceText, {
                                title: entry.title,
                                contentLabel: entry.kind === 'textbook' ? 'textbook section' : 'class material',
                            })
                            : buildFallbackSummary(sourceText));

                    if (normalized && summary) localSummaryCache.set(normalized, summary);
                    savedMaterialEntries.push({ ...entry, summary: sanitizeSmartSummary(summary, buildFallbackSummary(sourceText)) });
                }

                updateProgress(`Saving ${entryGroupLabel(entryGroup).toLowerCase()}...`, 84);
                onUpdateMaterials(prev => [...prev, ...savedMaterialEntries]);
            }

            if (topics.length > 0 && onTopicsExtracted) {
                onTopicsExtracted(topics.map(t => ({
                    ...t,
                    ...sourceLink,
                    sourceDate: newDate,
                })));
            }

            updateProgress('Finishing save...', 100);
            setNewText('');
            setNewDate(new Date().toISOString().split('T')[0]);
            setContentKind('notes');
            setDraftTitle('');
            setReferencePages('');
            setStatusMessage(
                entryGroup === 'lecture'
                    ? 'Lecture content saved with smart study notes.'
                    : savedMaterialEntries.length > 1
                        ? `${entryGroupLabel(entryGroup)} saved in ${savedMaterialEntries.length} linked sections with cached smart notes.`
                        : `${entryGroupLabel(entryGroup)} saved with smart notes.`
            );
        } finally {
            setIsExtracting(false);
            clearProgress();
        }
    }

    function handleDelete(id) {
        onUpdateTranscripts(prev => prev.filter(t => t.id !== id));
    }

    function handleDeleteMaterial(id) {
        onUpdateMaterials(prev => prev.filter(item => item.id !== id));
    }

    const showProgressBar = isBusy && !isRecordingLecture;

    return (
        <div className="transcript-manager">
            <div className="transcript-form-section lecture-content-form-section">
                <div className="lecture-content-heading">
                    <div>
                        <h3>Lecture Content</h3>
                        <p className="transcript-hint">
                            Paste a transcript, paste notes, import PDF or readable text files, upload handwritten-note photos, record a live lecture, or save textbook/class material excerpts for a source-backed mind map.
                        </p>
                    </div>
                    <div className="lecture-content-mode-stack">
                        <div className="lecture-content-kind-toggle">
                            <button type="button" className={`lecture-kind-btn ${entryGroup === 'lecture' ? 'active' : ''}`} onClick={() => setEntryGroup('lecture')}>Lecture</button>
                            <button type="button" className={`lecture-kind-btn ${entryGroup === 'material' ? 'active' : ''}`} onClick={() => setEntryGroup('material')}>Class Material</button>
                            <button type="button" className={`lecture-kind-btn ${entryGroup === 'textbook' ? 'active' : ''}`} onClick={() => setEntryGroup('textbook')}>Textbook</button>
                        </div>
                        {entryGroup === 'lecture' && (
                            <div className="lecture-content-kind-toggle lecture-content-subtoggle">
                                <button type="button" className={`lecture-kind-btn ${contentKind === 'notes' ? 'active' : ''}`} onClick={() => setContentKind('notes')}>Notes</button>
                                <button type="button" className={`lecture-kind-btn ${contentKind === 'transcript' ? 'active' : ''}`} onClick={() => setContentKind('transcript')}>Transcript</button>
                            </div>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="transcript-form">
                    <div className="transcript-form-row lecture-content-meta-row">
                        <label className="transcript-date-label">
                            Lecture Date:
                            <input
                                type="date"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="transcript-date-input"
                            />
                        </label>
                        {entryGroup !== 'lecture' && (
                            <>
                                <label className="transcript-date-label material-meta-label">
                                    Title:
                                    <input
                                        type="text"
                                        value={draftTitle}
                                        onChange={e => setDraftTitle(e.target.value)}
                                        placeholder={entryGroup === 'textbook' ? `${courseName} textbook section` : `${courseName} class material`}
                                        className="transcript-date-input"
                                    />
                                </label>
                                <label className="transcript-date-label material-meta-label">
                                    Pages / Ref:
                                    <input
                                        type="text"
                                        value={referencePages}
                                        onChange={e => setReferencePages(e.target.value)}
                                        placeholder="e.g. 112-118"
                                        className="transcript-date-input"
                                    />
                                </label>
                            </>
                        )}
                    </div>

                    <div className="lecture-content-toolbar">
                        <button type="button" className="lecture-tool-btn" onClick={() => textFileInputRef.current?.click()} disabled={isBusy}>Upload File</button>
                        <button type="button" className="lecture-tool-btn" onClick={() => photoInputRef.current?.click()} disabled={isBusy || !apiKey}>Upload Photos</button>
                        {entryGroup === 'lecture' && (
                            <button type="button" className={`lecture-tool-btn lecture-record-btn ${isRecordingLecture ? 'recording' : ''}`} onClick={toggleLectureRecording}>
                                {isRecordingLecture ? 'Stop Recording' : 'Record Lecture'}
                            </button>
                        )}
                        <button type="button" className="lecture-tool-btn ghost" onClick={() => setNewText('')} disabled={!newText.trim() || isBusy}>Clear Draft</button>
                    </div>

                    <input
                        ref={textFileInputRef}
                        type="file"
                        accept="application/pdf,.pdf,text/*,.txt,.md,.csv,.json,.html,.rtf"
                        multiple
                        hidden
                        onChange={handleTextFileImport}
                    />
                    <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={handlePhotoImport}
                    />

                    <textarea
                        className="transcript-textarea lecture-content-textarea"
                        placeholder={entryGroup === 'textbook'
                            ? `Paste a textbook section for ${courseName} here, add page numbers if you have them, or upload a PDF/readable text export so the mind map can pace it to your course progress...`
                            : entryGroup === 'material'
                                ? `Paste class handouts, study guides, review packets, or other course material for ${courseName} here...`
                                : contentKind === 'notes'
                                    ? `Paste your ${courseName} lecture notes here, then save them to keep topic links and teacher context up to date...`
                                    : `Paste the ${courseName} transcript here, or start recording to capture the lecture live...`}
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        rows={10}
                    />

                    {statusMessage && (
                        <div className={`lecture-content-status ${isRecordingLecture ? 'recording' : ''}`} aria-live="polite">
                            <div className="lecture-content-status-text">{statusMessage}</div>
                            {showProgressBar && (
                                <div className="lecture-content-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}>
                                    <div className="lecture-content-progress-bar" style={{ width: `${progressValue}%` }} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="transcript-form-actions lecture-content-actions">
                        <button type="submit" className="btn-primary" disabled={!newText.trim() || isBusy}>
                            {isExtracting ? (
                                <>
                                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                                    </svg>
                                    Saving & Extracting Concepts...
                                </>
                            ) : isImportingFile || isTranscribingPhotos ? (
                                'Working...'
                            ) : (
                                `Save ${entryGroupLabel(entryGroup)}`
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <div className="transcript-list-section lecture-content-list-section">
                <h3>Saved Lecture Content ({sortedTranscripts.length})</h3>
                {sortedTranscripts.length === 0 ? (
                    <div className="panel-empty">
                        <p>No lecture content yet. Paste, upload, or record your first class notes above.</p>
                    </div>
                ) : (
                    <div className="transcript-list">
                        {sortedTranscripts.map(t => {
                            const dateStr = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                            const expandedKey = `lecture:${t.id}`;
                            const isExpanded = expandedId === expandedKey;
                            const showRaw = Boolean(rawVisibleIds[expandedKey]);
                            const preview = t.text.slice(0, 170) + (t.text.length > 170 ? '...' : '');

                            return (
                                <div key={t.id} id={getSourceFocusId('transcript', t.id)} className="transcript-card lecture-content-card">
                                    <div className="transcript-card-header" onClick={() => setExpandedId(isExpanded ? null : expandedKey)}>
                                        <div className="transcript-card-date">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                            {dateStr}
                                        </div>
                                        <div className="transcript-card-actions">
                                            <span className="lecture-content-kind-badge">{kindLabel(t.kind)}</span>
                                            <button className="transcript-expand-btn" type="button">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    {isExpanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                                                </svg>
                                            </button>
                                            <button className="transcript-delete-btn" type="button" onClick={e => { e.stopPropagation(); handleDelete(t.id); }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="transcript-card-preview lecture-content-preview">
                                        {t.summary ? (
                                            <>
                                                <div className="lecture-content-summary-label">Smart notes</div>
                                                <div className="lecture-content-smart-summary">{t.summary}</div>
                                                {isExpanded && (
                                                    <>
                                                        <button type="button" className="lecture-content-raw-toggle" onClick={e => { e.stopPropagation(); toggleRawContent(expandedKey); }}>
                                                            {showRaw ? 'Hide raw content' : 'View raw content'}
                                                        </button>
                                                        {showRaw && (
                                                            <>
                                                                <div className="lecture-content-source-label">Source text</div>
                                                                <div className="lecture-content-raw-text">{t.text}</div>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        ) : (isExpanded ? t.text : preview)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="transcript-list-section lecture-content-list-section material-list-section">
                <h3>Course Materials & Textbook ({sortedMaterials.length})</h3>
                {sortedMaterials.length === 0 ? (
                    <div className="panel-empty">
                        <p>No textbook or class material saved yet. Switch the draft mode above to Class Material or Textbook and save an excerpt.</p>
                    </div>
                ) : (
                    <div className="transcript-list">
                        {sortedMaterials.map(item => {
                            const dateStr = item.date
                                ? new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                                : 'No date';
                            const expandedKey = `material:${item.id}`;
                            const isExpanded = expandedId === expandedKey;
                            const showRaw = Boolean(rawVisibleIds[expandedKey]);
                            const preview = (item.text || item.content || '').slice(0, 170) + (((item.text || item.content || '').length > 170) ? '...' : '');

                            return (
                                <div key={item.id} id={getSourceFocusId('material', item.id)} className="transcript-card lecture-content-card material-card">
                                    <div className="transcript-card-header" onClick={() => setExpandedId(isExpanded ? null : expandedKey)}>
                                        <div>
                                            <div className="detail-card-name">{item.title || entryGroupLabel(item.kind)}</div>
                                            <div className="material-card-meta">
                                                <span className="lecture-content-kind-badge">{entryGroupLabel(item.kind)}</span>
                                                {item.pageReference && <span className="lecture-material-pill">Pages {item.pageReference}</span>}
                                                <span>{dateStr}</span>
                                            </div>
                                        </div>
                                        <div className="transcript-card-actions">
                                            <button className="transcript-expand-btn" type="button">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    {isExpanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                                                </svg>
                                            </button>
                                            <button className="transcript-delete-btn" type="button" onClick={e => { e.stopPropagation(); handleDeleteMaterial(item.id); }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="transcript-card-preview lecture-content-preview">
                                        {item.summary ? (
                                            <>
                                                <div className="lecture-content-summary-label">Smart notes</div>
                                                <div className="lecture-content-smart-summary">{item.summary}</div>
                                                {isExpanded && (
                                                    <>
                                                        <button type="button" className="lecture-content-raw-toggle" onClick={e => { e.stopPropagation(); toggleRawContent(expandedKey); }}>
                                                            {showRaw ? 'Hide raw content' : 'View raw content'}
                                                        </button>
                                                        {showRaw && (
                                                            <>
                                                                <div className="lecture-content-source-label">Source excerpt</div>
                                                                <div className="lecture-content-raw-text">{item.text || item.content}</div>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        ) : (isExpanded ? (item.text || item.content) : preview)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
