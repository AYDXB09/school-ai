export function stripModelFormatting(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/```(?:json|text|markdown)?\s*/gi, '')
    .replace(/```/g, '')
    .replace(/\r/g, '')
    .trim();
}

export function normalizeSummaryText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildFallbackSummary(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map(sentence => sentence.trim()).filter(Boolean) || [];
  const summary = sentences.slice(0, 2).join(' ') || normalized;
  return summary.length > 260 ? `${summary.slice(0, 257)}...` : summary;
}

const META_PREFIX_REGEXES = [
  /^(the )?(user|student|prompt|request|task)\b/i,
  /^(i|we)\s+(need|should|will|can|want|must|have|am|would|could|think|see|summarize|extract)\b/i,
  /^(let'?s|first,|next,|finally,)\b/i,
  /^(provided text|source text|context|input text)\b/i,
  /^(return plain text only|respond with only|do not include|valid json array)\b/i,
  /^specifically they say\b/i,
  /^title\s*:/i,
  /^summarize this\b/i,
];

function extractPreferredSegment(text) {
  const cleaned = stripModelFormatting(text);
  const markerRegex = /(?:^|\n)\s*(final answer|final response|summary|smart notes?|answer)\s*:\s*/ig;
  let match;
  let preferred = '';

  while ((match = markerRegex.exec(cleaned))) {
    const segment = cleaned.slice(match.index + match[0].length).trim();
    if (segment) preferred = segment;
  }

  return preferred || cleaned;
}

function stripLeadingMetaParagraphs(text) {
  const paragraphs = String(text || '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  while (paragraphs.length > 1 && META_PREFIX_REGEXES.some(regex => regex.test(paragraphs[0]))) {
    paragraphs.shift();
  }

  return paragraphs.join('\n\n');
}

function filterMetaLines(text) {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);

  const kept = [];
  lines.forEach((line) => {
    const unbulleted = line.replace(/^[-*•]\s*/, '').trim();
    const labeledMatch = unbulleted.match(/^(final answer|final response|summary|smart notes?|answer)\s*:\s*(.+)$/i);
    if (labeledMatch) {
      kept.push(labeledMatch[2].trim());
      return;
    }
    if (META_PREFIX_REGEXES.some(regex => regex.test(unbulleted))) return;
    kept.push(line);
  });

  return kept.join('\n');
}

function looksLikeMetaSummary(text) {
  const sample = String(text || '').trim().slice(0, 240);
  return /(the user wants|they have provided|specifically they say|return plain text only|respond with only|valid json array|let'?s think|i need to|the prompt)/i.test(sample);
}

export function sanitizeSmartSummary(text, fallback = '') {
  const preferred = extractPreferredSegment(text);
  const withoutMetaParagraphs = stripLeadingMetaParagraphs(preferred);
  const cleaned = filterMetaLines(withoutMetaParagraphs)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned && !looksLikeMetaSummary(cleaned)) return cleaned;

  return stripModelFormatting(fallback)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}