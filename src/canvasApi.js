// Canvas LMS API Service
const CANVAS_CORS_PROXY = 'https://corsproxy.io/?';

export async function fetchCanvasCourses(canvasUrl, apiToken) {
    const baseUrl = canvasUrl.replace(/\/+$/, '');
    const url = `${CANVAS_CORS_PROXY}${encodeURIComponent(`${baseUrl}/api/v1/courses?enrollment_state=active&per_page=50`)}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${apiToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Canvas API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

export async function fetchCanvasAssignments(canvasUrl, apiToken, courseId) {
    const baseUrl = canvasUrl.replace(/\/+$/, '');
    const url = `${CANVAS_CORS_PROXY}${encodeURIComponent(`${baseUrl}/api/v1/courses/${courseId}/assignments?order_by=due_at&per_page=50`)}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${apiToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Canvas API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

export async function fetchAllAssignments(canvasUrl, apiToken) {
    try {
        const courses = await fetchCanvasCourses(canvasUrl, apiToken);
        const allAssignments = [];

        for (const course of courses) {
            try {
                const assignments = await fetchCanvasAssignments(canvasUrl, apiToken, course.id);
                const enriched = assignments.map(a => ({
                    id: a.id,
                    name: a.name,
                    description: a.description ? stripHtml(a.description) : 'No description available',
                    due_at: a.due_at,
                    course_name: course.name || `Course ${course.id}`,
                    course_id: course.id,
                    points_possible: a.points_possible,
                    html_url: a.html_url,
                    submission_types: a.submission_types,
                }));
                allAssignments.push(...enriched);
            } catch (e) {
                console.warn(`Failed to fetch assignments for course ${course.id}:`, e);
            }
        }

        // Sort by due date (upcoming first)
        allAssignments.sort((a, b) => {
            if (!a.due_at) return 1;
            if (!b.due_at) return -1;
            return new Date(a.due_at) - new Date(b.due_at);
        });

        return allAssignments;
    } catch (e) {
        throw new Error(`Failed to connect to Canvas: ${e.message}`);
    }
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

export function formatDueDate(dateStr) {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
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
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
}
