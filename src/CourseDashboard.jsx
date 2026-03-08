import { useState, useMemo } from 'react';

// ============================================================
// COURSE DASHBOARD — landing page showing all enrolled courses
// ============================================================

const COURSE_COLORS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(135deg, #f5576c 0%, #ff6a88 100%)',
    'linear-gradient(135deg, #667eea 0%, #4facfe 100%)',
];

const CourseIcon = ({ type, size = 24 }) => {
    const icons = {
        econ: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
        ),
        math: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><polyline points="17 2 12 7 7 2" />
            </svg>
        ),
        writing: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
        ),
        science: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 3h15" /><path d="M6 3v16a2 2 0 002 2h8a2 2 0 002-2V3" /><path d="M6 14h12" />
            </svg>
        ),
        history: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
        ),
        art: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.6 1.5-1.5 0-.4-.1-.8-.4-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.8-10-8.8z" />
            </svg>
        ),
        lang: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
            </svg>
        ),
        tech: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
        ),
        health: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
        ),
        default: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
        )
    };

    if (icons[type]) return icons[type];
    return icons.default;
};

const COURSE_KEYWORDS = {
    econ: ['econ', 'economics', 'business'],
    math: ['math', 'mathematics', 'calculus', 'algebra'],
    writing: ['english', 'literature', 'writing', 'lang'],
    science: ['science', 'physics', 'chemistry', 'biology'],
    history: ['history', 'politics', 'government', 'global'],
    art: ['art', 'music', 'theatre', 'drama'],
    lang: ['french', 'spanish', 'mandarin', 'arabic'],
    tech: ['computer', 'technology', 'cs'],
    health: ['pe', 'physical', 'health'],
};

function getCourseIconType(courseName) {
    const lower = (courseName || '').toLowerCase();
    for (const [type, keywords] of Object.entries(COURSE_KEYWORDS)) {
        if (keywords.some(kw => lower.includes(kw))) return type;
    }
    return 'default';
}

function getCourseShortName(courseName) {
    if (!courseName) return 'Course';
    // Strip common suffixes like "2025-26", "SL/HL", "I", "II"
    return courseName
        .replace(/\s*\d{4}-\d{2,4}\s*/g, '')
        .replace(/\s*(SL|HL|SL\/HL)\s*/gi, '')
        .replace(/\s+I{1,3}\s*$/g, '')
        .replace(/\s*IB\s*DP\s*/gi, '')
        .trim() || courseName;
}

export default function CourseDashboard({ courses, canvasItems, onSelectCourse, onOpenSettings, SchoolAILogo }) {
    const [search, setSearch] = useState('');

    // Derive course stats from canvasItems
    const courseStats = useMemo(() => {
        const stats = {};
        (canvasItems || []).forEach(item => {
            if (!item.course_name) return;
            if (!stats[item.course_name]) {
                stats[item.course_name] = { assignments: 0, upcoming: 0, courseId: item.course_id };
            }
            if (item.type === 'assignment') {
                stats[item.course_name].assignments++;
                const d = item.date ? new Date(item.date) : null;
                if (d && d > new Date()) stats[item.course_name].upcoming++;
            }
        });
        return stats;
    }, [canvasItems]);

    const filteredCourses = useMemo(() => {
        if (!search.trim()) return courses;
        const q = search.toLowerCase();
        return courses.filter(c => (c.name || '').toLowerCase().includes(q));
    }, [courses, search]);

    const noCourses = !courses || courses.length === 0;

    return (
        <div className="course-dashboard">
            <div className="dashboard-header">
                <div className="dashboard-logo">
                    {SchoolAILogo && <SchoolAILogo size={48} />}
                    <div>
                        <h1 className="dashboard-title">My Courses</h1>
                        <p className="dashboard-subtitle">Select a course to enter your personalized learning hub</p>
                    </div>
                </div>
                {!noCourses && (
                    <input
                        className="dashboard-search"
                        type="text"
                        placeholder="Search courses..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                )}
            </div>

            {noCourses ? (
                <div className="dashboard-empty">
                    <div className="dashboard-empty-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                        </svg>
                    </div>
                    <h2>No Courses Found</h2>
                    <p>Connect your Canvas LMS account in Settings to load your courses.</p>
                    <button className="btn-primary" onClick={onOpenSettings}>Open Settings</button>
                </div>
            ) : (
                <div className="course-grid">
                    {filteredCourses.map((course, idx) => {
                        const stats = courseStats[course.name] || {};
                        const shortName = getCourseShortName(course.name);
                        const iconType = getCourseIconType(course.name);
                        const bg = COURSE_COLORS[idx % COURSE_COLORS.length];

                        return (
                            <div
                                key={course.id || idx}
                                className="course-card"
                                onClick={() => onSelectCourse(course)}
                                style={{ '--card-bg': bg }}
                            >
                                <div className="course-card-gradient" style={{ background: bg }} />
                                <div className="course-card-content">
                                    <div className="course-card-icon">
                                        <CourseIcon type={iconType} size={32} />
                                    </div>
                                    <h3 className="course-card-name">{shortName}</h3>
                                    <p className="course-card-full-name">{course.name}</p>
                                    <div className="course-card-stats">
                                        {stats.assignments > 0 && (
                                            <span className="course-stat">
                                                {stats.assignments} assignments
                                            </span>
                                        )}
                                        {stats.upcoming > 0 && (
                                            <span className="course-stat upcoming">
                                                {stats.upcoming} upcoming
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="course-card-arrow">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                    </svg>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
