import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCourseCatalog,
  buildCourseWorkspaceSummary,
  deriveTopicMap,
  getCourseKey,
  getPacedMaterialEntries,
  getTopicKey,
  groupAssignmentsByTimeline,
  matchesCourseKey,
} from '../src/courseWorkspace.js';

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

test('getTopicKey normalizes strings and topic-like objects', () => {
  assert.equal(getTopicKey('Cell Membrane'), 'topic-cell-membrane');
  assert.equal(getTopicKey({ label: 'Cell Membrane' }), 'topic-cell-membrane');
  assert.equal(getTopicKey({ name: 'Cell Membrane' }), 'topic-cell-membrane');
});

test('deriveTopicMap keeps seed topics, source evidence, assignment metadata, and graph connections', () => {
  const topics = deriveTopicMap({
    courseName: 'Biology HL',
    transcriptEntries: [
      {
        id: 't1',
        title: 'Photosynthesis lecture',
        content: `Topic: Photosynthesis
Cellular Respiration
Photosynthesis depends on chloroplasts. Photosynthesis uses light energy.
Chloroplasts contain chlorophyll, and chloroplasts help produce glucose.
We compared photosynthesis with cellular respiration.`,
      },
    ],
    materialEntries: [
      {
        id: 'm1',
        kind: 'textbook',
        title: 'Chapter 4: Photosynthesis',
        content: 'Photosynthesis and chloroplasts are covered on pages 112-118. Cellular respiration appears in the comparison section.',
      },
    ],
    assignments: [
      {
        id: 'a1',
        name: 'Photosynthesis lab',
        description: 'Measure photosynthesis rate with chloroplast data and compare to cellular respiration.',
        missing: true,
        points_possible: 25,
        date: '2026-03-12T05:00:00Z',
        course_name: 'Biology HL',
      },
    ],
    seedTopics: [
      {
        id: 'seed-1',
        courseId: 'bio-1',
        name: 'Cellular Respiration',
        summary: 'Compare how cells release energy from glucose.',
        sourceType: 'manual',
      },
    ],
  });

  const photosynthesisTopic = topics.find(topic => topic.label === 'Photosynthesis');
  const respirationTopic = topics.find(topic => topic.label === 'Cellular Respiration');

  assert.ok(photosynthesisTopic);
  assert.ok(respirationTopic);
  assert.ok(photosynthesisTopic.transcriptIds.includes('t1'));
  assert.ok(photosynthesisTopic.materialIds.includes('m1'));
  assert.ok(photosynthesisTopic.evidenceScore >= 4);
  assert.ok(photosynthesisTopic.relatedAssignments.some(assignment => (
    assignment.id === 'a1'
    && assignment.missing === true
    && assignment.points_possible === 25
  )));
  assert.ok(photosynthesisTopic.connections.some(connection => connection.targetId === respirationTopic.id));
  assert.ok(respirationTopic.seedTopicIds.includes('seed-1'));
});

test('groupAssignmentsByTimeline buckets due-this-week, last-week, later, older, and undated work', () => {
  const buckets = groupAssignmentsByTimeline([
    { id: 'due-now', name: 'Current week', date: '2026-03-10T12:00:00-05:00' },
    { id: 'recent', name: 'Recent', date: '2026-03-03T12:00:00-05:00' },
    { id: 'later', name: 'Later', date: '2026-03-20T12:00:00-05:00' },
    { id: 'old', name: 'Old', date: '2026-02-20T12:00:00-05:00' },
    { id: 'undated', name: 'Undated work' },
  ], new Date('2026-03-06T12:00:00-05:00'));

  assert.deepEqual(
    buckets.map(bucket => ({ key: bucket.key, ids: bucket.items.map(item => item.id) })),
    [
      { key: 'due-this-week', ids: ['due-now'] },
      { key: 'last-week', ids: ['recent'] },
      { key: 'upcoming-later', ids: ['later'] },
      { key: 'older-past-due', ids: ['old'] },
      { key: 'no-due-date', ids: ['undated'] },
    ],
  );
});

test('getPacedMaterialEntries limits textbook chapters to current assignment progress', () => {
  const paced = getPacedMaterialEntries([
    { id: 'tb-3', kind: 'textbook', title: 'Chapter 3: Linear Functions', text: 'Chapter 3 linear functions.' },
    { id: 'tb-4', kind: 'textbook', title: 'Chapter 4: Systems of Equations', text: 'Chapter 4 systems of equations.' },
    { id: 'tb-5', kind: 'textbook', title: 'Chapter 5: Quadratics', text: 'Chapter 5 quadratics.' },
    { id: 'mat-1', kind: 'material', title: 'Teacher review guide', text: 'Systems of equations review.' },
  ], [
    { id: 'a1', name: 'Chapter 4 quiz review', description: 'Prepare for Chapter 4 systems of equations quiz.' },
  ]);

  assert.deepEqual(paced.map(item => item.id), ['tb-3', 'tb-4', 'mat-1']);
});

test('deriveTopicMap extracts concepts from assignment descriptions instead of task labels', () => {
  const topics = deriveTopicMap({
    courseName: 'Algebra I',
    assignments: [
      {
        id: 'a1',
        name: 'Daily Homework',
        description: 'Practice solving systems of equations and graphing linear inequalities from today\'s lesson.',
        course_name: 'Algebra I',
        date: '2026-03-11T12:00:00-05:00',
      },
    ],
  });

  const labels = topics.map(topic => topic.label.toLowerCase());
  assert.ok(labels.some(label => label.includes('systems of equations') || label.includes('linear inequalities')));
  assert.ok(labels.every(label => !label.includes('homework')));
  assert.ok(topics.some(topic => topic.relatedAssignments.some(assignment => assignment.id === 'a1')));
});

