const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being', 'between', 'could', 'during', 'every', 'first', 'from', 'have', 'into', 'lesson', 'might', 'other', 'should', 'their', 'there', 'these', 'thing', 'through', 'under', 'using', 'very', 'what', 'when', 'where', 'which', 'while', 'would', 'your', 'with', 'that', 'this', 'they', 'them', 'then', 'than', 'were', 'been', 'just', 'more', 'some', 'like', 'onto', 'over', 'only', 'such', 'each', 'same', 'many', 'most', 'make', 'made', 'does', 'done', 'into', 'upon', 'will', 'shall', 'must', 'need', 'important', 'class', 'course', 'teacher', 'students', 'student', 'notes', 'context', 'transcript', 'textbook', 'assignment', 'assignments',
  'today', 'tomorrow', 'yesterday', 'week', 'weeks', 'month', 'months', 'semester', 'trimester', 'unit', 'chapter', 'section', 'module', 'topic', 'lesson',
]);

const PHRASE_CONNECTORS = new Set(['and', 'or', 'of', 'to', 'for', 'with', 'in', 'on']);

const TASK_WORDS = new Set([
  'activity', 'answer', 'answers', 'assignment', 'assignments', 'async', 'classwork', 'discussion', 'essay', 'exam', 'guide', 'homework',
  'lab', 'live', 'notes', 'outline', 'packet', 'practice', 'problem', 'problems', 'project', 'quiz', 'reading', 'readings', 'response',
  'review', 'sheet', 'study', 'submission', 'test', 'worksheet', 'workshop', 'writeup', 'question', 'questions', 'task', 'tasks',
  'lecture', 'lectures', 'page', 'pages', 'compare', 'compared', 'comparison', 'appear', 'appears', 'cover', 'covered',
]);

const PROGRESS_MARKER_REGEX = /\b(chapter|unit|week|module|lesson|section|topic)\s*([0-9]{1,3})\b/ig;

const ADMIN_TOPIC_PATTERNS = [
  /\b(academic honesty|honor code|office hours|study hall|study halls|tutoring|attendance|housekeeping|orientation|welcome|syllabus|rubric|grading policy|calendar|schedule|due dates?|resources?|expectations|advisory|homeroom|summer)\b/i,
  /\b(atl|research skills?|study skills?)\b/i,
  /\b(submit work|missing work|discussion post|class norms?)\b/i,
  /\b(go to .* website|visit .* website|unief website)\b/i,
];

const VAGUE_LABEL_PATTERNS = [
  /^(blue|green|orange|red|yellow|pink|white|black|grey|gray)\s+(slides?|pages?|sheets?)$/i,
  /^all\s+(blue|green|orange|red|yellow|pink|white|black|grey|gray)\s+(slides?|pages?|sheets?)$/i,
  /^(figure|fig\.?)\s*[0-9]+/i,
  /^(directions?|instructions?)$/i,
  /^(download|upload|print|submit|complete|finish|watch|listen|read|open|click)\b/i,
  /^(assessment|assessment .{0,10})$/i,
  /^(either side of|content is on|as you|below please|but iti|you (have|need|must|should))/i,
  /^(please|keep in mind|take|make sure|note that|remember)/i,
  /^(exercises?|exercise set|work|classwork|homework|hw)\s*[0-9]*$/i,
  /^(in the live|come over|have come)/i,
  /^(week|unit|chapter|module|section|lesson)\s*#?\s*[0-9]+$/i,
  /^[0-9.]+\s*(hours?|mins?|minutes?|days?)$/i,
  /^(async|asynch|sync|synchronous|asynchronous)$/i,
];

function isVagueLabel(label) {
  const normalized = String(label || '').trim();
  if (!normalized || normalized.length < 3) return true;
  if (VAGUE_LABEL_PATTERNS.some(p => p.test(normalized))) return true;
  // Single word that is very short or generic
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].length < 4) return true;
  return false;
}

