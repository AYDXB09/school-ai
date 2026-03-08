import { useState, useMemo } from 'react';

// ============================================================
// TOPIC MIND MAP — visual knowledge graph of extracted concepts
// ============================================================

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export default function TopicMindMap({ topics, transcripts, assignments, courseName, onStartChat, onUpdateTopics, courseId }) {
    const [selectedTopic, setSelectedTopic] = useState(null);
    const [newTopicName, setNewTopicName] = useState('');
    const [newTopicSummary, setNewTopicSummary] = useState('');

    // Find assignments that match a given topic
    function getRelatedAssignments(topic) {
        if (!topic || !assignments) return [];
        const keywords = topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        return assignments.filter(a => {
            const name = (a.name || '').toLowerCase();
            const desc = (a.description || '').toLowerCase();
            return keywords.some(kw => name.includes(kw) || desc.includes(kw));
        });
    }

    // Find transcripts that mention a topic
    function getRelatedTranscripts(topic) {
        if (!topic || !transcripts) return [];
        const keywords = topic.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        return transcripts.filter(t => {
            const text = (t.text || '').toLowerCase();
            return keywords.some(kw => text.includes(kw));
        });
    }

    function handleAddTopic(e) {
        e.preventDefault();
        if (!newTopicName.trim()) return;
        const newTopic = {
            id: genId(),
            courseId,
            name: newTopicName.trim(),
            summary: newTopicSummary.trim() || 'Manually added topic',
            sourceTranscriptId: null,
            sourceDate: new Date().toISOString().split('T')[0],
        };
        onUpdateTopics(prev => [...prev, newTopic]);
        setNewTopicName('');
        setNewTopicSummary('');
    }

    function handleDeleteTopic(topicId) {
        onUpdateTopics(prev => prev.filter(t => t.id !== topicId));
        if (selectedTopic?.id === topicId) setSelectedTopic(null);
    }

    const selectedRelatedAssignments = selectedTopic ? getRelatedAssignments(selectedTopic) : [];
    const selectedRelatedTranscripts = selectedTopic ? getRelatedTranscripts(selectedTopic) : [];

    return (
        <div className="topic-mindmap">
            <div className="mindmap-header">
                <h3>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', verticalAlign: 'middle' }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Knowledge Map — {courseName}
                </h3>
                <p className="mindmap-hint">Topics are automatically extracted from your class transcripts. Click a topic to explore.</p>
            </div>

            <div className="mindmap-layout">
                {/* Topic Grid */}
                <div className="mindmap-grid">
                    {topics.length === 0 ? (
                        <div className="panel-empty">
                            <div className="panel-empty-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                                    <circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /><path d="M15 15l3.5 3.5" /><path d="M9 15L5.5 18.5" /><path d="M15 9l3.5-3.5" /><path d="M9 9L5.5 5.5" />
                                </svg>
                            </div>
                            <p>No topics extracted yet. Go to the Transcripts tab and paste a class transcript to get started!</p>
                        </div>
                    ) : (
                        <>
                            {topics.map((topic, idx) => {
                                const relAssignments = getRelatedAssignments(topic);
                                const relTranscripts = getRelatedTranscripts(topic);
                                const isSelected = selectedTopic?.id === topic.id;
                                const hue = (idx * 37) % 360;

                                return (
                                    <div
                                        key={topic.id}
                                        className={`mindmap-node ${isSelected ? 'selected' : ''}`}
                                        style={{ '--node-hue': hue }}
                                        onClick={() => setSelectedTopic(isSelected ? null : topic)}
                                    >
                                        <div className="mindmap-node-name">{topic.name}</div>
                                        <div className="mindmap-node-summary">{topic.summary}</div>
                                        <div className="mindmap-node-badges">
                                            {relTranscripts.length > 0 && (
                                                <span className="mindmap-badge transcript">
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                                        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                                                    </svg>
                                                    {relTranscripts.length}
                                                </span>
                                            )}
                                            {relAssignments.length > 0 && (
                                                <span className="mindmap-badge assignment">
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                                        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                                    </svg>
                                                    {relAssignments.length}
                                                </span>
                                            )}
                                        </div>
                                        {topic.sourceDate && (
                                            <div className="mindmap-node-date">
                                                {new Date(topic.sourceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}

                    {/* Add Topic Form */}
                    <form className="mindmap-add-form" onSubmit={handleAddTopic}>
                        <input
                            type="text"
                            placeholder="Add a topic..."
                            value={newTopicName}
                            onChange={e => setNewTopicName(e.target.value)}
                            className="mindmap-add-input"
                        />
                        <input
                            type="text"
                            placeholder="Brief summary (optional)"
                            value={newTopicSummary}
                            onChange={e => setNewTopicSummary(e.target.value)}
                            className="mindmap-add-input"
                        />
                        <button type="submit" className="btn-primary" disabled={!newTopicName.trim()}>+ Add</button>
                    </form>
                </div>

                {/* Topic Detail Panel */}
                {selectedTopic && (
                    <div className="mindmap-detail">
                        <div className="mindmap-detail-header">
                            <h3>{selectedTopic.name}</h3>
                            <button className="mindmap-detail-close" onClick={() => setSelectedTopic(null)}>×</button>
                        </div>
                        <p className="mindmap-detail-summary">{selectedTopic.summary}</p>

                        <div className="mindmap-detail-actions">
                            <button className="btn-primary" onClick={() => onStartChat(selectedTopic)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                                </svg>
                                Get Help on This Topic
                            </button>
                            <button className="btn-secondary btn-danger" onClick={() => handleDeleteTopic(selectedTopic.id)}>
                                Delete Topic
                            </button>
                        </div>

                        {/* Related Transcripts */}
                        <div className="mindmap-detail-section">
                            <h4>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'text-bottom' }}>
                                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                                </svg>
                                Related Class Transcripts ({selectedRelatedTranscripts.length})
                            </h4>
                            {selectedRelatedTranscripts.length === 0 ? (
                                <p className="detail-empty">No transcripts mention this topic.</p>
                            ) : (
                                selectedRelatedTranscripts.map(t => {
                                    const dateStr = new Date(t.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                    // Find relevant excerpt
                                    const keywords = selectedTopic.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
                                    let excerpt = '';
                                    for (const kw of keywords) {
                                        const idx = t.text.toLowerCase().indexOf(kw);
                                        if (idx !== -1) {
                                            const start = Math.max(0, idx - 80);
                                            const end = Math.min(t.text.length, idx + 200);
                                            excerpt = (start > 0 ? '...' : '') + t.text.substring(start, end) + (end < t.text.length ? '...' : '');
                                            break;
                                        }
                                    }
                                    return (
                                        <div key={t.id} className="detail-card">
                                            <div className="detail-card-date">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                                                </svg>
                                                {dateStr}
                                            </div>
                                            <div className="detail-card-excerpt">{excerpt || t.text.slice(0, 200) + '...'}</div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Related Assignments */}
                        <div className="mindmap-detail-section">
                            <h4>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', verticalAlign: 'text-bottom' }}>
                                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                </svg>
                                Related Assignments ({selectedRelatedAssignments.length})
                            </h4>
                            {selectedRelatedAssignments.length === 0 ? (
                                <p className="detail-empty">No assignments match this topic.</p>
                            ) : (
                                selectedRelatedAssignments.map((a, idx) => (
                                    <div key={`${a.id}-${idx}`} className="detail-card">
                                        <div className="detail-card-name">{a.name}</div>
                                        {a.date && <div className="detail-card-due">Due: {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
