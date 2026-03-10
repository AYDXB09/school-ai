// MBZUAI K2-Think-v2 API Service

const API_URL = 'https://api.k2think.ai/v1/chat/completions';
const PDF_EXTRACT_URL = '/api/extract-pdf';

// Build content array for multimodal messages
// attachments: [{ type: 'image', base64: '...', mimeType: 'image/png' }]
function buildContent(text, attachments = []) {
    if (!attachments || attachments.length === 0) return text;

    const parts = [];
    if (text) parts.push({ type: 'text', text });

    for (const att of attachments) {
        if (att.type === 'image') {
            parts.push({
                type: 'image_url',
                image_url: { url: `data:${att.mimeType};base64,${att.base64}` },
            });
        } else if (att.type === 'text') {
            parts.push({ type: 'text', text: `\n\n[Attached file: ${att.name}]\n${att.content}` });
        }
    }

    return parts;
}

export async function streamChat(messages, apiKey, onChunk, onDone, onError, options = {}) {
    const { backendUrl, canvasUrl, canvasToken } = options;

    // If backend URL is provided, route through Python backend
    if (backendUrl) {
        return streamChatBackend(messages, apiKey, onChunk, onDone, onError, backendUrl, canvasUrl, canvasToken);
    }

    // Direct mode: call K2-Think-v2 API directly
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                model: 'MBZUAI-IFM/K2-Think-v2',
                messages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') { onDone(); return; }

                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) onChunk(content);
                } catch { /* skip malformed */ }
            }
        }

        onDone();
    } catch (e) {
        if (e.name !== 'AbortError') onError(e.message);
    }
}

export async function extractPdfText(file) {
    try {
        const response = await fetch(PDF_EXTRACT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': file?.type || 'application/pdf',
                'X-File-Name': encodeURIComponent(file?.name || 'document.pdf'),
            },
            body: file,
        });

        if (!response.ok) {
            let message = `PDF extraction failed (${response.status})`;
            try {
                const payload = await response.json();
                if (payload?.error) message = payload.error;
            } catch {
                const text = await response.text();
                if (text) message = text;
            }
            throw new Error(message);
        }

        const payload = await response.json();
        if (!payload?.text?.trim()) {
            throw new Error('No readable text was extracted from that PDF.');
        }
        return payload;
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('PDF extraction requires the local Python backend to be running on localhost:8000.');
        }
        throw error;
    }
}

/**
 * Stream chat through the Python backend (RAG + Function Calling mode).
 * The backend handles Canvas API calls, ChromaDB search, and tool orchestration.
 */
async function streamChatBackend(messages, apiKey, onChunk, onDone, onError, backendUrl, canvasUrl, canvasToken) {
    try {
        const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages,
                api_key: apiKey,
                canvas_url: canvasUrl,
                canvas_token: canvasToken,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend Error ${response.status}: ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') { onDone(); return; }

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === 'content' && parsed.text) {
                        onChunk(parsed.text);
                    } else if (parsed.type === 'tool_call') {
                        // Tool call status — append a thinking indicator
                        onChunk(`\n> Calling **${parsed.name}**...\n`);
                    } else if (parsed.type === 'error') {
                        onError(parsed.message);
                        return;
                    }
                } catch { /* skip malformed */ }
            }
        }

        onDone();
    } catch (e) {
        if (e.name !== 'AbortError') onError(e.message);
    }
}

export { buildContent };
