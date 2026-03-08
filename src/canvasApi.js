// Canvas LMS API Service
const CANVAS_CORS_PROXY = 'https://corsproxy.io/?';
const CANVAS_PAGE_SIZE = 100;
const CANVAS_MAX_PAGES = 10;
export const CANVAS_CONTEXT_MAX_AGE_MS = 15 * 60 * 1000;
const COURSE_STOP_WORDS = new Set(['grade', 'level', 'ib', 'dp', 'hl', 'sl', 'i', 'ii', '2025-26', '2025', '2026', 'and']);
const COURSE_ALIASES = [
    { queryTerms: ['econ', 'economic', 'economics'], courseTerms: ['econ', 'economic', 'economics'] },
    { queryTerms: ['eng', 'english'], courseTerms: ['eng', 'english', 'literature', 'language', 'lang'] },
    { queryTerms: ['lit', 'literature'], courseTerms: ['lit', 'literature', 'english'] },
    { queryTerms: ['math', 'mathematics'], courseTerms: ['math', 'mathematics', 'mathemat'] },
];
const COURSE_QUERY_TERMS = ['course', 'courses', 'class', 'classes', 'enrolled', 'enrollment', 'schedule', 'subject', 'subjects'];
const ASSIGNMENT_QUERY_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'assignment', 'assignments', 'class', 'course', 'details', 'do', 'due', 'explain',
    'for', 'have', 'help', 'how', 'i', 'instructions', 'is', 'me', 'my', 'next', 'of', 'on', 'tell', 'the',
    'this', 'title', 'to', 'week', 'what', 'when', 'with', 'work'
]);

function buildCanvasProxyUrl(baseUrl, path, params = {}) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item !== undefined && item !== null && item !== '') searchParams.append(key, item);
            });
            return;
        }

        if (value !== undefined && value !== null && value !== '') {
            searchParams.append(key, value);
        }
    });

    const query = searchParams.toString();
    const targetUrl = `${baseUrl}${path}${query ? `?${query}` : ''}`;
    return `${CANVAS_CORS_PROXY}${encodeURIComponent(targetUrl)}`;
}

async function fetchCanvasCollection(canvasUrl, apiToken, path, params = {}, { failSoft = false } = {}) {
    const baseUrl = canvasUrl.replace(/\/+$/, '');
    const allItems = [];

    for (let page = 1; page <= CANVAS_MAX_PAGES; page++) {
        const url = buildCanvasProxyUrl(baseUrl, path, { ...params, per_page: CANVAS_PAGE_SIZE, page });
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
            },
        });

        if (!response.ok) {
            if (failSoft) {
                if (page === 1) return [];
                break;
            }
            throw new Error(`Canvas API Error: ${response.status} ${response.statusText}`);
        }

        const pageItems = await response.json();
        if (!Array.isArray(pageItems)) {
            return page === 1 ? pageItems : allItems;
        }

        allItems.push(...pageItems);
        if (pageItems.length < CANVAS_PAGE_SIZE) break;
    }

    return allItems;
}

export function parseCanvasDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? null : date;
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

function getRelevantCanvasDate(item) {
    return item?.due_at || item?.date || null;
}

function getEffectiveAssignmentDueDate(assignment) {
    if (!assignment) return null;

    const overrideDue = assignment.all_dates?.find(date => date?.due_at)?.due_at
        || assignment.overrides?.find(override => override?.due_at)?.due_at
        || null;

    return assignment.due_at || overrideDue || assignment.all_day_date || null;
}

function extractCourseIdFromUrl(url) {
    if (typeof url !== 'string') return null;
    const match = url.match(/\/courses\/([0-9]+)/i);
    if (!match) return null;

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}

function resolveCanvasCourseId(item) {
    const directCourseId = item?.course_id
        ?? item?.assignment?.course_id
        ?? item?.quiz?.course_id
        ?? item?.submission?.course_id
        ?? item?.submission?.assignment?.course_id
        ?? null;

    if (directCourseId !== null && directCourseId !== undefined) {
        const parsed = Number(directCourseId);
        return Number.isFinite(parsed) ? parsed : directCourseId;
    }

    return extractCourseIdFromUrl(item?.html_url)
        ?? extractCourseIdFromUrl(item?.assignment?.html_url)
        ?? extractCourseIdFromUrl(item?.quiz?.html_url)
        ?? extractCourseIdFromUrl(item?.submission?.html_url)
        ?? extractCourseIdFromUrl(item?.submission?.assignment?.html_url)
        ?? null;
}

