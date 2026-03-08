import { useState } from 'react';
import { streamChat } from './api';

// ============================================================
// TRANSCRIPT MANAGER — per-course transcript upload & list
// ============================================================

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export default function TranscriptManager({ courseId, courseName, transcripts, onUpdateTranscripts, apiKey, onTopicsExtracted }) {
    const [newText, setNewText] = useState('');
    const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    const sortedTranscripts = [...transcripts].sort((a, b) => new Date(b.date) - new Date(a.date));

    async function extractTopics(text) {
        if (!apiKey || !text.trim()) return [];

        setIsExtracting(true);
        try {
            const systemPrompt = `You are a curriculum analysis AI. Extract the key topics and concepts taught in the following class transcript.
Return ONLY a valid JSON array of objects, each with "name" (short topic title, 2-5 words) and "summary" (1-2 sentence description of what was taught).
Example: [{"name": "Derivatives", "summary": "Introduction to derivatives as rates of change, including the power rule and chain rule."}]
Do NOT include any text outside the JSON array. Respond with ONLY the JSON array.`;

            let fullResponse = '';
            await streamChat(
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Extract topics from this class transcript:\n\n${text.slice(0, 8000)}` }
                ],
                apiKey,
                (token) => { fullResponse += token; },
                (err) => { console.error('Topic extraction error:', err); },
                {}
            );

            // Parse JSON from response - handle <think> tags and markdown code blocks
            let cleaned = fullResponse
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/gi, '')
                .trim();

            // Find the JSON array in the response
            const startIdx = cleaned.indexOf('[');
            const endIdx = cleaned.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
                cleaned = cleaned.substring(startIdx, endIdx + 1);
            }

            const topics = JSON.parse(cleaned);
            return Array.isArray(topics) ? topics : [];
        } catch (e) {
            console.error('Failed to extract topics:', e);
            return [];
        } finally {
            setIsExtracting(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!newText.trim()) return;

        const transcript = {
            id: genId(),
            courseId,
            date: newDate,
            text: newText.trim(),
            createdAt: Date.now(),
        };

        onUpdateTranscripts(prev => [...prev, transcript]);

        // Auto-extract topics
        const topics = await extractTopics(newText);
        if (topics.length > 0 && onTopicsExtracted) {
            onTopicsExtracted(topics.map(t => ({
                ...t,
                sourceTranscriptId: transcript.id,
                sourceDate: newDate,
            })));
        }

        setNewText('');
        setNewDate(new Date().toISOString().split('T')[0]);
    }

    function handleDelete(id) {
        onUpdateTranscripts(prev => prev.filter(t => t.id !== id));
    }

    return (
        <div className="transcript-manager">
            <div className="transcript-form-section">
                <h3>Add Class Transcript</h3>
                <p className="transcript-hint">
                    Paste what your teacher said in class. The AI will automatically extract key topics for your Mind Map.
                </p>
                <form onSubmit={handleSubmit} className="transcript-form">
                    <div className="transcript-form-row">
                        <label className="transcript-date-label">
                            Class Date:
                            <input
                                type="date"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="transcript-date-input"
                            />
                        </label>
                    </div>
                    <textarea
                        className="transcript-textarea"
                        placeholder={`Paste what your ${courseName} teacher said in class today...`}
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        rows={8}
                    />
                    <div className="transcript-form-actions">
                        <button type="submit" className="btn-primary" disabled={!newText.trim() || isExtracting}>
                            {isExtracting ? (
                                <>
                                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                                    </svg>
                                    Extracting Topics...
                                </>
                            ) : (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    Save & Extract Topics
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <div className="transcript-list-section">
                <h3>Past Transcripts ({sortedTranscripts.length})</h3>
                {sortedTranscripts.length === 0 ? (
                    <div className="panel-empty">
                        <p>No transcripts yet. Paste your first class transcript above!</p>
                    </div>
                ) : (
                    <div className="transcript-list">
                        {sortedTranscripts.map(t => {
                            const dateStr = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                            const isExpanded = expandedId === t.id;
                            const preview = t.text.slice(0, 150) + (t.text.length > 150 ? '...' : '');

                            return (
                                <div key={t.id} className="transcript-card">
                                    <div className="transcript-card-header" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                                        <div className="transcript-card-date">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                            {dateStr}
                                        </div>
                                        <div className="transcript-card-actions">
                                            <button className="transcript-expand-btn">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    {isExpanded ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                                                </svg>
                                            </button>
                                            <button className="transcript-delete-btn" onClick={e => { e.stopPropagation(); handleDelete(t.id); }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="transcript-card-preview">
                                        {isExpanded ? t.text : preview}
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
