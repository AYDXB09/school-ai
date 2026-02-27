import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Chevron icon for thinking toggle
const ChevronDown = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
    </svg>
);

const ChevronRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
    </svg>
);

// Parses out <think>...</think> blocks from raw message content
function parseThinkingBlocks(content) {
    const parts = [];
    const regex = /<think>([\s\S]*?)<\/think>/gi;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'thinking', content: match[1].trim() });
        lastIndex = match.index + match[0].length;
    }

    // If we're mid-stream and the tag is open but not closed
    const remaining = content.slice(lastIndex);
    if (remaining) {
        const openTag = remaining.indexOf('<think>');
        if (openTag !== -1) {
            const beforeTag = remaining.slice(0, openTag);
            const thinkContent = remaining.slice(openTag + 7);
            if (beforeTag) parts.push({ type: 'text', content: beforeTag });
            if (thinkContent) parts.push({ type: 'thinking', content: thinkContent, open: true });
        } else {
            parts.push({ type: 'text', content: remaining });
        }
    }

    return parts;
}

// Markdown renderers for custom styling
const markdownComponents = {
    // Tables
    table: ({ children }) => (
        <div className="md-table-wrapper">
            <table>{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    th: ({ children }) => <th>{children}</th>,
    td: ({ children }) => <td>{children}</td>,
    // Blockquote as hint card
    blockquote: ({ children }) => (
        <blockquote className="md-blockquote">{children}</blockquote>
    ),
    // Code
    code: ({ inline, className, children }) => {
        if (inline) {
            return <code className="md-code-inline">{children}</code>;
        }
        return (
            <div className="md-code-block">
                <pre><code>{children}</code></pre>
            </div>
        );
    },
    // Headings
    h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
    h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
    // Paragraphs
    p: ({ children }) => <p className="md-p">{children}</p>,
    // Lists
    ul: ({ children }) => <ul className="md-ul">{children}</ul>,
    ol: ({ children }) => <ol className="md-ol">{children}</ol>,
    li: ({ children }) => <li className="md-li">{children}</li>,
    // Strong / em
    strong: ({ children }) => <strong className="md-strong">{children}</strong>,
    em: ({ children }) => <em className="md-em">{children}</em>,
    // Horizontal rule
    hr: () => <hr className="md-hr" />,
    // Links
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">{children}</a>
    ),
};

// ThinkingBlock: collapsible "Thinking..." section
function ThinkingBlock({ content, isStreaming }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="thinking-block">
            <button
                className="thinking-toggle"
                onClick={() => setExpanded(e => !e)}
            >
                <span className="thinking-icon">
                    {expanded ? <ChevronDown /> : <ChevronRight />}
                </span>
                <span className="thinking-label">
                    {isStreaming ? (
                        <span className="thinking-live">
                            Thinking
                            <span className="thinking-dots">
                                <span /><span /><span />
                            </span>
                        </span>
                    ) : 'Thinking'}
                </span>
            </button>
            {expanded && (
                <div className="thinking-content">
                    <pre>{content}</pre>
                </div>
            )}
        </div>
    );
}

// Main MessageRenderer
export function MessageRenderer({ content, isStreaming }) {
    const parts = parseThinkingBlocks(content || '');
    const hasOnlyThinking = parts.length > 0 && parts.every(p => p.type === 'thinking');

    if (!content && isStreaming) {
        return (
            <div className="typing-indicator">
                <span /><span /><span />
            </div>
        );
    }

    return (
        <div className="message-renderer">
            {parts.map((part, i) => {
                if (part.type === 'thinking') {
                    return (
                        <ThinkingBlock
                            key={i}
                            content={part.content}
                            isStreaming={isStreaming && (i === parts.length - 1 || hasOnlyThinking)}
                        />
                    );
                }
                const trimmed = part.content.trim();
                if (!trimmed) return null;
                return (
                    <ReactMarkdown
                        key={i}
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={markdownComponents}
                    >
                        {trimmed}
                    </ReactMarkdown>
                );
            })}
        </div>
    );
}

export default MessageRenderer;