function buildCourseNameLookups(courses = []) {
    const byId = new Map();
    const byContextCode = new Map();

    courses.forEach(course => {
        if (!course || course.id === undefined || course.id === null) return;
        byId.set(course.id, course.name);
        byContextCode.set(`course_${course.id}`, course.name);
    });

    return { byId, byContextCode };
}

function isCurrentCanvasCourse(course) {
    const workflowState = `${course?.workflow_state || ''}`.toLowerCase();
    return ['available', 'active', 'invited'].includes(workflowState);
}

function resolveCanvasCourseName(item, courseLookups) {
    const courseId = resolveCanvasCourseId(item);
    const contextCode = item?.context_code || (courseId !== null ? `course_${courseId}` : null);

    return courseLookups.byId.get(courseId)
        || (contextCode ? courseLookups.byContextCode.get(contextCode) : null)
        || item?.course_name
        || item?.assignment?.course_name
        || item?.quiz?.course_name
        || item?.submission?.assignment?.course_name
        || item?.course?.name
        || item?.assignment?.course?.name
        || item?.submission?.assignment?.course?.name
        || item?.context_name
        || 'Unknown Course';
}

function normalizeCourseRosterItem(course) {
    const termName = course?.term?.name ? `Term: ${course.term.name}` : null;
    const stateLabel = course?.workflow_state ? `State: ${course.workflow_state}` : null;
    const studentCount = Number.isFinite(course?.total_students) ? `Students: ${course.total_students}` : null;
    const description = [termName, stateLabel, studentCount].filter(Boolean).join(' · ') || 'Canvas course';

    return normalizeCanvasItem({
        type: 'course',
        id: `course_${course.id}`,
        name: course.name,
        description,
        date: null,
        due_at: null,
        course_id: course.id,
        course_name: course.name,
        html_url: course.html_url || null,
        source: 'course',
    });
}

function isCourseListQuery(userInputLower) {
    return COURSE_QUERY_TERMS.some(term => userInputLower.includes(term));
}

function buildDerivedCourseItems(items) {
    const courseMap = new Map();

    items.forEach(item => {
        const courseName = item?.course_name;
        if (!courseName || courseMap.has(courseName)) return;

        courseMap.set(courseName, normalizeCanvasItem({
            type: 'course',
            id: `derived_course:${courseName}`,
            name: courseName,
            description: 'Canvas course',
            date: null,
            due_at: null,
            course_id: item?.course_id ?? null,
            course_name: courseName,
            source: 'derived_course',
        }));
    });

    return [...courseMap.values()];
}

export function normalizeCanvasItem(item) {
    const normalizedDate = getRelevantCanvasDate(item);
    return {
        ...item,
        date: normalizedDate,
        due_at: item?.due_at || normalizedDate,
    };
}

export function shouldRefreshCanvasContext(canvasItems, canvasLastUpdated, now = Date.now()) {
    const normalizedItems = Array.isArray(canvasItems)
        ? canvasItems.map(normalizeCanvasItem)
        : [];

    if (normalizedItems.length === 0) return true;

    if (!canvasLastUpdated) return true;

    const lastUpdatedTs = typeof canvasLastUpdated === 'number'
        ? canvasLastUpdated
        : Number(canvasLastUpdated);

    if (!Number.isFinite(lastUpdatedTs)) return true;
    if (now - lastUpdatedTs > CANVAS_CONTEXT_MAX_AGE_MS) return true;

    const hasCourseItems = normalizedItems.some(item => item.type === 'course');
    if (!hasCourseItems) return true;

    const assignments = normalizedItems.filter(item => item.type === 'assignment');
    if (assignments.length === 0) return false;

    const everyAssignmentMissingDate = assignments.every(item => !parseCanvasDate(item.due_at || item.date));
    return everyAssignmentMissingDate;
}

