import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeSmartSummary, stripModelFormatting } from '../src/smartSummary.js';

test('sanitizeSmartSummary removes prompt leakage and keeps the final answer', () => {
  const cleaned = sanitizeSmartSummary(
    'The user wants a summary of the section.\n\nFinal answer: De facto power is exercised in practice, while de jure authority is the formal legal right to rule.',
    'Fallback text',
  );

  assert.equal(cleaned, 'De facto power is exercised in practice, while de jure authority is the formal legal right to rule.');
});

test('sanitizeSmartSummary falls back when the model output is still meta', () => {
  const cleaned = sanitizeSmartSummary(
    'The user wants a summary. Specifically they say to return plain text only.',
    'De facto and de jure authority can diverge in real political systems.',
  );

  assert.equal(cleaned, 'De facto and de jure authority can diverge in real political systems.');
});

test('stripModelFormatting removes think tags and fences', () => {
  const cleaned = stripModelFormatting('<think>reasoning</think>```text\nKey concept summary\n```');
  assert.equal(cleaned, 'Key concept summary');
});