test('deriveTopicMap aligns generic assignment titles to shared textbook concepts', () => {
  const topics = deriveTopicMap({
    courseName: 'IB Global Politics',
    materialEntries: [
      {
        id: 'm1',
        kind: 'textbook',
        title: 'Power and authority',
        text: 'De facto power describes who truly controls the state, while de jure authority describes who has the formal legal power to rule.',
      },
    ],
    assignments: [
      {
        id: 'a1',
        name: 'Reading 24.B',
        description: 'Explain the difference between de facto power and de jure authority using one real-world example.',
        course_name: 'IB Global Politics',
        date: '2026-03-12T12:00:00-05:00',
      },
    ],
  });

  const labels = topics.map(topic => topic.label.toLowerCase());
  assert.ok(labels.every(label => !label.includes('reading 24')));

  const alignedTopic = topics.find(topic => (
    topic.materialIds.includes('m1')
    && topic.relatedAssignments.some(assignment => assignment.id === 'a1')
    && /de facto|de jure/.test(topic.label.toLowerCase())
  ));

  assert.ok(alignedTopic);
});

test('deriveTopicMap creates a course root, preserves hierarchy metadata, and uses academic course-item evidence', () => {
  const topics = deriveTopicMap({
    courseName: 'IB Global Politics',
    transcriptEntries: [
      {
        id: 't1',
        title: 'Power lecture',
        content: `Topic: Power
Sovereignty
Power shapes sovereignty and legitimacy. We compared de facto power and de jure authority in class.`,
      },
    ],
    materialEntries: [
      {
        id: 'm1',
        kind: 'textbook',
        title: 'Power and sovereignty',
        content: 'Topic: Power\nPower, sovereignty, legitimacy, and authority organize this unit.',
      },
    ],
    courseItems: [
      {
        id: 'ann-1',
        type: 'announcement',
        title: 'Weekly focus',
        description: 'Topic: Sovereignty\nSovereignty and legitimacy are central ideas this week.',
      },
      {
        id: 'page-1',
        type: 'page',
        title: 'Power and authority page',
        description: 'Topic: Power\nDe facto power differs from de jure authority.',
      },
      {
        id: 'ann-admin',
        type: 'announcement',
        title: 'Office hours reminder',
        description: 'Office hours, tutoring, syllabus reminders, and the honor code.',
      },
    ],
    assignments: [
      {
        id: 'a1',
        name: 'Reading 24.B',
        description: 'Explain how power shapes sovereignty by comparing de facto power with de jure authority.',
        score: 18,
        points_possible: 20,
        course_name: 'IB Global Politics',
        date: '2026-03-12T12:00:00-05:00',
      },
    ],
  });

  const rootTopic = topics[0];
  const nonRootTopics = topics.filter(topic => !topic.isRoot);
  const powerTopic = topics.find(topic => topic.label === 'Power');
  const sovereigntyTopic = topics.find(topic => topic.label === 'Sovereignty');
  const deFactoTopic = topics.find(topic => /de facto|de jure/.test(topic.label.toLowerCase()));
  const labels = topics.map(topic => topic.label.toLowerCase());

  assert.equal(rootTopic.label, 'IB Global Politics');
  assert.equal(rootTopic.isRoot, true);
  assert.equal(rootTopic.parentId, null);
  assert.equal(rootTopic.level, 0);
  assert.ok(rootTopic.connections.length > 0);

  assert.ok(nonRootTopics.length > 0);
  assert.ok(nonRootTopics.every(topic => topic.parentId));
  assert.ok(nonRootTopics.every(topic => topic.level >= 1));
  assert.ok(nonRootTopics.some(topic => topic.parentId === rootTopic.id));
  assert.ok(nonRootTopics.some(topic => topic.parentId !== rootTopic.id));

  assert.ok(powerTopic);
  assert.ok(sovereigntyTopic);
  assert.ok(deFactoTopic);
  assert.ok(powerTopic.materialIds.includes('m1'));
  assert.ok(sovereigntyTopic.courseItemIds.includes('ann-1'));
  assert.ok(deFactoTopic.courseItemIds.includes('page-1'));
  assert.ok(deFactoTopic.relatedAssignments.some(assignment => (
    assignment.id === 'a1'
    && assignment.score === 18
    && assignment.points_possible === 20
  )));

  assert.ok(labels.every(label => !label.includes('reading 24')));
  assert.ok(labels.every(label => !label.includes('office hours')));
  assert.ok(labels.every(label => !label.includes('honor code')));
});

test('deriveTopicMap reads text-based sources and prefers saved summaries', () => {
  const topics = deriveTopicMap({
    courseName: 'Pre-Algebra',
    transcriptEntries: [
      {
        id: 't1',
        title: 'Fractions lesson',
        text: 'Topic: Fractions\nFractions represent part of a whole and can be compared with common denominators.',
      },
    ],
    materialEntries: [
      {
        id: 'm1',
        kind: 'material',
        title: 'Ratio review guide',
        text: 'Topic: Ratios\nRatios compare two quantities and can be written as words, fractions, or with a colon.',
        summary: 'Ratios compare two quantities and can be written in several equivalent forms.',
      },
    ],
  });

  const fractionsTopic = topics.find(topic => topic.label === 'Fractions');
  const ratiosTopic = topics.find(topic => topic.label === 'Ratios');

  assert.ok(fractionsTopic);
  assert.ok(fractionsTopic.transcriptIds.includes('t1'));
  assert.ok(ratiosTopic);
  assert.ok(ratiosTopic.materialIds.includes('m1'));
  assert.equal(ratiosTopic.summary, 'Ratios compare two quantities and can be written in several equivalent forms.');
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