export function filterCanvasHubItems(canvasItems, {
    hiddenCourses = [],
    tab = 'all',
    course = 'all',
    search = '',
    dateFrom = '',
    dateTo = '',
} = {}) {
    const normalizedSearch = search.trim().toLowerCase();
    const hasDateFilter = Boolean(dateFrom || dateTo);
    const hasDetailFilters = course !== 'all' || normalizedSearch.length > 0 || hasDateFilter;

    return (Array.isArray(canvasItems) ? canvasItems : [])
        .map(normalizeCanvasItem)
        .filter(item => {
            const itemDate = parseCanvasDate(item.date);

            if (hiddenCourses.includes(item.course_name)) return false;
            if (tab !== 'all' && item.type !== tab) return false;
            if (hasDetailFilters && item.type === 'course') return false;
            if (course !== 'all' && item.course_name !== course) return false;
            if (normalizedSearch && !(item.name || '').toLowerCase().includes(normalizedSearch)) return false;

            if (dateFrom) {
                if (!itemDate || itemDate < new Date(`${dateFrom}T00:00:00`)) return false;
            }

            if (dateTo) {
                if (!itemDate || itemDate > new Date(`${dateTo}T23:59:59`)) return false;
            }

            return true;
        })
        .sort((a, b) => {
            const now = new Date();
            const dateA = parseCanvasDate(a.date);
            const dateB = parseCanvasDate(b.date);
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            const isPastA = dateA < now;
            const isPastB = dateB < now;

            if (!isPastA && !isPastB) return dateA - dateB;
            if (!isPastA && isPastB) return -1;
            if (isPastA && !isPastB) return 1;
            return dateB - dateA;
        });
}

function courseMatchesQuery(courseName, userInputLower) {
    if (!courseName) return false;

    const courseLower = courseName.toLowerCase();
    if (userInputLower.includes(courseLower)) return true;

    const meaningfulWords = courseLower
        .split(/[\s:-]+/)
        .filter(word => word.length > 2 && !COURSE_STOP_WORDS.has(word));

    if (meaningfulWords.some(word => userInputLower.includes(word) || word.includes(userInputLower))) {
        return true;
    }

    return COURSE_ALIASES.some(({ queryTerms, courseTerms }) => {
        const askedForAlias = queryTerms.some(term => userInputLower.includes(term));
        return askedForAlias && courseTerms.some(term => courseLower.includes(term));
    });
}

