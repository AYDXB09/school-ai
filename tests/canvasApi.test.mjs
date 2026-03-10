import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchAllCanvasData, fetchCanvasAssignments, fetchCanvasCourses, filterCanvasHubItems, selectCanvasContextItems, shouldRefreshCanvasContext } from '../src/canvasApi.js';

test('fetchCanvasAssignments paginates beyond the first Canvas page', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    calls.push(decodeURIComponent(url));
    const page = calls.length;
    return {
      ok: true,
      json: async () => page === 1
        ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }))
        : [{ id: 101 }],
    };
  };

  try {
    const assignments = await fetchCanvasAssignments('https://canvas.example.com', 'token', 42);
    assert.equal(assignments.length, 101);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /page=1/);
    assert.match(calls[1], /page=2/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchCanvasCourses keeps only current favorites plus active courses', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const decodedUrl = decodeURIComponent(url);

    if (decodedUrl.includes('/api/v1/users/self/favorites/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 100, name: 'English 9 2023-24', workflow_state: 'completed', term: { name: '2023-24' } },
          { id: 202, name: 'IB DP English Language & Literature SL/HL I 2025-26', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 101, name: 'IB DP Economics SL/HL I 2025-26', workflow_state: 'available', term: { name: '2025-26' } },
          { id: 202, name: 'IB DP English Language & Literature SL/HL I 2025-26', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    throw new Error(`Unexpected fetch URL in test: ${decodedUrl}`);
  };

  try {
    const courses = await fetchCanvasCourses('https://canvas.example.com', 'token');

    assert.deepEqual(courses.map(course => course.name).sort(), [
      'IB DP Economics SL/HL I 2025-26',
      'IB DP English Language & Literature SL/HL I 2025-26',
    ]);
    assert.equal(courses.some(course => course.name === 'English 9 2023-24'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchAllCanvasData uses upcoming events and todo items for this-week assignment queries', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const decodedUrl = decodeURIComponent(url);
    calls.push(decodedUrl);

    if (decodedUrl.includes('/api/v1/users/self/favorites/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 101, name: 'IB Economics HL', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 101, name: 'IB Economics HL', workflow_state: 'available', term: { name: '2025-26' } },
          { id: 202, name: 'English A: Literature HL', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/upcoming_events?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 'assignment_9001',
            title: '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
            description: null,
            start_at: '2026-03-09T05:00:00Z',
            end_at: '2026-03-09T05:00:00Z',
            context_code: 'course_101',
            assignment: {
              id: 9001,
              name: '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
              description: '<p>Read the unemployment article</p>',
              due_at: '2026-03-09T05:00:00Z',
              course_id: 101,
              points_possible: 7,
              html_url: 'https://canvas.example.com/courses/101/assignments/9001',
            },
            html_url: 'https://canvas.example.com/courses/101/assignments/9001',
          },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/todo?')) {
      return {
        ok: true,
        json: async () => [
          {
            type: 'submitting',
            course_id: 202,
            assignment: {
              id: 8001,
              name: 'Poetry commentary outline',
              description: '<p>Draft your outline</p>',
              due_at: '2026-03-10T16:00:00Z',
              course_id: 202,
              points_possible: 15,
              html_url: 'https://canvas.example.com/courses/202/assignments/8001',
            },
            html_url: 'https://canvas.example.com/courses/202/assignments/8001',
          },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/missing_submissions?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/activity_stream?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/announcements?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/courses/101/assignments?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 9001,
            name: '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
            description: '<p>Older course assignment payload</p>',
            due_at: null,
            all_dates: [],
            overrides: [],
            course_id: 101,
            points_possible: 7,
            html_url: 'https://canvas.example.com/courses/101/assignments/9001',
          },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/courses/202/assignments?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    throw new Error(`Unexpected fetch URL in test: ${decodedUrl}`);
  };

  try {
    const now = new Date('2026-03-06T12:00:00-05:00');
    const canvasItems = await fetchAllCanvasData('https://canvas.example.com', 'token');

    const economicsResults = selectCanvasContextItems(
      canvasItems,
      'What economics assignments do I have this week?',
      [],
      now,
    );

    const englishResults = selectCanvasContextItems(
      canvasItems,
      'What English work do I have this week?',
      [],
      now,
    );

    const courseResults = selectCanvasContextItems(
      canvasItems,
      'what are all the courses i am enrolled in this year',
      [],
      now,
    );

    const economicsAssignment = canvasItems.find(item => item.id === 9001);
    const courseItems = canvasItems.filter(item => item.type === 'course');

    assert.equal(canvasItems.filter(item => item.id === 9001).length, 1);
    assert.equal(economicsAssignment?.due_at, '2026-03-09T05:00:00Z');
    assert.equal(economicsAssignment?.description, 'Read the unemployment article');
    assert.deepEqual(courseItems.map(item => item.name).sort(), [
      'English A: Literature HL',
      'IB Economics HL',
    ]);

    assert.deepEqual(economicsResults.map(item => item.name), [
      '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
    ]);
    assert.deepEqual(englishResults.map(item => item.name), [
      'Poetry commentary outline',
    ]);
    assert.ok(courseResults.length >= 2);
    assert.ok(courseResults.every(item => item.type === 'course'));
    assert.deepEqual(courseResults.map(item => item.name), [
      'English A: Literature HL',
      'IB Economics HL',
    ]);
    assert.equal(calls.some(url => url.includes('/files?')), false);
    assert.equal(calls.some(url => url.includes('/pages?')), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchAllCanvasData uses activity stream submissions when economics due work is missing from upcoming events and todo', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const decodedUrl = decodeURIComponent(url);

    if (decodedUrl.includes('/api/v1/users/self/favorites/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 101, name: 'IB DP Economics SL/HL I 2025-26', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 101, name: 'IB DP Economics SL/HL I 2025-26', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/upcoming_events?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/todo?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/missing_submissions?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/activity_stream?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 501,
            type: 'Submission',
            title: '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
            message: 'Read the unemployment article',
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/assignments/9001',
            assignment: {
              id: 9001,
              name: '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
              description: '<p>Read the unemployment article</p>',
              due_at: '2026-03-09T05:00:00Z',
              course_id: 101,
              points_possible: 7,
              html_url: 'https://canvas.example.com/courses/101/assignments/9001',
            },
          },
          {
            id: 502,
            type: 'Submission',
            title: '24.b. Employment Worksheet (Async - 1h)',
            message: 'Complete the worksheet',
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/assignments/9002',
            assignment: {
              id: 9002,
              name: '24.b. Employment Worksheet (Async - 1h)',
              description: '<p>Complete the worksheet</p>',
              due_at: '2026-03-09T05:00:00Z',
              course_id: 101,
              points_possible: 10,
              html_url: 'https://canvas.example.com/courses/101/assignments/9002',
            },
          },
          {
            id: 503,
            type: 'DiscussionTopic',
            title: 'Economics discussion',
            message: 'Not an assignment',
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/discussion_topics/12',
          },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/announcements?')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/courses/101/assignments?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 1,
            name: 'Academic Honesty and the Honor Code',
            description: null,
            due_at: null,
            all_dates: [],
            overrides: [],
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/assignments/1',
          },
          {
            id: 2,
            name: 'French Tutoring',
            description: null,
            due_at: null,
            all_dates: [],
            overrides: [],
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/assignments/2',
          },
          {
            id: 3,
            name: 'Mandarin Tutoring',
            description: null,
            due_at: null,
            all_dates: [],
            overrides: [],
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/assignments/3',
          },
          {
            id: 4,
            name: 'Spanish Tutoring',
            description: null,
            due_at: null,
            all_dates: [],
            overrides: [],
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/assignments/4',
          },
          {
            id: 5,
            name: 'SUPERVISED STUDY HALLS | CURRENTLY CLOSED FOR THE SUMMER ',
            description: null,
            due_at: null,
            all_dates: [],
            overrides: [],
            course_id: 101,
            html_url: 'https://canvas.example.com/courses/101/assignments/5',
          },
        ],
      };
    }

    throw new Error(`Unexpected fetch URL in test: ${decodedUrl}`);
  };

  try {
    const now = new Date('2026-03-06T12:00:00-05:00');
    const canvasItems = await fetchAllCanvasData('https://canvas.example.com', 'token');

    const economicsResults = selectCanvasContextItems(
      canvasItems,
      'What economics assignments do I have this week?',
      [],
      now,
    );

    assert.deepEqual(economicsResults.map(item => item.name), [
      '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
      '24.b. Employment Worksheet (Async - 1h)',
    ]);
    assert.ok(economicsResults.every(item => item.source === 'activity_stream'));
    assert.equal(canvasItems.some(item => item.name === 'Academic Honesty and the Honor Code'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('course list queries return course items instead of assignments', () => {
  const now = new Date('2026-03-06T12:00:00-05:00');
  const canvasItems = [
    {
      type: 'course',
      id: 'course_101',
      name: 'IB Economics HL',
      description: 'Canvas course',
      course_id: 101,
      course_name: 'IB Economics HL',
    },
    {
      type: 'course',
      id: 'course_202',
      name: 'English A: Literature HL',
      description: 'Canvas course',
      course_id: 202,
      course_name: 'English A: Literature HL',
    },
    {
      type: 'assignment',
      id: 1,
      name: 'Academic Honesty and the Honor Code',
      due_at: null,
      date: null,
      course_id: 101,
      course_name: 'IB Economics HL',
    },
    {
      type: 'assignment',
      id: 2,
      name: 'Poetry commentary outline',
      due_at: '2026-03-10T16:00:00Z',
      date: null,
      course_id: 202,
      course_name: 'English A: Literature HL',
    },
  ];

  const results = selectCanvasContextItems(canvasItems, 'what are all the courses i am enrolled in this year', [], now);

  assert.deepEqual(results.map(item => item.name), [
    'English A: Literature HL',
    'IB Economics HL',
  ]);
  assert.ok(results.every(item => item.type === 'course'));
});

test('What economics assignments do I have this week? returns the real due assignments', () => {
  const now = new Date('2026-03-06T12:00:00-05:00');
  const canvasItems = [
    {
      type: 'assignment',
      id: 1,
      name: '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
      description: 'Reading assignment',
      due_at: '2026-03-09T05:00:00Z',
      date: null,
      course_name: 'IB Economics HL',
    },
    {
      type: 'assignment',
      id: 2,
      name: '24.b. Employment Worksheet (Async - 1h)',
      description: 'Worksheet',
      due_at: '2026-03-09T05:00:00Z',
      date: null,
      course_name: 'IB Economics HL',
    },
    {
      type: 'page',
      id: 'topic-24',
      name: 'Topic 24 - Macroeconomic Objectives',
      description: 'Canvas Page',
      date: '2026-03-07T15:00:00Z',
      course_name: 'IB Economics HL',
    },
    {
      type: 'assignment',
      id: 3,
      name: 'Old economics reflection',
      description: 'Old work',
      due_at: '2026-02-15T17:00:00Z',
      date: null,
      course_name: 'IB Economics HL',
    },
  ];

  const results = selectCanvasContextItems(canvasItems, 'What economics assignments do I have this week?', [], now);

  assert.equal(results.length, 2);
  assert.deepEqual(results.map(item => item.name), [
    '24.a Reading Assignment: Low Unemployment (Async -1.5hs)',
    '24.b. Employment Worksheet (Async - 1h)',
  ]);
  assert.ok(results.every(item => item.type === 'assignment'));
});

test('What English work do I have this week? matches English/Literature courses and returns due work', () => {
  const now = new Date('2026-03-06T12:00:00-05:00');
  const canvasItems = [
    {
      type: 'assignment',
      id: 10,
      name: 'Poetry commentary outline',
      description: 'Draft your outline',
      due_at: '2026-03-10T16:00:00Z',
      date: null,
      course_name: 'English A: Literature HL',
    },
    {
      type: 'assignment',
      id: 11,
      name: 'Economics worksheet',
      description: 'Not English',
      due_at: '2026-03-09T05:00:00Z',
      date: null,
      course_name: 'IB Economics HL',
    },
  ];

  const results = selectCanvasContextItems(canvasItems, 'What English work do I have this week?', [], now);

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Poetry commentary outline');
  assert.equal(results[0].course_name, 'English A: Literature HL');
  assert.equal(results[0].type, 'assignment');
});

test('What English work do I have this week? keeps earlier-this-week English assignments instead of returning zero', () => {
  const now = new Date('2026-03-06T12:00:00-05:00');
  const canvasItems = [
    {
      type: 'assignment',
      id: 210,
      name: 'Close reading notes',
      description: 'Annotate the passage and bring notes to class.',
      due_at: '2026-03-05T16:00:00Z',
      date: '2026-03-05T16:00:00Z',
      course_id: 202,
      course_name: 'IB DP English Language & Literature SL/HL I 2025-26',
    },
    {
      type: 'assignment',
      id: 211,
      name: 'Older English draft',
      description: 'Old assignment from last month.',
      due_at: '2026-02-20T16:00:00Z',
      date: '2026-02-20T16:00:00Z',
      course_id: 202,
      course_name: 'IB DP English Language & Literature SL/HL I 2025-26',
    },
    {
      type: 'assignment',
      id: 310,
      name: 'Economics worksheet',
      description: 'Not English.',
      due_at: '2026-03-09T05:00:00Z',
      date: '2026-03-09T05:00:00Z',
      course_id: 101,
      course_name: 'IB DP Economics SL/HL I 2025-26',
    },
  ];

  const results = selectCanvasContextItems(canvasItems, 'What English work do I have this week?', [], now);

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Close reading notes');
  assert.equal(results[0].course_name, 'IB DP English Language & Literature SL/HL I 2025-26');
});

test('What math assignments do I have this week? keeps same-id assignments attached to the correct course', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const decodedUrl = decodeURIComponent(url);

    if (decodedUrl.includes('/api/v1/users/self/favorites/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 301, name: 'IB Mathematics AA HL', workflow_state: 'available', term: { name: '2025-26' } },
          { id: 401, name: 'IB DP Core I 2025-26', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 301, name: 'IB Mathematics AA HL', workflow_state: 'available', term: { name: '2025-26' } },
          { id: 401, name: 'IB DP Core I 2025-26', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (
      decodedUrl.includes('/api/v1/users/self/upcoming_events?')
      || decodedUrl.includes('/api/v1/users/self/todo?')
      || decodedUrl.includes('/api/v1/users/self/missing_submissions?')
      || decodedUrl.includes('/api/v1/users/self/activity_stream?')
      || decodedUrl.includes('/api/v1/announcements?')
    ) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/courses/301/assignments?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 47,
            name: '4.7 (Test) Chapter 4: End of Chapter (LIVE)',
            description: '<p>Math chapter test instructions</p>',
            due_at: '2026-03-11T15:00:00Z',
            all_dates: [],
            overrides: [],
            course_id: 301,
            html_url: null,
          },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/courses/401/assignments?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 47,
            name: 'Theory of Knowledge reflection',
            description: '<p>Core reflection</p>',
            due_at: '2026-03-12T15:00:00Z',
            all_dates: [],
            overrides: [],
            course_id: 401,
            html_url: null,
          },
        ],
      };
    }

    throw new Error(`Unexpected fetch URL in test: ${decodedUrl}`);
  };

  try {
    const now = new Date('2026-03-06T12:00:00-05:00');
    const canvasItems = await fetchAllCanvasData('https://canvas.example.com', 'token');
    const mathResults = selectCanvasContextItems(canvasItems, 'What math assignments do I have this week?', [], now);

    assert.equal(canvasItems.filter(item => item.id === 47 && item.type === 'assignment').length, 2);
    assert.equal(mathResults.length, 1);
    assert.equal(mathResults[0].name, '4.7 (Test) Chapter 4: End of Chapter (LIVE)');
    assert.equal(mathResults[0].course_name, 'IB Mathematics AA HL');
  } finally {
    global.fetch = originalFetch;
  }
});

test('specific assignment title/number queries return the exact assignment details', () => {
  const now = new Date('2026-03-20T12:00:00-05:00');
  const canvasItems = [
    {
      type: 'assignment',
      id: 50,
      name: '24.b. Employment Worksheet (Async - 1h)',
      description: 'Complete the employment worksheet and show each calculation.',
      due_at: '2026-03-09T05:00:00Z',
      date: '2026-03-09T05:00:00Z',
      course_name: 'IB Economics HL',
    },
    {
      type: 'assignment',
      id: 51,
      name: 'Poetry commentary outline',
      description: 'Draft outline',
      due_at: '2026-03-10T16:00:00Z',
      date: '2026-03-10T16:00:00Z',
      course_name: 'English A: Literature HL',
    },
  ];

  const results = selectCanvasContextItems(canvasItems, 'Can you explain 24.b Employment Worksheet?', [], now);

  assert.equal(results.length, 1);
  assert.equal(results[0].name, '24.b. Employment Worksheet (Async - 1h)');
  assert.equal(results[0].course_name, 'IB Economics HL');
});

test('hidden courses are excluded from course lists and assignment queries', () => {
  const now = new Date('2026-03-06T12:00:00-05:00');
  const canvasItems = [
    {
      type: 'course',
      id: 'course_101',
      name: 'IB Economics HL',
      course_id: 101,
      course_name: 'IB Economics HL',
    },
    {
      type: 'course',
      id: 'course_202',
      name: 'English A: Literature HL',
      course_id: 202,
      course_name: 'English A: Literature HL',
    },
    {
      type: 'assignment',
      id: 90,
      name: 'Poetry commentary outline',
      due_at: '2026-03-10T16:00:00Z',
      date: '2026-03-10T16:00:00Z',
      course_id: 202,
      course_name: 'English A: Literature HL',
    },
    {
      type: 'assignment',
      id: 91,
      name: 'Economics worksheet',
      due_at: '2026-03-09T05:00:00Z',
      date: '2026-03-09T05:00:00Z',
      course_id: 101,
      course_name: 'IB Economics HL',
    },
  ];

  const hidden = ['IB Economics HL'];
  const courseResults = selectCanvasContextItems(canvasItems, 'what are all the courses i am enrolled in this year', hidden, now);
  const assignmentResults = selectCanvasContextItems(canvasItems, 'What assignments do I have this week?', hidden, now);

  assert.deepEqual(courseResults.map(item => item.name), ['English A: Literature HL']);
  assert.deepEqual(assignmentResults.map(item => item.name), ['Poetry commentary outline']);
  assert.ok(assignmentResults.every(item => item.course_name !== 'IB Economics HL'));
});

test('Canvas Hub filters hide date-less course cards when course/date filters are active', () => {
  const canvasItems = [
    {
      type: 'course',
      id: 'course_202',
      name: 'IB DP English Language & Literature SL/HL I 2025-26',
      course_id: 202,
      course_name: 'IB DP English Language & Literature SL/HL I 2025-26',
      date: null,
      due_at: null,
    },
    {
      type: 'assignment',
      id: 2001,
      name: 'Poetry commentary outline',
      course_id: 202,
      course_name: 'IB DP English Language & Literature SL/HL I 2025-26',
      date: '2026-03-10T16:00:00Z',
      due_at: '2026-03-10T16:00:00Z',
    },
  ];

  const inRange = filterCanvasHubItems(canvasItems, {
    course: 'IB DP English Language & Literature SL/HL I 2025-26',
    dateFrom: '2026-03-05',
  });
  const outOfRange = filterCanvasHubItems(canvasItems, {
    course: 'IB DP English Language & Literature SL/HL I 2025-26',
    dateFrom: '2026-03-11',
  });

  assert.deepEqual(inRange.map(item => item.name), ['Poetry commentary outline']);
  assert.deepEqual(outOfRange, []);
});

test('shouldRefreshCanvasContext refreshes stale or suspicious cached assignment data', () => {
  const now = Date.parse('2026-03-06T12:00:00Z');

  assert.equal(shouldRefreshCanvasContext([], now, now), true);
  assert.equal(shouldRefreshCanvasContext([
    {
      type: 'assignment',
      id: 1,
      name: 'Cached assignment with missing date',
      date: null,
      due_at: null,
      course_name: 'IB Economics HL',
    },
  ], now, now), true);
  assert.equal(shouldRefreshCanvasContext([
    {
      type: 'assignment',
      id: 2,
      name: 'Fresh assignment with due date but no course roster item',
      due_at: '2026-03-09T05:00:00Z',
      date: null,
      course_name: 'IB Economics HL',
    },
  ], now, now), true);
  assert.equal(shouldRefreshCanvasContext([
    {
      type: 'course',
      id: 'course_101',
      name: 'IB Economics HL',
      due_at: null,
      date: null,
      course_name: 'IB Economics HL',
    },
    {
      type: 'assignment',
      id: 22,
      name: 'Fresh assignment with due date',
      due_at: '2026-03-09T05:00:00Z',
      date: null,
      course_name: 'IB Economics HL',
    },
  ], now, now), false);
  assert.equal(shouldRefreshCanvasContext([
    {
      type: 'assignment',
      id: 3,
      name: 'Old but dated assignment cache',
      due_at: '2026-03-09T05:00:00Z',
      date: null,
      course_name: 'IB Economics HL',
    },
  ], now - (16 * 60 * 1000), now), true);
});

test('fetchAllCanvasData preserves score and grade when deduping richer assignment sources', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const decodedUrl = decodeURIComponent(url);

    if (decodedUrl.includes('/api/v1/users/self/favorites/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 101, name: 'IB Global Politics', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/courses?')) {
      return {
        ok: true,
        json: async () => [
          { id: 101, name: 'IB Global Politics', workflow_state: 'available', term: { name: '2025-26' } },
        ],
      };
    }

    if (decodedUrl.includes('/api/v1/users/self/upcoming_events?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 'assignment_9001',
            title: 'Reading 24.B',
            description: null,
            start_at: '2026-03-09T05:00:00Z',
            end_at: '2026-03-09T05:00:00Z',
            context_code: 'course_101',
            assignment: {
              id: 9001,
              name: 'Reading 24.B',
              description: '<p>Explain de facto power and de jure authority.</p>',
              due_at: '2026-03-09T05:00:00Z',
              course_id: 101,
              points_possible: 20,
              html_url: 'https://canvas.example.com/courses/101/assignments/9001',
            },
            submission: {
              entered_score: 18,
              entered_grade: '90%',
            },
            html_url: 'https://canvas.example.com/courses/101/assignments/9001',
          },
        ],
      };
    }

    if (
      decodedUrl.includes('/api/v1/users/self/todo?')
      || decodedUrl.includes('/api/v1/users/self/missing_submissions?')
      || decodedUrl.includes('/api/v1/users/self/activity_stream?')
      || decodedUrl.includes('/api/v1/announcements?')
    ) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (decodedUrl.includes('/api/v1/courses/101/assignments?')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 9001,
            name: 'Reading 24.B',
            description: '<p>Older course assignment payload</p>',
            due_at: null,
            all_dates: [],
            overrides: [],
            course_id: 101,
            points_possible: 20,
            html_url: 'https://canvas.example.com/courses/101/assignments/9001',
          },
        ],
      };
    }

    throw new Error(`Unexpected fetch URL in test: ${decodedUrl}`);
  };

  try {
    const canvasItems = await fetchAllCanvasData('https://canvas.example.com', 'token');
    const assignment = canvasItems.find(item => item.type === 'assignment' && item.id === 9001);

    assert.ok(assignment);
    assert.equal(canvasItems.filter(item => item.type === 'assignment' && item.id === 9001).length, 1);
    assert.equal(assignment.source, 'upcoming_event');
    assert.equal(assignment.description, 'Explain de facto power and de jure authority.');
    assert.equal(assignment.due_at, '2026-03-09T05:00:00Z');
    assert.equal(assignment.score, 18);
    assert.equal(assignment.grade, '90%');
    assert.equal(assignment.points_possible, 20);
  } finally {
    global.fetch = originalFetch;
  }
});