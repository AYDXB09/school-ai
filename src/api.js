// MBZUAI K2-Think-v2 API Service

const API_URL = 'https://api.k2think.ai/v1/chat/completions';

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

export async function streamChat(messages, apiKey, onChunk, onDone, onError) {
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

export { buildContent };
