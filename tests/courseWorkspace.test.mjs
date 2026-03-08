import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCourseCatalog, buildCourseWorkspaceSummary, deriveTopicMap, getCourseKey, matchesCourseKey } from '../src/courseWorkspace.js';

test('buildCourseCatalog groups Canvas items into visible course workspaces', () => {
  const courses = buildCourseCatalog([
    { id: 1, course_id: 101, course_name: 'Economics HL', type: 'assignment', name: 'Inflation notes', date: '2026-03-09T05:00:00Z' },
    { id: 2, course_id: 101, course_name: 'Economics HL', type: 'announcement', name: 'Quiz reminder' },
    { id: 3, course_id: 202, course_name: 'Hidden Course', type: 'assignment', name: 'Should not appear' },
  ], ['Hidden Course'], new Date('2026-03-06T12:00:00-05:00'));

  assert.equal(courses.length, 1);
  assert.equal(courses[0].name, 'Economics HL');
  assert.equal(courses[0].assignmentCount, 1);
  assert.equal(courses[0].upcomingCount, 1);
});

test('deriveTopicMap creates topic nodes from transcripts and links assignments', () => {
  const topics = deriveTopicMap({
    courseName: 'IB DP Economics HL',
    transcriptEntries: [
      {
        id: 't1',
        title: 'March 6 Class',
        content: 'Topic: Inflation and unemployment\nWe compared inflation, unemployment, and the Phillips curve in class. Inflation was the main focus.',
      },
    ],
    materialEntries: [
      {
        id: 'm1',
        kind: 'textbook',
        title: 'Unit 3: Macroeconomics',
        content: 'Chapter 5: Inflation\nThis unit explains inflation, unemployment, and aggregate demand.',
      },
    ],
    assignments: [
      {
        id: 88,
        name: 'Inflation worksheet',
        description: 'Practice Phillips curve and unemployment questions.',
        date: '2026-03-09T05:00:00Z',
        course_name: 'IB DP Economics HL',
      },
    ],
  });

  assert.ok(topics.length > 0);
  assert.ok(topics.some(topic => topic.label.toLowerCase().includes('inflation')));
  const inflationTopic = topics.find(topic => topic.label.toLowerCase().includes('inflation'));
  assert.ok(inflationTopic.relatedAssignments.some(assignment => assignment.name === 'Inflation worksheet'));
  assert.ok(inflationTopic.transcriptIds.includes('t1'));
});

test('course workspace summary counts course-specific resources', () => {
  const summary = buildCourseWorkspaceSummary(
    { name: 'English HL' },
    {
      transcriptEntries: [{ id: 't1' }, { id: 't2' }],
      materialEntries: [{ id: 'm1' }],
      chats: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    },
    [
      { id: 1, date: '2026-03-10T05:00:00Z' },
      { id: 2, date: '2026-03-01T05:00:00Z' },
    ],
    new Date('2026-03-06T12:00:00-05:00'),
  );

  assert.equal(summary.courseName, 'English HL');
  assert.equal(summary.transcriptCount, 2);
  assert.equal(summary.materialCount, 1);
  assert.equal(summary.chatCount, 3);
  assert.equal(summary.assignmentCount, 2);
  assert.equal(summary.upcomingAssignmentCount, 1);
});

test('course keys remain stable across Canvas items and course objects', () => {
  const key = getCourseKey({ course_id: 202, course_name: 'English HL' });
  assert.equal(key, 'course-202');
  assert.equal(matchesCourseKey({ id: 202, name: 'English HL' }, key), true);
});