function normalizeSearchText(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getMeaningfulSearchTerms(text) {
    return normalizeSearchText(text)
        .split(/\s+/)
        .filter(term => term && (term.length > 1 || /[0-9]/.test(term)) && !ASSIGNMENT_QUERY_STOP_WORDS.has(term));
}

function getAssignmentQueryScore(item, userInputLower) {
    if (item?.type !== 'assignment' || !item?.name) return 0;

    const normalizedQuery = normalizeSearchText(userInputLower);
    const normalizedName = normalizeSearchText(item.name);
    if (!normalizedQuery || !normalizedName) return 0;

    if (normalizedQuery.includes(normalizedName)) return 400;
    if (normalizedName.includes(normalizedQuery) && normalizedQuery.length >= 6) return 260;

    const itemTerms = getMeaningfulSearchTerms(item.name);
    const queryTerms = getMeaningfulSearchTerms(userInputLower);
    if (itemTerms.length === 0 || queryTerms.length === 0) return 0;

    const queryTermSet = new Set(queryTerms);
    const matchingTerms = itemTerms.filter(term => queryTermSet.has(term));
    if (matchingTerms.length === 0) return 0;

    const numericMatches = matchingTerms.filter(term => /[0-9]/.test(term)).length;
    const coverage = matchingTerms.length / itemTerms.length;

    let score = (matchingTerms.length * 35) + (numericMatches * 45);
    if (coverage >= 0.8 && matchingTerms.length >= 2) score += 180;
    else if (coverage >= 0.5 && matchingTerms.length >= 2) score += 100;
    if (queryTerms.length <= itemTerms.length + 3 && coverage >= 0.5) score += 40;

    return score;
}

export function selectCanvasContextItems(canvasItems, userInput, hiddenCourses = [], now = new Date()) {
    const userInputLower = userInput.toLowerCase();
    const wantsCourseList = isCourseListQuery(userInputLower);
    const wantsMissing = userInputLower.includes('missing') || userInputLower.includes('past due') || userInputLower.includes('overdue');
    const wantsThisWeek = userInputLower.includes('this week');
    const wantsNextWeek = userInputLower.includes('next week');
    const wantsAssignmentsOnly = ['assignment', 'assignments', 'homework', 'worksheet', 'essay', 'reading', 'work', 'quiz', 'test', 'exam', 'project'].some(term => userInputLower.includes(term));
    const todayStart = startOfDay(now);
    const recentWeekStart = startOfDay(addDays(todayStart, -7));
    const thisWeekEnd = endOfDay(addDays(todayStart, 7));
    const nextWeekStart = startOfDay(addDays(todayStart, 7));
    const nextWeekEnd = endOfDay(addDays(todayStart, 14));

    let filteredItems = canvasItems
        .map(normalizeCanvasItem)
        .filter(item => !hiddenCourses.includes(item.course_name));

    const courseNames = [...new Set(filteredItems.map(item => item.course_name).filter(Boolean))];
    const mentionedCourses = courseNames.filter(course => courseMatchesQuery(course, userInputLower));

    if (mentionedCourses.length > 0) {
        filteredItems = filteredItems.filter(item => mentionedCourses.includes(item.course_name));
    }

    if (wantsCourseList) {
        const courseItems = filteredItems.filter(item => item.type === 'course');
        const rosterItems = (courseItems.length > 0 ? courseItems : buildDerivedCourseItems(filteredItems))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map((item, index) => ({
                ...item,
                score: 1000 - index,
                isPast: false,
                isThisWeek: false,
                isNextWeek: false,
            }));

        return rosterItems.slice(0, 20);
    }

    const specificAssignmentMatches = filteredItems
        .filter(item => item.type === 'assignment')
        .map(item => ({ ...item, queryMatchScore: getAssignmentQueryScore(item, userInputLower) }))
        .filter(item => item.queryMatchScore >= 150)
        .sort((a, b) => b.queryMatchScore - a.queryMatchScore);

    const hasSpecificAssignmentMatch = specificAssignmentMatches.length > 0;
    if (hasSpecificAssignmentMatch) {
        filteredItems = specificAssignmentMatches;
    }

    if (wantsAssignmentsOnly) {
        const assignmentsOnly = filteredItems.filter(item => item.type === 'assignment');
        if (assignmentsOnly.length > 0) filteredItems = assignmentsOnly;
    }

    filteredItems = filteredItems.map(item => {
        const itemDate = parseCanvasDate(item.date);
        const timestamp = itemDate?.getTime() ?? null;
        const isPast = timestamp !== null && timestamp < todayStart.getTime();
        const isRecentThisWeek = timestamp !== null && timestamp >= recentWeekStart.getTime() && timestamp < todayStart.getTime();
        const isThisWeek = timestamp !== null && timestamp >= todayStart.getTime() && timestamp <= thisWeekEnd.getTime();
        const isNextWeek = timestamp !== null && timestamp >= nextWeekStart.getTime() && timestamp <= nextWeekEnd.getTime();
        const queryMatchScore = item.queryMatchScore ?? getAssignmentQueryScore(item, userInputLower);

        let score = item.type === 'assignment' ? 20 : 0;
        if (wantsAssignmentsOnly && item.type === 'assignment') score += 80;
        if (queryMatchScore > 0) score += queryMatchScore;

        if (timestamp === null) {
            score += item.type === 'assignment' ? 15 : 5;
        } else if (isThisWeek || isNextWeek) {
            score += 150;
        } else if (wantsThisWeek && isRecentThisWeek) {
            score += 110;
        } else if (!isPast) {
            score += 40;
        } else if (wantsMissing) {
            score += 90;
        } else {
            score -= 100;
        }

        if (wantsMissing && item.missing) score += 120;

        return { ...item, score, isPast, isRecentThisWeek, isThisWeek, isNextWeek, queryMatchScore };
    });

    if (!wantsMissing && !hasSpecificAssignmentMatch && !wantsThisWeek) {
        filteredItems = filteredItems.filter(item => !item.isPast);
    }

    if (wantsThisWeek && !hasSpecificAssignmentMatch) {
        const thisWeekItems = filteredItems.filter(item => item.isThisWeek);
        if (thisWeekItems.length > 0) {
            filteredItems = thisWeekItems;
        } else {
            const recentThisWeekItems = filteredItems.filter(item => item.isRecentThisWeek);
            if (recentThisWeekItems.length > 0) filteredItems = recentThisWeekItems;
            else if (!wantsMissing) filteredItems = filteredItems.filter(item => !item.isPast);
        }
    } else if (wantsNextWeek && !hasSpecificAssignmentMatch) {
        if (!wantsMissing) filteredItems = filteredItems.filter(item => !item.isPast);
        const nextWeekItems = filteredItems.filter(item => item.isNextWeek);
        if (nextWeekItems.length > 0) filteredItems = nextWeekItems;
    }

    filteredItems.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        const dateA = parseCanvasDate(a.date);
        const dateB = parseCanvasDate(b.date);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
    });

    return filteredItems.slice(0, 20);
}

