import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { streamChat } from './api';

export default function QuizView({ topic, count, courseName, transcripts, apiKey, onClose }) {
    const [dynamicCount, setDynamicCount] = useState(count || 5);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [masteryScore, setMasteryScore] = useState(0); // 0 to 100
    const [history, setHistory] = useState([]); // Array of { correct: boolean }

    const [isGenerating, setIsGenerating] = useState(true);
    const [questionData, setQuestionData] = useState(null);
    const [error, setError] = useState('');

    const [selectedOption, setSelectedOption] = useState(null);
    const [isAnswered, setIsAnswered] = useState(false);
    const [showHint, setShowHint] = useState(false);

    useEffect(() => {
        if (currentQuestionIndex < dynamicCount) {
            generateNextQuestion();
        }
    }, [currentQuestionIndex, dynamicCount]);

    async function generateNextQuestion() {
        setIsGenerating(true);
        setError('');
        setQuestionData(null);
        setSelectedOption(null);
        setIsAnswered(false);
        setShowHint(false);

        const masteryLevel = masteryScore < 30 ? 'beginner' : masteryScore < 70 ? 'intermediate' : 'advanced';

        const contextText = transcripts && transcripts.length > 0
            ? `Course Context (${courseName}):\n` + transcripts.slice(0, 3).map(t => t.text).join('\n\n').slice(0, 4000)
            : `Course: ${courseName || 'General Knowledge'}`;

        const prompt = `
Generate a single multiple-choice question about: "${topic}".
Difficulty level: ${masteryLevel} (adjust complexity based on this).
${contextText}

Respond with ONLY a valid JSON object in this exact format, no markdown outside of it:
{
  "question": "The question text here...",
  "options": [
    "A. First option",
    "B. Second option",
    "C. Third option",
    "D. Fourth option"
  ],
  "correctIndex": 0, // 0 for A, 1 for B, etc.
  "hint": "A helpful hint that doesn't completely give away the answer."
}
`;

        let fullResponse = '';
        let errorMessage = '';

        await streamChat(
            [
                { role: 'system', content: 'You are an adaptive quiz generator. Output ONLY valid JSON.' },
                { role: 'user', content: prompt }
            ],
            apiKey,
            (token) => { fullResponse += token; },
            () => { },
            (err) => { errorMessage = err; }
        );

        setIsGenerating(false);

        if (errorMessage) {
            setError(errorMessage);
            return;
        }

        try {
            let cleaned = fullResponse;
            // Strip any thinking output
            if (cleaned.toLowerCase().includes('</think>')) {
                const parts = cleaned.split(/<\/think>/i);
                cleaned = parts[parts.length - 1]; // Keep everything after </think>
            } else {
                cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
            }

            cleaned = cleaned.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const startIdx = cleaned.indexOf('{');
            const endIdx = cleaned.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                cleaned = cleaned.substring(startIdx, endIdx + 1);
            }

            const data = JSON.parse(cleaned);
            if (!data.question || !Array.isArray(data.options)) {
                throw new Error("Invalid output format");
            }
            setQuestionData(data);
        } catch (e) {
            console.error(e, fullResponse);
            setError('Failed to generate a valid question. Please try again.');
        }
    }

    function handleOptionClick(index) {
        if (isAnswered) return;
        setSelectedOption(index);
        setIsAnswered(true);

        const isCorrect = index === questionData.correctIndex;
        const newHistory = [...history, { correct: isCorrect }];
        setHistory(newHistory);

        // Adjust mastery
        if (isCorrect) {
            setMasteryScore(prev => Math.min(100, prev + (100 / count) * 1.5)); // Go up
        } else {
            setMasteryScore(prev => Math.max(0, prev - (100 / count) * 0.5)); // Go down slightly
        }
    }

    function handleNext() {
        setCurrentQuestionIndex(prev => prev + 1);
    }

    if (currentQuestionIndex >= dynamicCount) {
        const isMaster = masteryScore >= 100;
        return (
            <div className="quiz-modal-overlay">
                <div className="quiz-container finished-container">
                    <button className="quiz-close-btn" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                    <div className="quiz-finished-content">
                        <h2>{isMaster ? 'Mastery Achieved! 🎉' : 'Quiz Complete!'}</h2>
                        <p>You answered {history.filter(h => h.correct).length} out of {dynamicCount} correctly.</p>
                        <div className="mastery-summary">
                            <span>Final Mastery Score</span>
                            <div className="mastery-bar"><div className="mastery-fill" style={{ width: `${Math.min(100, masteryScore)}%` }}></div></div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                            <button className="btn-secondary" onClick={onClose} style={{ padding: '10px 24px', borderRadius: '20px', background: 'transparent', border: '1px solid #555', color: '#fff', cursor: 'pointer' }}>Return to Chat</button>
                            {!isMaster && (
                                <button className="btn-primary" onClick={() => setDynamicCount(prev => prev + 5)} style={{ padding: '10px 24px', borderRadius: '20px', background: '#60A5FA', border: 'none', color: '#000', fontWeight: '600', cursor: 'pointer' }}>
                                    Generate 5 more questions
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="quiz-modal-overlay">
            <div className="quiz-container">
                {/* Header */}
                <div className="quiz-header">
                    <div className="quiz-header-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 01-2.5-2.5z" />
                            <path d="M8 7h6" />
                            <path d="M8 11h8" />
                        </svg>
                        {topic}
                    </div>
                    <div className="quiz-header-actions">
                        <button className="quiz-close-btn" onClick={onClose} aria-label="Close Quiz">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button className="quiz-close-btn" onClick={onClose} aria-label="Close Quiz">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Progress Bar Area */}
                <div className="quiz-progress-section">
                    <div className="quiz-progress-segments">
                        {Array.from({ length: count }).map((_, i) => (
                            <div key={i} className={`progress-segment ${i < currentQuestionIndex ? 'filled' : i === currentQuestionIndex ? 'active' : ''}`}></div>
                        ))}
                    </div>
                    <div className="quiz-stats">
                        <span className="quiz-counter">{currentQuestionIndex + 1}/{count}</span>
                        <div className="quiz-score-badges">
                            <span className="badge-wrong">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                {history.filter(h => !h.correct).length}
                            </span>
                            <span className="badge-correct">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                {history.filter(h => h.correct).length}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Mastery Bar */}
                <div className="mastery-indicator">
                    <span className="mastery-label">Mastery Level</span>
                    <div className="mastery-bar-wrapper">
                        <div className="mastery-bar-fill" style={{ width: `${masteryScore}%` }}></div>
                    </div>
                </div>

                {/* Question Area */}
                <div className="quiz-body">
                    {isGenerating ? (
                        <div className="quiz-loading">
                            <div className="typing-indicator" style={{ justifyContent: 'center', marginBottom: '1rem' }}><span /><span /><span /></div>
                            <p>Generating adaptive question...</p>
                        </div>
                    ) : error ? (
                        <div className="quiz-error">
                            <p>{error}</p>
                            <button className="btn-primary" onClick={generateNextQuestion}>Retry</button>
                        </div>
                    ) : questionData ? (
                        <div className="question-wrapper">
                            <h3 className="question-text">
                                <span className="q-num">{currentQuestionIndex + 1}.</span>
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ node, ...props }) => <span {...props} /> }}>
                                    {questionData.question}
                                </ReactMarkdown>
                            </h3>

                            <div className="options-list">
                                {questionData.options.map((option, idx) => {
                                    let optionClass = "quiz-option";
                                    if (isAnswered) {
                                        if (idx === questionData.correctIndex) {
                                            optionClass += " correct";
                                        } else if (idx === selectedOption) {
                                            optionClass += " wrong";
                                        } else {
                                            optionClass += " dimmed";
                                        }
                                    } else if (selectedOption === idx) {
                                        optionClass += " selected";
                                    }

                                    return (
                                        <button
                                            key={idx}
                                            className={optionClass}
                                            onClick={() => handleOptionClick(idx)}
                                            disabled={isAnswered}
                                        >
                                            <span className="option-letter">{['A', 'B', 'C', 'D'][idx]}</span>
                                            <span className="option-text">
                                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ node, ...props }) => <span {...props} /> }}>
                                                    {option.replace(/^[A-D]\.\s*/, '')}
                                                </ReactMarkdown>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <button className="show-hint-btn" onClick={() => setShowHint(!showHint)}>
                                Show hint
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showHint ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </button>

                            {showHint && (
                                <div className="hint-box">
                                    💡 {questionData.hint}
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="quiz-footer">
                    {isAnswered && (
                        <button className="next-q-btn" onClick={handleNext}>
                            {currentQuestionIndex === dynamicCount - 1 ? 'Finish' : 'Next'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