function extractConceptFromTitle(title) {
  if (!title || typeof title !== 'string') return '';

  let cleaned = title
    // Strip leading course codes like "1.3", "2.1.A", "24.B"
    .replace(/^[0-9]+(?:\.[0-9A-Za-z]+)*\s*[-–—]?\s*/, '')
    // Strip "Week #N" patterns
    .replace(/week\s*#?\s*[0-9]+\s*[-–—]?\s*/i, '')
    // Strip task type labels like "Exercises", "Reading", "Homework"
    .replace(/[-–—]?\s*\b(exercises?|readings?|homework|hw|quiz|test|exam|lab|practice|classwork|discussion|review|assessment|activity|submission|worksheet|project|presentation)\b\s*[-–—]?\s*/ig, ' - ')
    // Strip hour markers like "(4 hours)" or "(2 hrs)"
    .replace(/\([0-9]+\s*(hours?|hrs?)\)/ig, '')
    // Strip mode markers like "(ASYNCH)", "(SYNC)", "(LIVE)"
    .replace(/\((async|asynch|synchronous|asynchronous|sync|live|in[- ]?class|online|remote|hybrid)\)/ig, '')
    .replace(/\b(async|asynch|synchronous|asynchronous|sync|live)\b$/ig, '')
    // Strip any remaining parenthetical modifiers
    .replace(/\([^)]{0,15}\)/g, '')
    .trim();

  // Pick the segment after the last separator dash that has meaningful content
  const segments = cleaned.split(/\s*[-–—]\s*/).filter(s => s.trim());
  if (segments.length > 1) {
    // Prefer the last meaningful segment (usually the concept name)
    for (let i = segments.length - 1; i >= 0; i--) {
      const candidate = cleanTopicLabel(segments[i].trim(), { allowSingleWord: true });
      if (candidate && !isVagueLabel(candidate) && !isAdministrativeTopicLabel(candidate)) {
        return candidate;
      }
    }
  }

  const result = cleanTopicLabel(cleaned, { allowSingleWord: true });
  if (result && !isVagueLabel(result) && !isAdministrativeTopicLabel(result)) return result;
  return '';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getTopicKey(topicLike) {
  const label = typeof topicLike === 'string'
    ? topicLike
    : (topicLike?.label ?? topicLike?.name ?? '');
  return `topic-${slugify(label)}`;
}

export function getCourseKey(courseLike) {
  const courseId = courseLike?.course_id ?? courseLike?.id;
  const courseName = (courseLike?.course_name ?? courseLike?.name ?? '').trim();
  if (courseId !== null && courseId !== undefined && courseId !== '') return `course-${courseId}`;
  if (courseName) return `course-${slugify(courseName)}`;
  return 'course-unknown';
}

export function matchesCourseKey(item, courseKey) {
  return getCourseKey(item) === courseKey;
}

function toSentence(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateish(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function titleCase(label) {
  return String(label || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function countWords(text) {
  return toSentence(text).split(/\s+/).filter(Boolean).length;
}

function uniqueByLabel(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.label) return false;
    const key = item.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenize(text) {
  return toSentence(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word) && !TASK_WORDS.has(word));
}

function isMeaningfulWord(word) {
  return Boolean(
    word
    && word.length > 2
    && !STOPWORDS.has(word)
    && !TASK_WORDS.has(word)
    && !/^[0-9]+$/.test(word)
  );
}

function cleanTopicLabel(label, { allowSingleWord = true } = {}) {
  let cleaned = toSentence(label)
    .replace(/\((async|sync|live|homework|classwork)[^)]*\)/ig, ' ')
    .replace(/\b(unit|chapter|week|module|lesson|section|topic)\s*[0-9a-z.-]*\s*[:\-]?\s*/ig, ' ')
    .replace(/^(practice|complete|finish|review|read|write|solve|submit|analyze|study|measure|compare|discuss|learn|understand|explain|watch|listen|prepare)\b[:\-\s]*/i, '')
    .replace(/\b(in class|for class|from class|this week|next week|last week|today|tomorrow)\b/ig, ' ')
    .replace(/[^A-Za-z0-9'&/\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned.replace(/^(the|a|an)\s+/i, '').trim();

  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  const meaningful = words.filter(isMeaningfulWord);
  if (!meaningful.length) return '';
  if (meaningful.length === 1) {
    if (!allowSingleWord) return '';
    if (meaningful[0].length < 4) return '';
  }

  cleaned = cleaned
    .replace(/\b(activity|answer|answers|assignment|assignments|classwork|discussion|essay|exam|guide|homework|lab|notes|outline|packet|practice|problem|problems|project|quiz|reading|readings|response|review|sheet|study|submission|test|worksheet|workshop|writeup|question|questions|task|tasks)\b$/ig, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned
    .replace(/^(and|or|of|to|for|with|in|on)\s+/i, '')
    .replace(/\s+(and|or|of|to|for|with|in|on)$/i, '')
    .trim();

  if (!cleaned) return '';
  const finalWords = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  const finalMeaningful = finalWords.filter(isMeaningfulWord);
  if (!finalMeaningful.length) return '';
  if (finalMeaningful.length === 1 && finalMeaningful[0].length < 4) return '';
  return titleCase(cleaned.toLowerCase());
}

function isAdministrativeTopicLabel(label, courseName = '') {
  const normalized = toSentence(label).toLowerCase();
  if (!normalized) return true;
  if (courseName && slugify(normalized) === slugify(courseName)) return true;
  if (isVagueLabel(label)) return true;
  return ADMIN_TOPIC_PATTERNS.some(pattern => pattern.test(normalized));
}

function extractHeadingTopics(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const topics = [];
  for (const line of lines) {
    if (/^(unit|chapter|topic|lesson|week)\b/i.test(line)) {
      const cleaned = cleanTopicLabel(line, { allowSingleWord: true });
      if (cleaned.length >= 4) topics.push(cleaned);
      continue;
    }
    if (/^[A-Z][A-Za-z0-9 ,:&()'/-]{4,80}$/.test(line) && !/[.!?]$/.test(line)) {
      const cleaned = cleanTopicLabel(line, { allowSingleWord: true });
      if (cleaned) topics.push(cleaned);
    }
  }

  return uniqueByLabel(topics.map(label => ({ label })));
}

function extractEnumeratedTopics(text) {
  const sentences = String(text || '')
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map(line => line.trim())
    .filter(Boolean);

  const teachingRegex = /\b(topic|topics|concept|concepts|cover|covered|focus|focused|explain|explained|compare|compared|review|reviewed|learn|learned|include|includes|including|discuss|discussed|practice|practiced|introduced)\b/i;
  const topicLeadRegex = /^.*\b(topic|topics|concept|concepts|cover(?:ed)?|focus(?:ed)?(?: on)?|explain(?:ed)?|compare(?:d)?|review(?:ed)?|learn(?:ed)?|include(?:s|d|ing)?|discuss(?:ed)?|practice(?:d)?|introduced)\b[:\-\s]*/i;

  const topics = [];
  for (const sentence of sentences) {
    if (!teachingRegex.test(sentence)) continue;
    const fragments = sentence.split(/,|;|\band\b|\bor\b/ig);
    for (const fragment of fragments) {
      const cleaned = cleanTopicLabel(fragment.replace(topicLeadRegex, ''), { allowSingleWord: true });
      if (cleaned) topics.push({ label: cleaned });
    }
  }

  return uniqueByLabel(topics);
}

function extractSpecialPhraseTopics(text) {
  const sourceText = String(text || '');
  const lower = sourceText.toLowerCase();
  const topics = [];

  if (/\bde\s+facto\b/.test(lower) && /\bde\s+jure\b/.test(lower)) {
    topics.push({ label: 'De Facto Vs De Jure' });
  }

  const matches = sourceText.match(/\bde\s+(facto|jure)\b/ig) || [];
  matches.forEach((match) => {
    const label = cleanTopicLabel(match, { allowSingleWord: true });
    if (label) topics.push({ label });
  });

  return uniqueByLabel(topics);
}

function extractConceptPhrases(text, limit = 5) {
  const segments = String(text || '')
    .split(/\r?\n|[.!?;:]+/)
    .map(segment => segment.trim())
    .filter(Boolean);

  const counts = new Map();

  function addCandidate(phraseWords, meaningfulCount) {
    const label = cleanTopicLabel(phraseWords.join(' '), { allowSingleWord: meaningfulCount === 1 });
    if (!label) return;
    if (meaningfulCount === 1 && label.length < 6) return;
    const key = label.toLowerCase();
    const bonus = meaningfulCount >= 3 ? 5 : (meaningfulCount === 2 ? 3 : 1);
    counts.set(key, {
      label,
      score: (counts.get(key)?.score || 0) + bonus,
    });
  }

  for (const segment of segments) {
    const tokens = (segment.toLowerCase().match(/[a-z][a-z0-9'-]*/g) || []);
    for (let i = 0; i < tokens.length; i += 1) {
      if (!isMeaningfulWord(tokens[i])) continue;

      const phraseWords = [];
      let meaningfulCount = 0;

      for (let j = i; j < Math.min(tokens.length, i + 5); j += 1) {
        const token = tokens[j];

        if (PHRASE_CONNECTORS.has(token)) {
          if (meaningfulCount === 0 || j === tokens.length - 1) break;
          phraseWords.push(token);
          continue;
        }

        if (!isMeaningfulWord(token)) break;

        phraseWords.push(token);
        meaningfulCount += 1;
        addCandidate(phraseWords, meaningfulCount);

        if (meaningfulCount >= 3) break;
      }
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(item => ({ label: item.label }));
}

function extractKeywordTopics(text, limit = 5) {
  const words = tokenize(text);
  const counts = new Map();
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const phrases = [...counts.entries()]
    .filter(([word, count]) => count >= 2 && word.length >= 5)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => ({ label: word.charAt(0).toUpperCase() + word.slice(1) }));

  return uniqueByLabel(phrases);
}

function buildAssignmentSearchText(assignment) {
  return `${assignment?.name || ''} ${assignment?.description || ''}`.toLowerCase();
}

function buildExtractionText(source) {
  if (!source) return '';
  if (source.sourceType === 'assignment') {
    return String(source?.content || source?.description || '').trim();
  }
  if (source.sourceType === 'announcement') {
    return String(source?.description || source?.content || '').trim();
  }
  return `${source.title || ''}\n${source.text || source.content || source?.description || ''}`.trim();
}

function buildAssignmentFallbackLabel(assignment) {
  return cleanTopicLabel(assignment?.description || '', { allowSingleWord: true });
}

function extractProgressMarkers(text) {
  const markers = [];
  const haystack = String(text || '');
  let match = PROGRESS_MARKER_REGEX.exec(haystack);
  while (match) {
    const type = String(match[1] || '').toLowerCase();
    const value = Number(match[2]);
    if (Number.isFinite(value)) markers.push({ type, value, raw: match[0] });
    match = PROGRESS_MARKER_REGEX.exec(haystack);
  }
  PROGRESS_MARKER_REGEX.lastIndex = 0;
  return markers;
}

function inferAssignmentProgress(assignments = []) {
  const progress = { generic: null };

  for (const assignment of assignments) {
    const markers = extractProgressMarkers(`${assignment?.name || ''}\n${assignment?.description || ''}`);
    for (const marker of markers) {
      progress[marker.type] = Math.max(progress[marker.type] ?? 0, marker.value);
      progress.generic = Math.max(progress.generic ?? 0, marker.value);
    }
  }

  return progress;
}

export function getPacedMaterialEntries(materialEntries = [], assignments = []) {
  const progress = inferAssignmentProgress(assignments);
  const hasProgressMarkers = Object.values(progress).some(value => Number.isFinite(value));
  if (!hasProgressMarkers) return [...materialEntries];

  return materialEntries.filter((entry) => {
    if (entry?.kind !== 'textbook') return true;

    const markers = extractProgressMarkers(`${entry?.title || ''}\n${entry?.pageReference || ''}\n${(entry?.text || entry?.content || '').slice(0, 5000)}`);
    if (markers.length === 0) return true;

    return markers.every((marker) => {
      const limit = progress[marker.type] ?? progress.generic;
      if (!Number.isFinite(limit)) return true;
      return marker.value <= limit;
    });
  });
}

export function groupAssignmentsByTimeline(assignments = [], now = new Date()) {
  const todayStart = startOfDay(now);
  const lastWeekStart = startOfDay(addDays(todayStart, -7));
  const thisWeekEnd = endOfDay(addDays(todayStart, 7));

  const buckets = [
    { key: 'due-this-week', label: 'Due This Week', items: [] },
    { key: 'last-week', label: 'Last Week', items: [] },
    { key: 'upcoming-later', label: 'Upcoming Later', items: [] },
    { key: 'older-past-due', label: 'Older / Past Due', items: [] },
    { key: 'no-due-date', label: 'No Due Date', items: [] },
  ];

  for (const assignment of assignments) {
    const date = parseDateish(assignment?.date || assignment?.due_at);
    if (!date) {
      buckets[4].items.push(assignment);
      continue;
    }

    if (date >= todayStart && date <= thisWeekEnd) buckets[0].items.push(assignment);
    else if (date >= lastWeekStart && date < todayStart) buckets[1].items.push(assignment);
    else if (date > thisWeekEnd) buckets[2].items.push(assignment);
    else buckets[3].items.push(assignment);
  }

  buckets[0].items.sort((a, b) => parseDateish(a?.date || a?.due_at) - parseDateish(b?.date || b?.due_at));
  buckets[1].items.sort((a, b) => parseDateish(b?.date || b?.due_at) - parseDateish(a?.date || a?.due_at));
  buckets[2].items.sort((a, b) => parseDateish(a?.date || a?.due_at) - parseDateish(b?.date || b?.due_at));
  buckets[3].items.sort((a, b) => parseDateish(b?.date || b?.due_at) - parseDateish(a?.date || a?.due_at));
  buckets[4].items.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  return buckets.filter(bucket => bucket.items.length > 0);
}

function buildTopicSummary(label, source) {
  const sourceText = source?.sourceType === 'assignment'
    ? toSentence(source?.summary || source?.description || source?.content || '')
    : toSentence(source?.summary || source?.text || source?.content || source?.description || source?.title || '');
  if (!sourceText) return `Key ideas, explanations, and examples connected to ${label}.`;
  const firstSentence = sourceText.split(/(?<=[.!?])\s+/)[0]?.trim() || sourceText;
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence;
}

function countOverlap(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const other = new Set(b);
  return a.filter(item => other.has(item)).length;
}

function uniqueIds(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueItemsByKey(items = [], getKey) {
  const map = new Map();
  items.forEach((item) => {
    if (!item) return;
    const key = getKey(item);
    if (!key || map.has(key)) return;
    map.set(key, item);
  });
  return [...map.values()];
}

function getTopicConnectionStrength(left, right) {
  if (!left || !right) return 0;
  const leftStrength = (left.connections || []).find(connection => connection.targetId === right.id)?.strength || 0;
  const rightStrength = (right.connections || []).find(connection => connection.targetId === left.id)?.strength || 0;
  return Math.max(leftStrength, rightStrength, 0);
}

function getTopicBreadthScore(topic) {
  const sourceBreadth = new Set(topic?.sourceTypes || []).size;
  return ((topic?.evidenceScore || 0) * 4) + (sourceBreadth * 3) - countWords(topic?.label);
}

function compareTopicBreadth(left, right) {
  const breadthDiff = getTopicBreadthScore(left) - getTopicBreadthScore(right);
  if (breadthDiff !== 0) return breadthDiff;
  const wordDiff = countWords(right?.label) - countWords(left?.label);
  if (wordDiff !== 0) return wordDiff;
  return String(right?.label || '').localeCompare(String(left?.label || ''));
}

function getHierarchyCandidateScore(parent, child) {
  if (!parent || !child || parent.id === child.id) return -Infinity;
  if (compareTopicBreadth(parent, child) <= 0) return -Infinity;

  const parentLabel = String(parent.label || '').toLowerCase();
  const childLabel = String(child.label || '').toLowerCase();
  const parentWords = countWords(parent.label);
  const childWords = countWords(child.label);
  const parentTokens = tokenize(parent.label);
  const childTokens = tokenize(child.label);
  const sharedTokens = countOverlap(parentTokens, childTokens);
  const connectionStrength = getTopicConnectionStrength(parent, child);
  const lexicalContainment = parentLabel.length >= 4 && childLabel.includes(parentLabel);
  const sharedCoreTokens = sharedTokens > 0 && parentWords <= childWords;
  const broadConnected = connectionStrength >= 5 && parentWords <= (childWords + 1);

  if (!lexicalContainment && !sharedCoreTokens && !broadConnected) return -Infinity;

  let score = (connectionStrength * 5) + (sharedTokens * 4);
  if (lexicalContainment) score += 8;
  if (sharedCoreTokens) score += 4;
  if (parentWords < childWords) score += 3;
  if (getTopicBreadthScore(parent) > getTopicBreadthScore(child)) score += 3;
  return score;
}

function buildCourseRootTopic(courseName, topicList = []) {
  const transcriptIds = uniqueIds(topicList.flatMap(topic => topic.transcriptIds || []));
  const materialIds = uniqueIds(topicList.flatMap(topic => topic.materialIds || []));
  const courseItemIds = uniqueIds(topicList.flatMap(topic => topic.courseItemIds || []));
  const sourceAssignmentIds = uniqueIds(topicList.flatMap(topic => topic.sourceAssignmentIds || []));
  const seedTopicIds = uniqueIds(topicList.flatMap(topic => topic.seedTopicIds || []));
  const relatedAssignments = uniqueItemsByKey(
    topicList.flatMap(topic => topic.relatedAssignments || []),
    item => `${item.id}`,
  );

  return {
    id: `course-root-${slugify(courseName || 'course') || 'course'}`,
    label: courseName || 'Course',
    summary: topicList.length > 0
      ? `Course map for ${courseName || 'this course'}, organized from broad ideas to more specific concepts.`
      : `Course map for ${courseName || 'this course'}. Add lecture content, materials, and assignments to grow real concepts.`,
    transcriptIds,
    materialIds,
    courseItemIds,
    relatedAssignments,
    sourceAssignmentIds,
    sourceTypes: ['course-root'],
    seedTopicIds,
    connections: [],
    evidenceScore: topicList.length,
    parentId: null,
    isRoot: true,
    level: 0,
  };
}

export function buildCourseCatalog(canvasItems = [], hiddenCourses = [], now = new Date()) {
  const hidden = new Set(hiddenCourses);
  const nowMs = now.getTime();
  const byCourse = new Map();

  for (const item of canvasItems) {
    if (!item?.course_name || hidden.has(item.course_name)) continue;
    const key = getCourseKey(item);
    if (!byCourse.has(key)) {
      byCourse.set(key, {
        key,
        id: item.course_id ?? null,
        name: item.course_name,
        items: [],
        assignments: [],
        announcements: [],
        itemCount: 0,
        assignmentCount: 0,
        upcomingCount: 0,
      });
    }

    const course = byCourse.get(key);
    course.items.push(item);
    course.itemCount += 1;
    if (item.type === 'assignment') {
      course.assignments.push(item);
      course.assignmentCount += 1;
      if (item.date && new Date(item.date).getTime() >= nowMs) course.upcomingCount += 1;
    }
    if (item.type === 'announcement') course.announcements.push(item);
  }

  return [...byCourse.values()]
    .map(course => ({
      ...course,
      assignments: course.assignments.sort((a, b) => (a.date || '').localeCompare(b.date || '')),
      latestDate: course.items.map(item => item.date).filter(Boolean).sort().at(-1) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildCourseWorkspaceSummary(course, workspace = {}, assignments = [], now = new Date()) {
  const transcripts = workspace.transcriptEntries || [];
  const materials = workspace.materialEntries || [];
  const chats = workspace.chats || [];
  const nowMs = now.getTime();
  const upcomingAssignments = assignments.filter(item => item?.date && new Date(item.date).getTime() >= nowMs);
  return {
    courseName: course?.name || workspace?.name || 'Course',
    transcriptCount: transcripts.length,
    materialCount: materials.length,
    chatCount: chats.length,
    assignmentCount: assignments.length,
    upcomingAssignmentCount: upcomingAssignments.length,
  };
}

export function deriveTopicMap({
  courseName = '',
  transcriptEntries = [],
  materialEntries = [],
  assignments = [],
  courseItems = [],
  seedTopics = [],
}) {
  const pacedMaterialEntries = getPacedMaterialEntries(materialEntries, assignments);
  const sources = [
    ...transcriptEntries.map(entry => ({ ...entry, sourceType: 'transcript' })),
    ...pacedMaterialEntries.map(entry => ({ ...entry, sourceType: entry.kind || 'material' })),
    ...courseItems.map(entry => ({
      ...entry,
      title: entry?.title || entry?.name || '',
      content: entry?.content || entry?.description || '',
      description: entry?.description || entry?.content || '',
      sourceType: entry?.sourceType || entry?.type || 'course-item',
    })),
    ...assignments.map(entry => ({
      ...entry,
      title: '',
      content: entry?.description || '',
      description: entry?.description || '',
      assignmentTitle: entry?.name || '',
      sourceType: 'assignment',
    })),
  ];

  const topicMap = new Map();

  function upsertTopic(label, source) {
    const cleaned = String(label || '').trim();
    if (cleaned.length < 3) return;
    if (isAdministrativeTopicLabel(cleaned, courseName) && source?.sourceType !== 'manual') return;
    const id = getTopicKey(cleaned);
    if (!topicMap.has(id)) {
      topicMap.set(id, {
        id,
        label: cleaned,
        summary: buildTopicSummary(cleaned, source),
        transcriptIds: [],
        materialIds: [],
        courseItemIds: [],
        relatedAssignments: [],
        sourceAssignmentIds: [],
        sourceTypes: new Set(),
        seedTopicIds: [],
        connections: [],
        evidenceScore: 0,
        preferredParentId: null,
      });
    }

    const topic = topicMap.get(id);
    topic.sourceTypes.add(source.sourceType || 'topic');
    if ((source?.summary || '').trim() && topic.summary.startsWith('Key ideas, explanations')) {
      topic.summary = String(source.summary).trim();
    }
    if (source.sourceType === 'transcript' && source.id && !topic.transcriptIds.includes(source.id)) topic.transcriptIds.push(source.id);
    if (source.sourceType === 'assignment' && source.id && !topic.sourceAssignmentIds.includes(String(source.id))) topic.sourceAssignmentIds.push(String(source.id));
    if (
      source.sourceType
      && ['announcement', 'page', 'file', 'course-item'].includes(source.sourceType)
      && source.id
      && !topic.courseItemIds.includes(source.id)
    ) {
      topic.courseItemIds.push(source.id);
    }
    if (
      source.sourceType
      && !['transcript', 'assignment', 'course', 'saved-topic', 'manual', 'topic', 'announcement', 'page', 'file', 'course-item'].includes(source.sourceType)
      && source.id
      && !topic.materialIds.includes(source.id)
    ) {
      topic.materialIds.push(source.id);
    }
    if (source.sourceTranscriptId && !topic.transcriptIds.includes(source.sourceTranscriptId)) topic.transcriptIds.push(source.sourceTranscriptId);
    if (source.sourceMaterialId && !topic.materialIds.includes(source.sourceMaterialId)) topic.materialIds.push(source.sourceMaterialId);
    if (source.seedTopicId && !topic.seedTopicIds.includes(source.seedTopicId)) topic.seedTopicIds.push(source.seedTopicId);
    if (source.seedParentId && source.seedParentId !== topic.id) topic.preferredParentId = source.seedParentId;
  }

  for (const topic of seedTopics) {
    upsertTopic(topic?.label || topic?.name, {
      id: topic?.id,
      sourceType: topic?.sourceType || 'saved-topic',
      sourceTranscriptId: topic?.sourceTranscriptId,
      sourceMaterialId: topic?.sourceMaterialId,
      summary: topic?.summary,
      seedTopicId: topic?.id,
      seedParentId: topic?.parentId,
    });
  }

  // Process assignments — prioritize concept from title over description
  for (const source of sources.filter(s => s.sourceType === 'assignment')) {
    const titleConcept = extractConceptFromTitle(source.assignmentTitle);
    if (titleConcept) {
      upsertTopic(titleConcept, source);
    }
    const text = buildExtractionText(source);
    if (text.trim()) {
      const candidates = [
        ...extractSpecialPhraseTopics(text),
        ...extractHeadingTopics(text),
        ...extractEnumeratedTopics(text),
        ...extractConceptPhrases(text, 4),
        ...extractKeywordTopics(text, 2),
      ].filter(c => !isVagueLabel(c.label));
      candidates.slice(0, 4).forEach(candidate => upsertTopic(candidate.label, source));
    }
  }

  // Process non-assignment sources
  for (const source of sources.filter(s => s.sourceType !== 'assignment')) {
    const text = buildExtractionText(source);
    if (!text.trim()) continue;
    const candidates = [
      ...extractSpecialPhraseTopics(text),
      ...extractHeadingTopics(text),
      ...extractEnumeratedTopics(text),
      ...extractConceptPhrases(text, 6),
      ...extractKeywordTopics(text, source.sourceType === 'transcript' ? 3 : 4),
    ].filter(c => !isVagueLabel(c.label));
    candidates.slice(0, 6).forEach(candidate => upsertTopic(candidate.label, source));
  }

  if (topicMap.size === 0) {
    assignments.slice(0, 6).forEach((assignment) => {
      const titleConcept = extractConceptFromTitle(assignment?.name);
      if (titleConcept) {
        upsertTopic(titleConcept, {
          sourceType: 'assignment',
          ...assignment,
          title: '',
          content: assignment?.description || '',
          description: assignment?.description || '',
        });
        return;
      }
      const fallbackLabel = buildAssignmentFallbackLabel(assignment);
      if (!fallbackLabel || isVagueLabel(fallbackLabel)) return;
      upsertTopic(fallbackLabel, {
        sourceType: 'assignment',
        ...assignment,
        title: '',
        content: assignment?.description || '',
        description: assignment?.description || '',
      });
    });
  }

  for (const topic of topicMap.values()) {
    const topicTokens = new Set(tokenize(topic.label));
    const relatedAssignments = assignments.filter((assignment) => {
      if (topic.sourceAssignmentIds.includes(String(assignment?.id))) return true;
      const haystack = buildAssignmentSearchText(assignment);
      return [...topicTokens].some(token => haystack.includes(token));
    });
    topic.relatedAssignments = relatedAssignments.slice(0, 5).map(assignment => ({
      id: assignment.id,
      name: assignment.name,
      date: assignment.date || assignment.due_at || null,
      course_name: assignment.course_name,
      html_url: assignment.html_url || assignment.url || '',
      missing: Boolean(assignment.missing),
      points_possible: assignment.points_possible ?? null,
      score: assignment.score ?? null,
      grade: assignment.grade ?? null,
      description: assignment.description || '',
    }));
    topic.sourceTypes = [...topic.sourceTypes];
    topic.evidenceScore = topic.transcriptIds.length
      + (topic.materialIds.length * 2)
      + topic.relatedAssignments.length
      + topic.courseItemIds.length
      + topic.seedTopicIds.length;
  }

  const topicList = [...topicMap.values()];
  const connectionMap = new Map(topicList.map(topic => [topic.id, []]));

  for (let i = 0; i < topicList.length; i += 1) {
    for (let j = i + 1; j < topicList.length; j += 1) {
      const left = topicList[i];
      const right = topicList[j];
      const sharedTranscripts = countOverlap(left.transcriptIds, right.transcriptIds);
      const sharedMaterials = countOverlap(left.materialIds, right.materialIds);
      const sharedAssignments = countOverlap(
        left.relatedAssignments.map(item => String(item.id)),
        right.relatedAssignments.map(item => String(item.id)),
      );
      const sharedCourseItems = countOverlap(left.courseItemIds, right.courseItemIds);
      const sharedTokens = countOverlap(tokenize(left.label), tokenize(right.label));
      const strength = (sharedTranscripts * 2) + (sharedMaterials * 3) + (sharedAssignments * 2) + (sharedCourseItems * 2) + sharedTokens;

      if (strength < 2) continue;

      connectionMap.get(left.id).push({ targetId: right.id, strength });
      connectionMap.get(right.id).push({ targetId: left.id, strength });
    }
  }

  for (const topic of topicList) {
    topic.connections = (connectionMap.get(topic.id) || [])
      .sort((a, b) => b.strength - a.strength || a.targetId.localeCompare(b.targetId))
      .slice(0, 4);
  }

  const trimmedTopics = topicList
    .sort((a, b) => {
      const scoreA = a.evidenceScore;
      const scoreB = b.evidenceScore;
      return scoreB - scoreA || a.label.localeCompare(b.label);
    })
    .slice(0, 12);

  const rootTopic = buildCourseRootTopic(courseName, trimmedTopics);
  const availableParentIds = new Set([rootTopic.id, ...trimmedTopics.map(topic => topic.id)]);

  trimmedTopics.forEach((topic) => {
    const preferredParentId = topic.preferredParentId
      && availableParentIds.has(topic.preferredParentId)
      && topic.preferredParentId !== topic.id
      ? topic.preferredParentId
      : null;

    if (preferredParentId) {
      topic.parentId = preferredParentId;
      topic.isRoot = false;
      return;
    }

    let bestParentId = rootTopic.id;
    let bestScore = -Infinity;

    trimmedTopics.forEach((candidate) => {
      if (candidate.id === topic.id) return;
      const score = getHierarchyCandidateScore(candidate, topic);
      if (score > bestScore) {
        bestScore = score;
        bestParentId = candidate.id;
      }
    });

    topic.parentId = bestScore >= 12 ? bestParentId : rootTopic.id;
    topic.isRoot = false;
  });

  const levelById = new Map([[rootTopic.id, 0]]);
  function resolveLevel(topicId, depth = 0) {
    if (levelById.has(topicId)) return levelById.get(topicId);
    if (depth > trimmedTopics.length) return 1;
    const topic = trimmedTopics.find(item => item.id === topicId);
    if (!topic) return 1;
    const parentId = topic.parentId && topic.parentId !== topic.id ? topic.parentId : rootTopic.id;
    const parentLevel = parentId === rootTopic.id ? 0 : resolveLevel(parentId, depth + 1);
    const level = parentLevel + 1;
    levelById.set(topicId, level);
    return level;
  }

  trimmedTopics.forEach((topic) => {
    topic.level = resolveLevel(topic.id);
    delete topic.preferredParentId;
  });

  const topLevelTopics = trimmedTopics
    .filter(topic => topic.parentId === rootTopic.id)
    .sort((a, b) => (b.evidenceScore || 0) - (a.evidenceScore || 0) || a.label.localeCompare(b.label));

  rootTopic.connections = topLevelTopics.slice(0, 6).map(topic => ({
    targetId: topic.id,
    strength: Math.max(2, topic.evidenceScore || 1),
  }));

  if (topLevelTopics.length > 0) {
    const overview = topLevelTopics.slice(0, 4).map(topic => topic.label).join(', ');
    rootTopic.summary = `Course map for ${courseName || 'this course'}, organized from broad ideas such as ${overview} into more specific linked concepts.`;
  }

  return [
    rootTopic,
    ...trimmedTopics.sort((a, b) => (a.level || 0) - (b.level || 0) || (b.evidenceScore || 0) - (a.evidenceScore || 0) || a.label.localeCompare(b.label)),
  ];
}

/**
 * Post-process topic labels using K2 AI to validate and refine them into real academic concepts.
 * Returns a Map of oldLabel -> newLabel for any labels that need renaming.
 */
export async function refineTopicLabelsWithAI(topics, courseName, apiKey) {
  if (!apiKey || !topics || topics.length === 0) return new Map();

  const nonRootTopics = topics.filter(t => !t.isRoot);
  if (nonRootTopics.length === 0) return new Map();

  const labelList = nonRootTopics.map(t => t.label);

  const systemPrompt = `You are a curriculum analysis AI. You will be given a list of topic labels derived from a course called "${courseName}".

Your job is to:
1. Check if each label is an actual academic concept that would be taught in this course.
2. If a label is NOT a real concept (e.g. it's an assignment name, a color reference like "Blue Slides", an instruction, a figure number, or administrative text), either:
   a. Replace it with the real academic concept it likely refers to (if you can infer it), OR
   b. Mark it as "REMOVE" if it's not a real concept and you can't infer one.
3. If a label IS a valid concept but could be more precisely named, suggest the better name.
4. Keep labels that are already good academic concepts unchanged.

Respond with ONLY a JSON array of objects: [{"old": "original label", "new": "corrected label or REMOVE"}]
Only include entries that need changes. If all labels are fine, return an empty array [].`;

  const userPrompt = `Course: ${courseName}
Topic labels to validate:
${labelList.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;

  try {
    let fullResponse = '';
    await new Promise((resolve, reject) => {
      import('./api.js').then(({ streamChat }) => {
        streamChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          apiKey,
          (token) => { fullResponse += token; },
          () => resolve(),
          (err) => reject(new Error(err)),
        );
      });
    });

    // Strip thinking tokens
    let cleaned = fullResponse;
    if (cleaned.toLowerCase().includes('</think>')) {
      const parts = cleaned.split(/<\/think>/i);
      cleaned = parts[parts.length - 1];
    }
    cleaned = cleaned.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
    }

    const corrections = JSON.parse(cleaned);
    const renameMap = new Map();
    if (Array.isArray(corrections)) {
      for (const entry of corrections) {
        if (entry?.old && entry?.new) {
          renameMap.set(entry.old, entry.new);
        }
      }
    }
    return renameMap;
  } catch (e) {
    console.warn('K2 topic refinement failed (non-blocking):', e);
    return new Map();
  }
}