export async function fetchCanvasCourses(canvasUrl, apiToken) {
    // 1. Fetch user's favorite courses (usually perfectly represents their current dashboard)
    let favorites = [];
    try {
        favorites = await fetchCanvasCollection(canvasUrl, apiToken, '/api/v1/users/self/favorites/courses', {
            'include[]': ['term']
        }, { failSoft: true });
    } catch (e) {
        console.warn('Failed to fetch favorite courses', e);
    }

    // 2. Fetch all active/invited courses (Excludes 'completed' to avoid last year's courses)
    const courses = await fetchCanvasCollection(canvasUrl, apiToken, '/api/v1/courses', {
        'enrollment_state[]': ['active', 'invited'],
        'include[]': ['term', 'total_students'],
        per_page: 100,
    });

    const currentFavorites = favorites.filter(isCurrentCanvasCourse);

    // Merge current favorites and active courses without duplicates
    const allCoursesMap = new Map();
    [...currentFavorites, ...courses].forEach(c => {
        if (c && c.id && !allCoursesMap.has(c.id)) {
            allCoursesMap.set(c.id, c);
        }
    });

    const finalCourses = Array.from(allCoursesMap.values());
    console.log(`[SchoolAI Canvas] fetchCanvasCourses returned ${finalCourses.length} unique current courses (Favorites + Active)`);
    finalCourses.forEach(c => {
        console.log(`[SchoolAI Canvas]   Course ID ${c.id}: "${c.name}" | state: ${c.workflow_state} | term: ${c.term?.name || 'N/A'}`);
    });

    return finalCourses;
}

export async function fetchCanvasAssignments(canvasUrl, apiToken, courseId) {
    return fetchCanvasCollection(canvasUrl, apiToken, `/api/v1/courses/${courseId}/assignments`, {
        order_by: 'due_at',
        'include[]': ['all_dates', 'overrides'],
    }, { failSoft: true });
}

export async function fetchCanvasUpcomingEvents(canvasUrl, apiToken) {
    return fetchCanvasCollection(canvasUrl, apiToken, '/api/v1/users/self/upcoming_events', {}, { failSoft: true });
}

export async function fetchCanvasTodoItems(canvasUrl, apiToken) {
    return fetchCanvasCollection(canvasUrl, apiToken, '/api/v1/users/self/todo', {
        'include[]': ['ungraded_quizzes'],
    }, { failSoft: true });
}

export async function fetchCanvasMissingSubmissions(canvasUrl, apiToken) {
    return fetchCanvasCollection(canvasUrl, apiToken, '/api/v1/users/self/missing_submissions', {}, { failSoft: true });
}

export async function fetchCanvasActivityStream(canvasUrl, apiToken) {
    return fetchCanvasCollection(canvasUrl, apiToken, '/api/v1/users/self/activity_stream', {
        only_active_courses: true,
    }, { failSoft: true });
}

export async function fetchCanvasAnnouncements(canvasUrl, apiToken, courseCodes) {
    if (!courseCodes || courseCodes.length === 0) return [];
    return fetchCanvasCollection(canvasUrl, apiToken, '/api/v1/announcements', {
        'context_codes[]': courseCodes.map(id => `course_${id}`),
    }, { failSoft: true });
}

export async function fetchCanvasFiles(canvasUrl, apiToken, courseId) {
    return fetchCanvasCollection(canvasUrl, apiToken, `/api/v1/courses/${courseId}/files`, {
        sort: 'created_at',
        order: 'desc',
    }, { failSoft: true });
}

export async function fetchCanvasPages(canvasUrl, apiToken, courseId) {
    return fetchCanvasCollection(canvasUrl, apiToken, `/api/v1/courses/${courseId}/pages`, {
        sort: 'created_at',
        order: 'desc',
    }, { failSoft: true });
}

function normalizeCourseAssignmentItem(course, assignment) {
    const effectiveDue = getEffectiveAssignmentDueDate(assignment);

    return normalizeCanvasItem({
        type: 'assignment',
        id: assignment.id,
        name: assignment.name,
        description: assignment.description ? stripHtml(assignment.description) : 'No description',
        date: effectiveDue || assignment.lock_at || assignment.unlock_at || null,
        due_at: effectiveDue,
        course_id: course.id,
        course_name: course.name,
        points_possible: assignment.points_possible,
        html_url: assignment.html_url,
        source: 'course_assignment',
    });
}

