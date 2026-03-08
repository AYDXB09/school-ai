const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being', 'between', 'could', 'during', 'every', 'first', 'from', 'have', 'into', 'lesson', 'might', 'other', 'should', 'their', 'there', 'these', 'thing', 'through', 'under', 'using', 'very', 'what', 'when', 'where', 'which', 'while', 'would', 'your', 'with', 'that', 'this', 'they', 'them', 'then', 'than', 'were', 'been', 'just', 'more', 'some', 'like', 'onto', 'over', 'only', 'such', 'each', 'same', 'many', 'most', 'make', 'made', 'does', 'done', 'into', 'upon', 'will', 'shall', 'must', 'need', 'important', 'class', 'course', 'teacher', 'students', 'student', 'notes', 'context', 'transcript', 'textbook', 'assignment', 'assignments',
]);

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
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

function uniqueByLabel(items) {
  const seen = new Set();
  return items.filter((item) => {
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
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

function extractHeadingTopics(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const topics = [];
  for (const line of lines) {
    if (/^(unit|chapter|topic|lesson|week)\b/i.test(line)) {
      const cleaned = line.replace(/^(unit|chapter|topic|lesson|week)\s*[a-z0-9.-]*\s*[:\-]?\s*/i, '').trim();
      if (cleaned.length >= 4) topics.push(cleaned);
      continue;
    }
    if (/^[A-Z][A-Za-z0-9 ,:&()'/-]{4,80}$/.test(line) && !/[.!?]$/.test(line)) {
      topics.push(line);
    }
  }

  return uniqueByLabel(topics.map(label => ({ label })));
}

function extractKeywordTopics(text, limit = 5) {
  const words = tokenize(text);
  const counts = new Map();
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const phrases = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => ({ label: word.charAt(0).toUpperCase() + word.slice(1) }));

  return uniqueByLabel(phrases);
}

function buildAssignmentSearchText(assignment) {
  return `${assignment?.name || ''} ${assignment?.description || ''}`.toLowerCase();
}

function buildTopicSummary(label, source) {
  const sourceText = toSentence(source?.content || source?.description || source?.title || '');
  if (!sourceText) return `Key ideas, explanations, and examples connected to ${label}.`;
  const firstSentence = sourceText.split(/(?<=[.!?])\s+/)[0]?.trim() || sourceText;
  return firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence;
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

export function deriveTopicMap({ courseName = '', transcriptEntries = [], materialEntries = [], assignments = [] }) {
  const sources = [
    ...transcriptEntries.map(entry => ({ ...entry, sourceType: 'transcript' })),
    ...materialEntries.map(entry => ({ ...entry, sourceType: entry.kind || 'material' })),
  ];

  const topicMap = new Map();

  function upsertTopic(label, source) {
    const cleaned = String(label || '').trim();
    if (cleaned.length < 3) return;
    const id = `topic-${slugify(cleaned)}`;
    if (!topicMap.has(id)) {
      topicMap.set(id, {
        id,
        label: cleaned,
        summary: buildTopicSummary(cleaned, source),
        transcriptIds: [],
        materialIds: [],
        relatedAssignments: [],
        sourceTypes: new Set(),
      });
    }

    const topic = topicMap.get(id);
    topic.sourceTypes.add(source.sourceType);
    if (source.sourceType === 'transcript' && source.id && !topic.transcriptIds.includes(source.id)) topic.transcriptIds.push(source.id);
    if (source.sourceType !== 'transcript' && source.id && !topic.materialIds.includes(source.id)) topic.materialIds.push(source.id);
  }

  for (const source of sources) {
    const text = `${source.title || ''}\n${source.content || ''}`;
    const candidates = [
      ...extractHeadingTopics(text),
      ...extractKeywordTopics(text, source.sourceType === 'transcript' ? 3 : 5),
    ];
    candidates.slice(0, 6).forEach(candidate => upsertTopic(candidate.label, source));
  }

  if (topicMap.size === 0) {
    assignments.slice(0, 6).forEach(assignment => upsertTopic(assignment.name, { sourceType: 'assignment', ...assignment }));
  }

  if (topicMap.size === 0 && courseName) {
    upsertTopic(courseName, { sourceType: 'course', title: courseName, content: '' });
  }

  for (const topic of topicMap.values()) {
    const topicTokens = new Set(tokenize(topic.label));
    const relatedAssignments = assignments.filter((assignment) => {
      const haystack = buildAssignmentSearchText(assignment);
      return [...topicTokens].some(token => haystack.includes(token));
    });
    topic.relatedAssignments = relatedAssignments.slice(0, 5).map(assignment => ({
      id: assignment.id,
      name: assignment.name,
      date: assignment.date || assignment.due_at || null,
      course_name: assignment.course_name,
      html_url: assignment.html_url || assignment.url || '',
    }));
    topic.sourceTypes = [...topic.sourceTypes];
  }

  return [...topicMap.values()]
    .sort((a, b) => {
      const scoreA = a.transcriptIds.length + a.materialIds.length + a.relatedAssignments.length;
      const scoreB = b.transcriptIds.length + b.materialIds.length + b.relatedAssignments.length;
      return scoreB - scoreA || a.label.localeCompare(b.label);
    })
    .slice(0, 12);
}