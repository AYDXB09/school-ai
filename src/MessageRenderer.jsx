import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

// ─── Icons ────────────────────────────────────────────────────────────────────
const ChevronRight = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
    </svg>
);
const ChevronDown = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
    </svg>
);

// ─── Pre-process: extract thinking block from raw content ───────────────────
// K2-Think-v2 model outputs thinking WITHOUT an opening <think> tag.
// The format is: [thinking text]</think>[actual response]
// We handle all known formats:
//   A: <think>...</think>response   (standard)
//   B: thinking...</think>response  (K2 default – no opening tag)
//   C: <think>thinking...           (streaming, not closed yet)
//   D: thinking...                  (streaming K2, </think> not received yet)
function splitThinkingFromContent(raw, currentlyStreaming) {
    if (!raw) return { thinking: null, response: '' };

    // Format A: both <think> and </think> present
    const fullRe = /<think>([\s\S]*?)<\/think>/i;
    const fullMatch = fullRe.exec(raw);
    if (fullMatch) {
        const thinking = fullMatch[1].trim();
        const response = (raw.slice(0, fullMatch.index) + raw.slice(fullMatch.index + fullMatch[0].length)).trim();
        return { thinking, response };
    }

    // Format B: only </think> present (K2's actual format — no opening tag)
    const closeRe = /<\/think>/i;
    const closeMatch = closeRe.exec(raw);
    if (closeMatch) {
        const thinking = raw.slice(0, closeMatch.index).trim();
        const response = raw.slice(closeMatch.index + closeMatch[0].length).trim();
        return { thinking, response };
    }

    // Format C: <think> open tag but not closed yet (streaming)
    const openIdx = raw.search(/<think>/i);
    if (openIdx !== -1) {
        const before = raw.slice(0, openIdx).trim();
        const thinkContent = raw.slice(openIdx + 7).trim();
        return { thinking: thinkContent, response: before, isStreaming: true };
    }

    // Format D: K2 streaming — content arriving but </think> not received yet.
    // Only apply during active streaming to avoid treating normal replies as thinking.
    if (currentlyStreaming) {
        return { thinking: raw, response: '', isStreaming: true };
    }

    return { thinking: null, response: raw };
}



// ─── Thinking Block ───────────────────────────────────────────────────────────
function ThinkingBlock({ content, isStreaming }) {
    const [open, setOpen] = useState(false);    // STARTS COLLAPSED

    return (
        <div className="thinking-block">
            <button className="thinking-toggle" onClick={() => setOpen(o => !o)}>
                <span className="thinking-icon">{open ? <ChevronDown /> : <ChevronRight />}</span>
                <span className="thinking-label">
                    {isStreaming ? (
                        <>
                            Thinking
                            <span className="thinking-dots">
                                <span /><span /><span />
                            </span>
                        </>
                    ) : (
                        'Thinking'
                    )}
                </span>
            </button>
            {open && (
                <div className="thinking-content">
                    <pre>{content}</pre>
                </div>
            )}
        </div>
    );
}

// ─── Markdown component overrides ─────────────────────────────────────────────
const mdComponents = {
    // Swallow the raw <think> tag if it somehow leaks through to ReactMarkdown
    think: () => null,

    table: ({ children }) => (
        <div className="md-table-wrapper"><table>{children}</table></div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    th: ({ children }) => <th>{children}</th>,
    td: ({ children }) => <td>{children}</td>,
    blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
    code({ inline, children }) {
        if (inline) return <code className="md-code-inline">{children}</code>;
        return <div className="md-code-block"><pre><code>{children}</code></pre></div>;
    },
    h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
    h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
    p: ({ children }) => <p className="md-p">{children}</p>,
    ul: ({ children }) => <ul className="md-ul">{children}</ul>,
    ol: ({ children }) => <ol className="md-ol">{children}</ol>,
    li: ({ children }) => <li className="md-li">{children}</li>,
    strong: ({ children }) => <strong className="md-strong">{children}</strong>,
    em: ({ children }) => <em className="md-em">{children}</em>,
    hr: () => <hr className="md-hr" />,
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="md-link">{children}</a>
    ),
};

// ─── Main MessageRenderer ─────────────────────────────────────────────────────
export function MessageRenderer({ content, isStreaming }) {
    const { thinking, response, isStreaming: thinkStreaming } = splitThinkingFromContent(content, isStreaming);

    if (!content && isStreaming) {
        return (
            <div className="typing-indicator">
                <span /><span /><span />
            </div>
        );
    }

    return (
        <div className="message-renderer">
            {thinking !== null && (
                <ThinkingBlock
                    content={thinking}
                    isStreaming={isStreaming && thinkStreaming}
                />
            )}
            {response && (
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeRaw]}
                    components={mdComponents}
                >
                    {response}
                </ReactMarkdown>
            )}
        </div>
    );
}

export default MessageRenderer;