function normalizeUpcomingEventItem(event, courseLookups) {
    if (!event?.assignment) return null;

    const assignment = event.assignment;
    const effectiveDue = getEffectiveAssignmentDueDate(assignment);

    return normalizeCanvasItem({
        type: 'assignment',
        id: assignment.id ?? event.id,
        name: assignment.name || event.title,
        description: assignment.description ? stripHtml(assignment.description) : (event.description ? stripHtml(event.description) : 'No description'),
        date: effectiveDue || event.start_at || event.end_at || event.all_day_date || null,
        due_at: effectiveDue || event.start_at || event.all_day_date || null,
        course_id: assignment.course_id ?? event.course_id ?? null,
        course_name: resolveCanvasCourseName(event, courseLookups),
        points_possible: assignment.points_possible,
        html_url: assignment.html_url || event.html_url,
        source: 'upcoming_event',
    });
}

function normalizeTodoItem(todoItem, courseLookups) {
    const workItem = todoItem?.assignment || todoItem?.quiz;
    if (!workItem) return null;

    const effectiveDue = getEffectiveAssignmentDueDate(workItem);
    const courseId = resolveCanvasCourseId(todoItem) ?? resolveCanvasCourseId(workItem);

    return normalizeCanvasItem({
        type: 'assignment',
        id: workItem.id ?? todoItem.id,
        name: workItem.name || workItem.title || todoItem.title || 'Canvas To-Do',
        description: workItem.description ? stripHtml(workItem.description) : (todoItem.description ? stripHtml(todoItem.description) : 'No description'),
        date: effectiveDue || todoItem.start_at || todoItem.end_at || null,
        due_at: effectiveDue || todoItem.end_at || todoItem.start_at || null,
        course_id: courseId,
        course_name: resolveCanvasCourseName(todoItem, courseLookups),
        points_possible: workItem.points_possible,
        html_url: workItem.html_url || todoItem.html_url,
        source: 'todo',
    });
}

function normalizeMissingSubmissionItem(missingItem, courseLookups) {
    const assignment = missingItem?.assignment || missingItem;
    if (!assignment) return null;

    const effectiveDue = getEffectiveAssignmentDueDate(assignment)
        || missingItem?.cached_due_date
        || missingItem?.due_at
        || null;
    const courseId = resolveCanvasCourseId(missingItem) ?? resolveCanvasCourseId(assignment);

    return normalizeCanvasItem({
        type: 'assignment',
        id: assignment?.id ?? missingItem?.assignment_id ?? missingItem?.id,
        name: assignment?.name || missingItem?.title || 'Missing submission',
        description: assignment?.description
            ? stripHtml(assignment.description)
            : (missingItem?.description ? stripHtml(missingItem.description) : 'Missing submission'),
        date: effectiveDue,
        due_at: effectiveDue,
        course_id: courseId,
        course_name: resolveCanvasCourseName(missingItem, courseLookups),
        points_possible: assignment?.points_possible ?? null,
        html_url: assignment?.html_url || missingItem?.html_url || null,
        source: 'missing_submission',
        missing: true,
    });
}

function normalizeActivityStreamItem(streamItem, courseLookups) {
    const assignment = streamItem?.assignment || streamItem?.submission?.assignment || null;
    const isSubmissionItem = streamItem?.type === 'Submission';
    if (!assignment && !isSubmissionItem) return null;

    const effectiveDue = getEffectiveAssignmentDueDate(assignment)
        || getEffectiveAssignmentDueDate(streamItem)
        || streamItem?.due_at
        || streamItem?.assignment_due_at
        || null;

    return normalizeCanvasItem({
        type: 'assignment',
        id: assignment?.id ?? streamItem?.assignment_id ?? streamItem?.id,
        name: assignment?.name || streamItem?.title || 'Canvas Activity',
        description: assignment?.description
            ? stripHtml(assignment.description)
            : (streamItem?.message ? stripHtml(streamItem.message) : 'No description'),
        date: effectiveDue,
        due_at: effectiveDue,
        course_id: resolveCanvasCourseId(streamItem) ?? resolveCanvasCourseId(assignment),
        course_name: resolveCanvasCourseName(streamItem, courseLookups),
        points_possible: assignment?.points_possible ?? null,
        html_url: assignment?.html_url || streamItem?.html_url || null,
        source: 'activity_stream',
    });
}

