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

export async function fetchCanvasAnnouncements(canvasUrl, apiToken, courseCodes) {
    if (!courseCodes || courseCodes.length === 0) return [];
    const baseUrl = canvasUrl.replace(/\/+$/, '');
    const contextCodes = courseCodes.map(id => `context_codes[]=course_${id}`).join('&');
    const url = `${CANVAS_CORS_PROXY}${encodeURIComponent(`${baseUrl}/api/v1/announcements?${contextCodes}&per_page=30`)}`;

    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}` } });
    if (!response.ok) return [];
    return response.json();
}

export async function fetchCanvasFiles(canvasUrl, apiToken, courseId) {
    const baseUrl = canvasUrl.replace(/\/+$/, '');
    const url = `${CANVAS_CORS_PROXY}${encodeURIComponent(`${baseUrl}/api/v1/courses/${courseId}/files?per_page=30&sort=created_at&order=desc`)}`;

    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}` } });
    if (!response.ok) return [];
    return response.json();
}

export async function fetchCanvasPages(canvasUrl, apiToken, courseId) {
    const baseUrl = canvasUrl.replace(/\/+$/, '');
    const url = `${CANVAS_CORS_PROXY}${encodeURIComponent(`${baseUrl}/api/v1/courses/${courseId}/pages?per_page=30&sort=created_at&order=desc`)}`;

    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${apiToken}` } });
    if (!response.ok) return [];
    return response.json();
}

export async function fetchAllCanvasData(canvasUrl, apiToken) {
    try {
        const courses = await fetchCanvasCourses(canvasUrl, apiToken);
        const courseIds = courses.map(c => c.id);

        // Fetch announcements for all courses at once (already efficient)
        const announcementsPromise = fetchCanvasAnnouncements(canvasUrl, apiToken, courseIds);

        // Fetch assignments, files, and pages in parallel for ALL courses
        const courseDataPromises = courses.map(async (course) => {
            try {
                const [assignments, files, pages] = await Promise.all([
                    fetchCanvasAssignments(canvasUrl, apiToken, course.id),
                    fetchCanvasFiles(canvasUrl, apiToken, course.id),
                    fetchCanvasPages(canvasUrl, apiToken, course.id)
                ]);

                return {
                    course,
                    assignments,
                    files,
                    pages
                };
            } catch (e) {
                console.warn(`Failed to fetch specific data for course ${course.id}:`, e);
                return { course, assignments: [], files: [], pages: [] };
            }
        });

        const results = await Promise.all([announcementsPromise, ...courseDataPromises]);
        const announcements = results[0];
        const courseResults = results.slice(1);

        const allData = [];

        // Add announcements
        allData.push(...announcements.map(a => ({
            type: 'announcement',
            id: a.id,
            name: a.title,
            description: a.message ? stripHtml(a.message) : '',
            date: a.posted_at,
            course_name: courses.find(c => `course_${c.id}` === a.context_code)?.name || 'Unknown Course',
            html_url: a.html_url
        })));

        // Add assignments, files, and pages
        for (const res of courseResults) {
            const course = res.course;

            // Assignments
            allData.push(...res.assignments.map(a => ({
                type: 'assignment',
                id: a.id,
                name: a.name,
                description: a.description ? stripHtml(a.description) : 'No description',
                date: a.due_at,
                course_name: course.name,
                points_possible: a.points_possible,
                html_url: a.html_url
            })));

            // Files
            allData.push(...res.files.map(f => ({
                type: 'file',
                id: f.id,
                name: f.display_name,
                description: `File type: ${f['content-type'] || 'Unknown'}. Size: ${(f.size / 1024).toFixed(1)} KB`,
                date: f.created_at,
                course_name: course.name,
                url: f.url
            })));

            // Pages
            allData.push(...res.pages.map(p => ({
                type: 'page',
                id: p.page_id || p.url,
                name: p.title,
                description: 'Canvas Page',
                date: p.updated_at,
                course_name: course.name,
                html_url: p.html_url
            })));
        }

        // Sort everything by date (newest first)
        allData.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateB - dateA;
        });

        return allData;
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