function getCanvasItemKey(item) {
    if (item?.type === 'course') {
        if (item.course_id !== undefined && item.course_id !== null) return `course:${item.course_id}`;
        if (item.course_name) return `course:${item.course_name}`;
    }

    if (item?.type === 'assignment') {
        if (item.course_id !== undefined && item.course_id !== null && item.id !== undefined && item.id !== null) {
            return `assignment:${item.course_id}:${item.id}`;
        }
        if (item.html_url) return `assignment:${item.html_url}`;
        if (item.id !== undefined && item.id !== null) return `assignment:${item.id}`;
    }

    return `${item?.type || 'item'}:${item?.html_url || item?.url || item?.id || item?.name || Math.random()}`;
}

function getCanvasItemPriority(item) {
    let score = 0;

    if (item?.source === 'activity_stream') score += 45;
    else if (item?.source === 'missing_submission') score += 42;
    else if (item?.source === 'upcoming_event') score += 40;
    else if (item?.source === 'todo') score += 35;
    else if (item?.source === 'course') score += 30;
    else if (item?.source === 'course_assignment') score += 20;

    if (parseCanvasDate(item?.due_at || item?.date)) score += 50;
    if (item?.description && item.description !== 'No description') score += 5;
    if (item?.html_url) score += 5;

    return score;
}

function mergeCanvasItems(existingItem, incomingItem) {
    const preferredItem = getCanvasItemPriority(incomingItem) >= getCanvasItemPriority(existingItem)
        ? incomingItem
        : existingItem;
    const fallbackItem = preferredItem === incomingItem ? existingItem : incomingItem;

    return normalizeCanvasItem({
        ...fallbackItem,
        ...preferredItem,
        description: preferredItem.description && preferredItem.description !== 'No description'
            ? preferredItem.description
            : fallbackItem.description,
        date: preferredItem.date || fallbackItem.date,
        due_at: preferredItem.due_at || fallbackItem.due_at,
        course_id: preferredItem.course_id ?? fallbackItem.course_id,
        course_name: (preferredItem.course_name && preferredItem.course_name !== 'Unknown Course')
            ? preferredItem.course_name
            : fallbackItem.course_name,
        html_url: preferredItem.html_url || fallbackItem.html_url,
        points_possible: preferredItem.points_possible ?? fallbackItem.points_possible,
        missing: preferredItem.missing ?? fallbackItem.missing,
    });
}

function dedupeCanvasItems(items) {
    const itemsByKey = new Map();

    items.forEach(item => {
        if (!item) return;
        const key = getCanvasItemKey(item);
        const existingItem = itemsByKey.get(key);
        itemsByKey.set(key, existingItem ? mergeCanvasItems(existingItem, item) : normalizeCanvasItem(item));
    });

    return [...itemsByKey.values()];
}

export async function fetchAllCanvasData(canvasUrl, apiToken) {
    try {
        const courses = await fetchCanvasCourses(canvasUrl, apiToken);
        const courseIds = new Set(courses.map(c => c.id));
        const courseLookups = buildCourseNameLookups(courses);

        // Fetch announcements for all courses at once (already efficient)
        const announcementsPromise = fetchCanvasAnnouncements(canvasUrl, apiToken, [...courseIds]);
        const upcomingEventsPromise = fetchCanvasUpcomingEvents(canvasUrl, apiToken);
        const todoItemsPromise = fetchCanvasTodoItems(canvasUrl, apiToken);
        const missingSubmissionsPromise = fetchCanvasMissingSubmissions(canvasUrl, apiToken);
        const activityStreamPromise = fetchCanvasActivityStream(canvasUrl, apiToken);

        // Wait for user-level endpoints first to discover missing courses
        const [upcomingEvents, todoItems, missingSubmissions, activityStreamItems] = await Promise.all([
            upcomingEventsPromise,
            todoItemsPromise,
            missingSubmissionsPromise,
            activityStreamPromise,
        ]);

        // Discover course IDs from user-level endpoints that we don't have yet
        const missingCourseIds = new Set();
        [...upcomingEvents, ...todoItems, ...missingSubmissions, ...activityStreamItems].forEach(item => {
            const cid = resolveCanvasCourseId(item) || item?.context_code?.replace('course_', '');
            const numericCourseId = Number(cid);
            if (Number.isFinite(numericCourseId) && !courseIds.has(numericCourseId) && !courseIds.has(String(numericCourseId))) {
                missingCourseIds.add(numericCourseId);
            }
        });

        // Fetch missing courses individually
        if (missingCourseIds.size > 0) {
            console.log(`[SchoolAI Canvas] Found ${missingCourseIds.size} courses in user-level endpoints not in courses list:`, [...missingCourseIds]);
            const missingCoursePromises = [...missingCourseIds].map(async (cid) => {
                try {
                    const url = buildCanvasProxyUrl(canvasUrl.replace(/\/+$/, ''), `/api/v1/courses/${cid}`, {});
                    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}` } });
                    if (res.ok) {
                        const course = await res.json();
                    if (!isCurrentCanvasCourse(course)) return null;
                    console.log(`[SchoolAI Canvas]   Recovered missing course: "${course.name}" (ID: ${course.id})`);
                    return course;
                    }
                } catch (e) {
                    console.warn(`[SchoolAI Canvas] Failed to fetch missing course ${cid}:`, e);
                }
                return null;
            });
            const missingCourses = (await Promise.all(missingCoursePromises)).filter(Boolean);
            missingCourses.forEach(c => {
                courses.push(c);
                courseIds.add(c.id);
                // Update lookups
                courseLookups.byId.set(c.id, c.name);
                courseLookups.byContextCode.set(`course_${c.id}`, c.name);
            });
        }

        // Fetch assignments in parallel for all courses. Files/pages stay lazy to avoid slow
        // Canvas Hub loads and repeated optional-endpoint failures.
        const courseDataPromises = courses.map(async (course) => {
            try {
                const assignments = await fetchCanvasAssignments(canvasUrl, apiToken, course.id);

                return {
                    course,
                    assignments,
                };
            } catch (e) {
                console.warn(`Failed to fetch specific data for course ${course.id}:`, e);
                return { course, assignments: [] };
            }
        });

        const results = await Promise.all([announcementsPromise, ...courseDataPromises]);
        const announcements = results[0];
        const courseResults = results.slice(1);

        const allData = [];

        allData.push(...courses.map(course => normalizeCourseRosterItem(course)));

        // User-level due work endpoints are the authoritative source for what the user sees in Canvas.
        allData.push(...upcomingEvents
            .map(event => normalizeUpcomingEventItem(event, courseLookups))
            .filter(Boolean));

        allData.push(...todoItems
            .map(item => normalizeTodoItem(item, courseLookups))
            .filter(Boolean));

        allData.push(...missingSubmissions
            .map(item => normalizeMissingSubmissionItem(item, courseLookups))
            .filter(Boolean));

        allData.push(...activityStreamItems
            .map(item => normalizeActivityStreamItem(item, courseLookups))
            .filter(Boolean));

        // Add announcements
        allData.push(...announcements.map(a => normalizeCanvasItem({
            type: 'announcement',
            id: a.id,
            name: a.title,
            description: a.message ? stripHtml(a.message) : '',
            date: a.posted_at,
            course_name: courses.find(c => `course_${c.id}` === a.context_code)?.name || 'Unknown Course',
            html_url: a.html_url
        })));

        // Add assignments
        for (const res of courseResults) {
            const course = res.course;

            allData.push(...res.assignments.map(a => normalizeCourseAssignmentItem(course, a)));
        }

        const dedupedData = dedupeCanvasItems(allData);

        // Sort everything by date (newest first)
        dedupedData.sort((a, b) => {
            const dateA = parseCanvasDate(a.date);
            const dateB = parseCanvasDate(b.date);
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateB.getTime() - dateA.getTime();
        });

        return dedupedData;
    } catch (e) {
        throw new Error(`Failed to connect to Canvas: ${e.message}`);
    }
}

function stripHtml(html) {
    if (!html || typeof html !== 'string') return '';

    if (typeof document === 'undefined') {
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

export function formatDueDate(dateStr) {
    if (!dateStr) return 'No due date';
    const date = parseCanvasDate(dateStr);
    if (!date) return 'No due date';
    const now = new Date();
    const diff = date - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return `Overdue by ${Math.abs(days)} days`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days <= 7) return `Due in ${days} days`;
    return `Due ${date.toLocaleDateString()}`;
}

export function isDueOverdue(dateStr) {
    const date = parseCanvasDate(dateStr);
    if (!date) return false;
    return date < new Date();
}
