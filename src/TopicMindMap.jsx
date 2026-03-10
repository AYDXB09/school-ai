import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTopicKey } from './courseWorkspace';

const STAGE_WIDTH = 2160;
const STAGE_HEIGHT = 1800;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;
const STAGE_CENTER_X = STAGE_WIDTH / 2;
const STAGE_CENTER_Y = STAGE_HEIGHT / 2;

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getTopicLabel(topic) {
    return topic?.label || topic?.name || 'Concept';
}

function buildExcerpt(text, topicLabel = '') {
    const sourceText = String(text || '').trim();
    if (!sourceText) return '';
    const keywords = String(topicLabel || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2);

    for (const keyword of keywords) {
        const index = sourceText.toLowerCase().indexOf(keyword);
        if (index !== -1) {
            const start = Math.max(0, index - 110);
            const end = Math.min(sourceText.length, index + 220);
            return `${start > 0 ? '...' : ''}${sourceText.slice(start, end)}${end < sourceText.length ? '...' : ''}`;
        }
    }

    return sourceText.length > 220 ? `${sourceText.slice(0, 220)}...` : sourceText;
}

function keywordMatchesTopic(text, topic) {
    const haystack = String(text || '').toLowerCase();
    const keywords = getTopicLabel(topic)
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2);
    return keywords.some(keyword => haystack.includes(keyword));
}

function getRelatedAssignments(topic, assignments = []) {
    const assignmentIds = new Set((topic?.relatedAssignments || []).map(item => String(item.id)));
    const directMatches = assignments.filter(item => assignmentIds.has(String(item.id)));
    if (directMatches.length > 0) return directMatches;
    return assignments.filter(item => keywordMatchesTopic(`${item?.name || ''} ${item?.description || ''}`, topic));
}

function getRelatedTranscripts(topic, transcripts = []) {
    const transcriptIds = new Set(topic?.transcriptIds || []);
    const directMatches = transcripts.filter(item => transcriptIds.has(item.id));
    if (directMatches.length > 0) return directMatches;
    return transcripts.filter(item => keywordMatchesTopic(item?.text, topic));
}

function getRelatedMaterials(topic, materials = []) {
    const materialIds = new Set(topic?.materialIds || []);
    const directMatches = materials.filter(item => materialIds.has(item.id));
    if (directMatches.length > 0) return directMatches;
    return materials.filter(item => keywordMatchesTopic(`${item?.title || ''} ${item?.text || item?.content || ''}`, topic));
}

function getRelatedCourseItems(topic, courseItems = []) {
    const courseItemIds = new Set((topic?.courseItemIds || []).map(id => String(id)));
    const directMatches = courseItems.filter(item => courseItemIds.has(String(item.id)));
    if (directMatches.length > 0) return directMatches;
    return courseItems.filter(item => keywordMatchesTopic(`${item?.name || item?.title || ''} ${item?.description || item?.content || ''}`, topic));
}

function findRootTopic(topics = []) {
    return topics.find(topic => topic?.isRoot)
        || topics.find(topic => !topic?.parentId)
        || topics[0]
        || null;
}

function getConnectionStrength(topicMap, leftId, rightId) {
    const leftStrength = (topicMap.get(leftId)?.connections || []).find(connection => connection.targetId === rightId)?.strength || 0;
    const rightStrength = (topicMap.get(rightId)?.connections || []).find(connection => connection.targetId === leftId)?.strength || 0;
    return Math.max(leftStrength, rightStrength, 1);
}

function buildEdgePath(source, target) {
    const direction = target.x >= source.x ? 1 : -1;
    const sourceOffset = Math.max(22, ((source.width || 0) / 2) - 16);
    const targetOffset = Math.max(22, ((target.width || 0) / 2) - 16);
    const startX = source.x + (direction * sourceOffset);
    const endX = target.x - (direction * targetOffset);
    const curve = Math.max(90, Math.abs(endX - startX) * 0.42);
    return `M ${startX} ${source.y} C ${startX + (curve * direction)} ${source.y}, ${endX - (curve * direction)} ${target.y}, ${endX} ${target.y}`;
}

function clampViewportToShell(nextViewport, shellWidth = 900, shellHeight = 640) {
    const scale = clamp(nextViewport?.scale ?? 1, MIN_SCALE, MAX_SCALE);
    const scaledWidth = STAGE_WIDTH * scale;
    const scaledHeight = STAGE_HEIGHT * scale;
    const marginX = Math.round(Math.min(120, shellWidth * 0.12));
    const marginY = Math.round(Math.min(90, shellHeight * 0.12));

    const centeredX = Math.round((shellWidth - scaledWidth) / 2);
    const centeredY = Math.round((shellHeight - scaledHeight) / 2);

    const x = scaledWidth <= shellWidth
        ? centeredX
        : clamp(nextViewport?.x ?? centeredX, shellWidth - scaledWidth - marginX, marginX);
    const y = scaledHeight <= shellHeight
        ? centeredY
        : clamp(nextViewport?.y ?? centeredY, shellHeight - scaledHeight - marginY, marginY);

    return {
        scale: Number(scale.toFixed(2)),
        x: Math.round(x),
        y: Math.round(y),
    };
}

function buildGraphLayout(topics = []) {
    if (!topics.length) return { nodes: [], edges: [] };

    const topicMap = new Map(topics.map(topic => [topic.id, topic]));
    const rootTopic = findRootTopic(topics);
    if (!rootTopic) return { nodes: [], edges: [] };

    const rootId = rootTopic.id;
    const parents = new Map();
    const levels = new Map([[rootId, 0]]);
    const sides = new Map([[rootId, 0]]);

    const childrenByParent = new Map();

    function addChild(parentId, childId) {
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(childId);
    }

    topics.forEach(topic => {
        if (!topic || topic.id === rootId) return;
        const parentId = topic.parentId && topic.parentId !== topic.id && topicMap.has(topic.parentId)
            ? topic.parentId
            : rootId;
        parents.set(topic.id, parentId);
        addChild(parentId, topic.id);
    });

    function resolveLevel(topicId, depth = 0, seen = new Set()) {
        if (levels.has(topicId)) return levels.get(topicId);
        if (depth > topics.length || seen.has(topicId)) return 1;

        const parentId = parents.get(topicId) || rootId;
        const nextSeen = new Set(seen);
        nextSeen.add(topicId);
        const parentLevel = parentId === rootId ? 0 : resolveLevel(parentId, depth + 1, nextSeen);
        const explicitLevel = Number.isFinite(topicMap.get(topicId)?.level) ? topicMap.get(topicId).level : null;
        const resolvedLevel = Math.max(parentLevel + 1, explicitLevel || 1);
        levels.set(topicId, resolvedLevel);
        return resolvedLevel;
    }

    topics.forEach(topic => {
        if (topic.id === rootId) return;
        resolveLevel(topic.id);
    });

    function compareChildOrder(parentId, leftId, rightId) {
        const byLevel = (levels.get(leftId) || 0) - (levels.get(rightId) || 0);
        if (byLevel !== 0) return byLevel;

        const byStrength = getConnectionStrength(topicMap, parentId, rightId) - getConnectionStrength(topicMap, parentId, leftId);
        if (byStrength !== 0) return byStrength;

        const byEvidence = (topicMap.get(rightId)?.evidenceScore || 0) - (topicMap.get(leftId)?.evidenceScore || 0);
        if (byEvidence !== 0) return byEvidence;

        return getTopicLabel(topicMap.get(leftId)).localeCompare(getTopicLabel(topicMap.get(rightId)));
    }

    for (const [parentId, childIds] of childrenByParent.entries()) {
        childIds.sort((leftId, rightId) => compareChildOrder(parentId, leftId, rightId));
    }

    const topLevelChildren = childrenByParent.get(rootId) || [];
    topLevelChildren.forEach((childId, index) => {
        sides.set(childId, index % 2 === 0 ? 1 : -1);
    });

    function propagateSides(parentId) {
        const childIds = childrenByParent.get(parentId) || [];
        const inheritedSide = sides.get(parentId) || 1;
        childIds.forEach(childId => {
            sides.set(childId, inheritedSide);
            propagateSides(childId);
        });
    }

    topLevelChildren.forEach(childId => propagateSides(childId));

    const subtreeSpanCache = new Map();
    function getSubtreeSpan(topicId) {
        if (subtreeSpanCache.has(topicId)) return subtreeSpanCache.get(topicId);
        const children = childrenByParent.get(topicId) || [];
        const span = children.length === 0
            ? 1
            : children.reduce((sum, childId) => sum + getSubtreeSpan(childId), 0);
        subtreeSpanCache.set(topicId, span);
        return span;
    }

    const ROOT_BRANCH_GAP = 340;
    const LEVEL_GAP = 290;
    const LEAF_SPACING = 150;
    const STAGE_PADDING_X = 150;
    const STAGE_PADDING_Y = 100;
    const positions = new Map([[rootId, { x: STAGE_CENTER_X, y: STAGE_CENTER_Y }]]);

    function getNodeMetrics(topic, level) {
        if (level === 0) {
            return {
                width: clamp(192 + ((topic.evidenceScore || 0) * 3), 192, 236),
                height: 82,
            };
        }

        return {
            width: clamp(136 + ((topic.evidenceScore || 0) * 2), 136, 172),
            height: 66,
        };
    }

    function placeGroup(parentId, side, childIds, anchorY) {
        const parentPosition = positions.get(parentId);
        if (!parentPosition || childIds.length === 0) return;

        const totalUnits = childIds.reduce((sum, childId) => sum + getSubtreeSpan(childId), 0);
        let cursorUnits = -totalUnits / 2;

        childIds.forEach(childId => {
            const spanUnits = getSubtreeSpan(childId);
            const childY = anchorY + ((cursorUnits + (spanUnits / 2)) * LEAF_SPACING);
            const gap = parentId === rootId ? ROOT_BRANCH_GAP : LEVEL_GAP;
            const childX = parentPosition.x + (side * gap);
            positions.set(childId, { x: childX, y: childY });
            placeChildren(childId);
            cursorUnits += spanUnits;
        });
    }

    function placeChildren(parentId) {
        const children = childrenByParent.get(parentId) || [];
        if (children.length === 0) return;

        if (parentId === rootId) {
            const leftChildren = children.filter(childId => (sides.get(childId) || 1) < 0);
            const rightChildren = children.filter(childId => (sides.get(childId) || 1) >= 0);
            placeGroup(parentId, -1, leftChildren, STAGE_CENTER_Y);
            placeGroup(parentId, 1, rightChildren, STAGE_CENTER_Y);
            return;
        }

        const side = sides.get(parentId) || 1;
        const parentY = positions.get(parentId)?.y || STAGE_CENTER_Y;
        placeGroup(parentId, side, children, parentY);
    }

    placeChildren(rootId);

    const nodes = topics.map(topic => {
        const position = positions.get(topic.id) || { x: STAGE_CENTER_X, y: STAGE_CENTER_Y };
        const level = topic.id === rootId ? 0 : (levels.get(topic.id) || 1);
        const side = level === 0 ? 0 : (sides.get(topic.id) || 1);
        const { width, height } = getNodeMetrics(topic, level);

        return {
            ...topic,
            x: position.x,
            y: position.y,
            width,
            height,
            level,
            side,
        };
    });

    const columns = new Map();
    nodes.forEach((node) => {
        const key = node.level === 0 ? 'root' : `${node.level}:${node.side < 0 ? 'left' : 'right'}`;
        if (!columns.has(key)) columns.set(key, []);
        columns.get(key).push(node);
    });

    columns.forEach((columnNodes) => {
        if (columnNodes.length < 2) return;

        const minGap = 28;
        // Sort by initial Y to ensure packDown logic works correctly
        columnNodes.sort((left, right) => left.y - right.y);
        
        // Pack downwards with minimum gap
        const packDown = () => {
            for (let index = 1; index < columnNodes.length; index += 1) {
                const previous = columnNodes[index - 1];
                const current = columnNodes[index];
                const minY = previous.y + ((previous.height + current.height) / 2) + minGap;
                if (current.y < minY) current.y = minY;
            }
        };

        // Two-way packing to even out distribution
        packDown();
        columnNodes.reverse();
        const packUp = () => {
            for (let index = 1; index < columnNodes.length; index += 1) {
                const following = columnNodes[index - 1];
                const current = columnNodes[index];
                const maxY = following.y - ((following.height + current.height) / 2) - minGap;
                if (current.y > maxY) current.y = maxY;
            }
        };
        packUp();
        columnNodes.reverse();

        // Center the entire column vertically over the original center
        const newTop = columnNodes[0].y - (columnNodes[0].height / 2);
        const newBottom = columnNodes[columnNodes.length - 1].y + (columnNodes[columnNodes.length - 1].height / 2);
        const span = newBottom - newTop;
        
        const columnCenterY = STAGE_CENTER_Y;
        const shiftY = columnCenterY - (newTop + span / 2);
        
        columnNodes.forEach(node => { node.y += shiftY; });
    });

    const edges = [...parents.entries()].map(([childId, parentId]) => ({
        id: `${parentId}::${childId}`,
        sourceId: parentId,
        targetId: childId,
        strength: getConnectionStrength(topicMap, parentId, childId),
    }));

    let minX = STAGE_CENTER_X - STAGE_WIDTH / 2;
    let maxX = STAGE_CENTER_X + STAGE_WIDTH / 2;
    let minY = STAGE_CENTER_Y - STAGE_HEIGHT / 2;
    let maxY = STAGE_CENTER_Y + STAGE_HEIGHT / 2;

    nodes.forEach(node => {
        if (node.x - node.width / 2 - STAGE_PADDING_X < minX) minX = node.x - node.width / 2 - STAGE_PADDING_X;
        if (node.x + node.width / 2 + STAGE_PADDING_X > maxX) maxX = node.x + node.width / 2 + STAGE_PADDING_X;
        if (node.y - node.height / 2 - STAGE_PADDING_Y < minY) minY = node.y - node.height / 2 - STAGE_PADDING_Y;
        if (node.y + node.height / 2 + STAGE_PADDING_Y > maxY) maxY = node.y + node.height / 2 + STAGE_PADDING_Y;
    });

    const activeWidth = maxX - minX;
    const activeHeight = maxY - minY;

    return { 
        nodes, 
        edges, 
        viewBox: `${minX} ${minY} ${activeWidth} ${activeHeight}`,
        activeWidth,
        activeHeight
    };
}

export default function TopicMindMap({
    topics = [],
    transcripts = [],
    materials = [],
    courseItems = [],
    assignments = [],
    courseName = 'Course',
    onStartChat = () => { },
    onOpenSource = () => { },
    onUpdateTopics = () => { },
    onUpdateAssessments = () => { },
    courseId,
}) {
    const shellRef = useRef(null);
    const dragRef = useRef(null);
    const [selectedTopicId, setSelectedTopicId] = useState(null);
    const [newTopicName, setNewTopicName] = useState('');
    const [newTopicSummary, setNewTopicSummary] = useState('');
    const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
    const [viewportReady, setViewportReady] = useState(false);

    const graph = useMemo(() => buildGraphLayout(topics || []), [topics]);
    const nodeMap = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
    const rootTopic = useMemo(() => findRootTopic(graph.nodes), [graph.nodes]);
    const rootTopicId = rootTopic?.id || null;

    useEffect(() => {
        if (!topics.length) {
            setSelectedTopicId(null);
            return;
        }
        if (!topics.some(topic => topic.id === selectedTopicId)) {
            setSelectedTopicId(rootTopicId || topics[0].id);
        }
    }, [topics, selectedTopicId, rootTopicId]);

    const clampViewport = useCallback((nextViewport, shell = shellRef.current) => {
        const width = shell?.clientWidth || 900;
        const height = shell?.clientHeight || 640;
        const layoutWidth = graph.activeWidth || STAGE_WIDTH;
        const layoutHeight = graph.activeHeight || STAGE_HEIGHT;
        return clampViewportToShell(nextViewport, width, height, layoutWidth, layoutHeight);
    }, [graph.activeWidth, graph.activeHeight]);

    const getDefaultViewport = useCallback(() => {
        const width = shellRef.current?.clientWidth || 900;
        const height = shellRef.current?.clientHeight || 640;
        const layoutWidth = graph.activeWidth || STAGE_WIDTH;
        const layoutHeight = graph.activeHeight || STAGE_HEIGHT;
        const fitScale = clamp(Math.min(width / layoutWidth, height / layoutHeight) * 0.9, MIN_SCALE, 0.96);
        return clampViewportToShell({
            x: Math.round((width - (layoutWidth * fitScale)) / 2),
            y: Math.round((height - (layoutHeight * fitScale)) / 2),
            scale: Number(fitScale.toFixed(2)),
        }, width, height, layoutWidth, layoutHeight);
    }, [graph.activeWidth, graph.activeHeight]);

    useEffect(() => {
        const shell = shellRef.current;
        if (!shell) return undefined;

        const syncViewport = () => {
            if (!viewportReady) {
                setViewport(getDefaultViewport());
                setViewportReady(true);
                return;
            }

            setViewport(current => clampViewport(current, shell));
        };

        syncViewport();

        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            if (!dragRef.current) syncViewport();
        });
        observer.observe(shell);
        return () => observer.disconnect();
    }, [clampViewport, getDefaultViewport, viewportReady]);

    useEffect(() => {
        function handleMove(event) {
            const dragState = dragRef.current;
            if (!dragState) return;
            setViewport(current => clampViewport({
                ...current,
                x: dragState.originX + (event.clientX - dragState.startX),
                y: dragState.originY + (event.clientY - dragState.startY),
            }));
        }

        function handleUp() {
            dragRef.current = null;
        }

        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', handleUp);
        window.addEventListener('pointercancel', handleUp);
        return () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', handleUp);
            window.removeEventListener('pointercancel', handleUp);
        };
    }, [clampViewport]);

    const selectedTopic = useMemo(
        () => graph.nodes.find(topic => topic.id === selectedTopicId) || null,
        [graph.nodes, selectedTopicId],
    );

    const selectedRelatedAssignments = useMemo(
        () => selectedTopic ? getRelatedAssignments(selectedTopic, assignments) : [],
        [selectedTopic, assignments],
    );
    const selectedRelatedTranscripts = useMemo(
        () => selectedTopic ? getRelatedTranscripts(selectedTopic, transcripts) : [],
        [selectedTopic, transcripts],
    );
    const selectedRelatedMaterials = useMemo(
        () => selectedTopic ? getRelatedMaterials(selectedTopic, materials) : [],
        [selectedTopic, materials],
    );
    const selectedRelatedCourseItems = useMemo(
        () => selectedTopic ? getRelatedCourseItems(selectedTopic, courseItems) : [],
        [selectedTopic, courseItems],
    );
    const connectedTopics = useMemo(
        () => {
            if (!selectedTopic) return [];

            const related = new Map();
            const addTopic = (topic) => {
                if (!topic || topic.id === selectedTopic.id) return;
                related.set(topic.id, topic);
            };

            if (selectedTopic.parentId) addTopic(nodeMap.get(selectedTopic.parentId));
            graph.nodes.filter(topic => topic.parentId === selectedTopic.id).forEach(addTopic);
            (selectedTopic.connections || []).forEach(connection => addTopic(nodeMap.get(connection.targetId)));

            return [...related.values()].sort((left, right) => {
                const byLevel = (left.level || 0) - (right.level || 0);
                if (byLevel !== 0) return byLevel;
                const byEvidence = (right.evidenceScore || 0) - (left.evidenceScore || 0);
                if (byEvidence !== 0) return byEvidence;
                return getTopicLabel(left).localeCompare(getTopicLabel(right));
            });
        },
        [selectedTopic, nodeMap, graph.nodes],
    );

    const canDeleteManualTopic = Boolean(
        selectedTopic
        && !selectedTopic.isRoot
        && (selectedTopic.seedTopicIds?.length > 0)
        && !(selectedTopic.transcriptIds?.length)
        && !(selectedTopic.materialIds?.length)
        && !(selectedTopic.courseItemIds?.length)
        && !(selectedTopic.relatedAssignments?.length),
    );

    function resetViewport() {
        setViewport(getDefaultViewport());
    }

    function zoomBy(delta) {
        const shell = shellRef.current;
        const width = shell?.clientWidth || 900;
        const height = shell?.clientHeight || 640;
        setViewport(current => {
            const nextScale = clamp(current.scale + delta, MIN_SCALE, MAX_SCALE);
            const centerX = width / 2;
            const centerY = height / 2;
            const worldX = (centerX - current.x) / current.scale;
            const worldY = (centerY - current.y) / current.scale;
            return clampViewportToShell({
                scale: nextScale,
                x: centerX - (worldX * nextScale),
                y: centerY - (worldY * nextScale),
            }, width, height);
        });
    }

    const handleWheel = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        const shell = shellRef.current;
        if (!shell) return;
        const rect = shell.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;

        setViewport(current => {
            const delta = event.deltaY > 0 ? -0.12 : 0.12;
            const nextScale = clamp(current.scale + delta, MIN_SCALE, MAX_SCALE);
            const worldX = (cursorX - current.x) / current.scale;
            const worldY = (cursorY - current.y) / current.scale;
            return clampViewportToShell({
                scale: nextScale,
                x: cursorX - (worldX * nextScale),
                y: cursorY - (worldY * nextScale),
            }, shell.clientWidth || 900, shell.clientHeight || 640);
        });
    }, []);

    useEffect(() => {
        const shell = shellRef.current;
        if (!shell) return undefined;

        const listener = event => handleWheel(event);
        shell.addEventListener('wheel', listener, { passive: false });
        return () => shell.removeEventListener('wheel', listener);
    }, [handleWheel]);

    function handleViewportPointerDown(event) {
        if (event.button !== 0) return;
        if (event.target.closest('button, input, textarea, a, .mindmap-node-card')) return;
        event.preventDefault();
        dragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            originX: viewport.x,
            originY: viewport.y,
        };
    }

    function handleAddTopic(event) {
        event.preventDefault();
        const label = newTopicName.trim();
        if (!label) return;
        const nextTopicKey = getTopicKey(label);
        const existingTopic = topics.find(topic => getTopicKey(topic) === nextTopicKey);

        if (existingTopic) {
            setSelectedTopicId(existingTopic.id);
            setNewTopicName('');
            setNewTopicSummary('');
            return;
        }

        const fallbackParentId = selectedTopic?.isRoot
            ? rootTopicId
            : (selectedTopic?.id || rootTopicId || null);

        const newTopic = {
            id: genId(),
            courseId,
            name: label,
            label,
            summary: newTopicSummary.trim() || 'Manually added concept for this course.',
            sourceType: 'manual',
            sourceDate: new Date().toISOString().split('T')[0],
            parentId: fallbackParentId,
            isRoot: false,
        };

        onUpdateTopics(prev => [...prev, newTopic]);
        setSelectedTopicId(newTopic.id);
        setNewTopicName('');
        setNewTopicSummary('');
    }

    function handleDeleteTopic(topic) {
        if (!topic) return;
        onUpdateTopics(prev => prev.filter(item => {
            if (String(item.courseId) !== String(courseId)) return true;
            if ((topic.seedTopicIds || []).includes(item.id)) return false;
            return getTopicKey(item) !== topic.id;
        }));
        setSelectedTopicId(rootTopicId);
    }

    function handleAssessmentChange(level) {
        if (!selectedTopic?.assessmentKey) return;
        onUpdateAssessments(prev => ({
            ...(prev || {}),
            [selectedTopic.assessmentKey]: level,
        }));
    }

    function clearAssessment() {
        if (!selectedTopic?.assessmentKey) return;
        onUpdateAssessments(prev => {
            const next = { ...(prev || {}) };
            delete next[selectedTopic.assessmentKey];
            return next;
        });
    }

    return (
        <div className="topic-mindmap">
            <div className="mindmap-header mindmap-header-row">
                <div>
                    <h3>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', verticalAlign: 'middle' }}>
                            <path d="M3 12h5" /><path d="M16 12h5" /><path d="M12 3v5" /><path d="M12 16v5" /><circle cx="12" cy="12" r="3" /><circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="12" cy="19" r="2" />
                        </svg>
                        Concept Mind Map — {courseName}
                    </h3>
                    <p className="mindmap-hint">Pan, zoom, and click a concept to see the linked assignment, lecture explanation, textbook/material references, and start a grounded chat from that concept.</p>
                </div>

                <div className="mindmap-toolbar">
                    <div className="mindmap-toolbar-group">
                        <button type="button" className="btn-secondary" onClick={() => zoomBy(0.12)}>Zoom In</button>
                        <button type="button" className="btn-secondary" onClick={() => zoomBy(-0.12)}>Zoom Out</button>
                        <button type="button" className="btn-secondary" onClick={resetViewport}>Reset View</button>
                    </div>
                    <div className="mindmap-legend">
                        <span className="mindmap-legend-item mastery-1">New</span>
                        <span className="mindmap-legend-item mastery-2">Growing</span>
                        <span className="mindmap-legend-item mastery-3">Comfortable</span>
                        <span className="mindmap-legend-item mastery-4">Mastered</span>
                    </div>
                </div>
            </div>

            <div className="mindmap-layout">
                <div className="mindmap-canvas-panel">
                    <div className="mindmap-canvas-shell" ref={shellRef} onPointerDown={handleViewportPointerDown}>
                        {graph.nodes.length === 0 ? (
                            <div className="panel-empty mindmap-empty-state">
                                <div className="panel-empty-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                                        <circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" />
                                    </svg>
                                </div>
                                <p>Add lecture content, class materials, textbook excerpts, or assignments so Lumina can grow the course map with real concepts.</p>
                            </div>
                        ) : (
                            <div
                                className="mindmap-stage"
                                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
                            >
                                <svg className="mindmap-edges" viewBox={graph.viewBox || `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`} aria-hidden="true">
                                    {graph.edges.map(edge => {
                                        const source = nodeMap.get(edge.sourceId);
                                        const target = nodeMap.get(edge.targetId);
                                        if (!source || !target) return null;
                                        const isActive = selectedTopic && (selectedTopic.id === edge.sourceId || selectedTopic.id === edge.targetId);
                                        return (
                                            <path
                                                key={edge.id}
                                                className={`mindmap-edge ${isActive ? 'active' : ''}`}
                                                d={buildEdgePath(source, target)}
                                                strokeWidth={1 + (edge.strength * 0.35)}
                                            />
                                        );
                                    })}
                                </svg>

                                <div className="mindmap-nodes-layer">
                                    {graph.nodes.map(topic => {
                                        const isSelected = selectedTopic?.id === topic.id;
                                        const missingCount = (topic.relatedAssignments || []).filter(item => item.missing).length;
                                        return (
                                            <button
                                                type="button"
                                                key={topic.id}
                                                className={`mindmap-node-card mastery-${topic.masteryLevel || 1} ${isSelected ? 'selected' : ''}`}
                                                style={{ left: `${topic.x}px`, top: `${topic.y}px`, width: `${topic.width}px` }}
                                                onClick={() => setSelectedTopicId(topic.id)}
                                            >
                                                <div className="mindmap-node-topline">
                                                    <span className="mindmap-node-level">{topic.isRoot ? 'Course Overview' : (topic.masteryLabel || 'Growing')}</span>
                                                    <span className="mindmap-node-score">{topic.evidenceScore || 0} refs</span>
                                                </div>
                                                <div className="mindmap-node-name">{getTopicLabel(topic)}</div>
                                                <div className="mindmap-node-badges">
                                                    <span className="mindmap-badge transcript">{topic.transcriptIds?.length || 0} lec</span>
                                                    <span className="mindmap-badge material">{topic.materialIds?.length || 0} src</span>
                                                    <span className="mindmap-badge material">{topic.courseItemIds?.length || 0} crs</span>
                                                    <span className="mindmap-badge assignment">{topic.relatedAssignments?.length || 0} work</span>
                                                    {missingCount > 0 && <span className="mindmap-badge warning">{missingCount} missing</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <form className="mindmap-add-form" onSubmit={handleAddTopic}>
                        <input
                            type="text"
                            placeholder="Add a custom concept..."
                            value={newTopicName}
                            onChange={event => setNewTopicName(event.target.value)}
                            className="mindmap-add-input"
                        />
                        <input
                            type="text"
                            placeholder="Why this concept matters (optional)"
                            value={newTopicSummary}
                            onChange={event => setNewTopicSummary(event.target.value)}
                            className="mindmap-add-input"
                        />
                        <button type="submit" className="btn-primary" disabled={!newTopicName.trim()}>Add Concept</button>
                    </form>
                </div>

                <div className="mindmap-detail">
                    {!selectedTopic ? (
                        <div className="panel-empty mindmap-side-empty">
                            <p>Select a concept node to inspect the source material behind it.</p>
                        </div>
                    ) : (
                        <>
                            <div className="mindmap-detail-header">
                                <div>
                                    <h3>{getTopicLabel(selectedTopic)}</h3>
                                    <div className={`mindmap-detail-mastery mastery-${selectedTopic.masteryLevel || 1}`}>{selectedTopic.isRoot ? 'Course Overview' : selectedTopic.masteryLabel}</div>
                                </div>
                                {selectedTopic.id !== rootTopicId && (
                                    <button className="mindmap-detail-close" type="button" onClick={() => setSelectedTopicId(rootTopicId)}>×</button>
                                )}
                            </div>

                            <p className="mindmap-detail-summary">{selectedTopic.summary}</p>
                            {selectedTopic.isRoot && (
                                <p className="detail-empty">This center node represents the whole course, combining lecture, material, assignment, and broader course evidence into one overview.</p>
                            )}

                            <div className="mindmap-detail-meta-row">
                                <span className="lecture-material-pill">{selectedRelatedAssignments.length} assignments</span>
                                <span className="lecture-material-pill">{selectedRelatedTranscripts.length} lecture refs</span>
                                <span className="lecture-material-pill">{selectedRelatedMaterials.length} material refs</span>
                                <span className="lecture-material-pill">{selectedRelatedCourseItems.length} course refs</span>
                                <span className="lecture-material-pill">{connectedTopics.length} linked concepts</span>
                            </div>

                            <div className="mindmap-detail-actions">
                                <button className="btn-primary" type="button" onClick={() => onStartChat(selectedTopic)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                                    </svg>
                                    {selectedTopic.isRoot ? 'Start AI Chat for the Whole Course' : 'Start AI Chat from This Concept'}
                                </button>
                                {canDeleteManualTopic && (
                                    <button className="btn-secondary btn-danger" type="button" onClick={() => handleDeleteTopic(selectedTopic)}>
                                        Remove Custom Concept
                                    </button>
                                )}
                            </div>

                            {selectedTopic.assessmentKey && (
                                <div className="mindmap-detail-section">
                                    <h4>How comfortable are you with this concept?</h4>
                                    <div className="mindmap-rating-row">
                                        {[1, 2, 3, 4].map(level => (
                                            <button
                                                key={level}
                                                type="button"
                                                className={`mindmap-rating-btn ${selectedTopic.selfAssessment === level ? 'active' : ''}`}
                                                onClick={() => handleAssessmentChange(level)}
                                            >
                                                {['New', 'Growing', 'Comfortable', 'Mastered'][level - 1]}
                                            </button>
                                        ))}
                                        <button type="button" className="mindmap-rating-btn ghost" onClick={clearAssessment}>Auto</button>
                                    </div>
                                </div>
                            )}

                            <div className="mindmap-detail-section">
                                <h4>{selectedTopic.isRoot ? 'Major Concepts in This Course' : 'Connected Concepts'}</h4>
                                {connectedTopics.length === 0 ? (
                                    <p className="detail-empty">No strong related concepts yet.</p>
                                ) : (
                                    <div className="mindmap-connection-list">
                                        {connectedTopics.map(topic => (
                                            <button key={topic.id} type="button" className="mindmap-connection-chip" onClick={() => setSelectedTopicId(topic.id)}>
                                                {getTopicLabel(topic)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mindmap-detail-section">
                                <h4>{selectedTopic.isRoot ? 'Assignments Connected to This Course' : 'Assignments Linked to This Concept'}</h4>
                                {selectedRelatedAssignments.length === 0 ? (
                                    <p className="detail-empty">No assignments are linked yet.</p>
                                ) : (
                                    selectedRelatedAssignments.slice(0, 5).map(assignment => {
                                        const due = assignment.date || assignment.due_at;
                                        return (
                                            <div key={assignment.id} className="detail-card">
                                                <div className="detail-card-name">{assignment.name}</div>
                                                <div className="material-card-meta">
                                                    {due && <span>Due {new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                                                    {Number.isFinite(assignment.points_possible) && <span>{assignment.points_possible} pts</span>}
                                                    {assignment.score != null && Number.isFinite(Number(assignment.score)) && <span>Score {Number(assignment.score)}</span>}
                                                    {assignment.grade && <span>Grade {assignment.grade}</span>}
                                                    {assignment.missing && <span className="mindmap-warning-text">Missing</span>}
                                                </div>
                                                {assignment.description && <div className="detail-card-excerpt">{buildExcerpt(assignment.description, getTopicLabel(selectedTopic))}</div>}
                                                <div className="detail-card-actions">
                                                    <button
                                                        type="button"
                                                        className="detail-link-btn"
                                                        onClick={() => onOpenSource({ type: 'assignment', id: assignment.id })}
                                                    >
                                                        Open assignment
                                                    </button>
                                                    {(assignment.html_url || assignment.url) && (
                                                        <a
                                                            className="detail-link-btn secondary"
                                                            href={assignment.html_url || assignment.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            Open in Canvas
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="mindmap-detail-section">
                                <h4>{selectedTopic.isRoot ? 'Lecture Content Feeding This Course Map' : 'Teacher Explanation from Lecture Content'}</h4>
                                {selectedRelatedTranscripts.length === 0 ? (
                                    <p className="detail-empty">No lecture excerpt is linked yet.</p>
                                ) : (
                                    selectedRelatedTranscripts.slice(0, 4).map(entry => (
                                        <div key={entry.id} className="detail-card">
                                            <div className="detail-card-date">{entry.date ? new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Lecture content'}</div>
                                            <div className="detail-card-excerpt">{buildExcerpt(entry.summary || entry.text, getTopicLabel(selectedTopic))}</div>
                                            <div className="detail-card-actions">
                                                <button
                                                    type="button"
                                                    className="detail-link-btn"
                                                    onClick={() => onOpenSource({ type: 'transcript', id: entry.id })}
                                                >
                                                    Open lecture source
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="mindmap-detail-section">
                                <h4>{selectedTopic.isRoot ? 'Textbook & Material Evidence Across This Course' : 'Textbook & Class Material References'}</h4>
                                {selectedRelatedMaterials.length === 0 ? (
                                    <p className="detail-empty">No textbook or class material excerpt is linked yet.</p>
                                ) : (
                                    selectedRelatedMaterials.slice(0, 4).map(entry => (
                                        <div key={entry.id} className="detail-card">
                                            <div className="detail-card-name">{entry.title || (entry.kind === 'textbook' ? `${courseName} Textbook` : 'Class Material')}</div>
                                            <div className="material-card-meta">
                                                <span className="lecture-content-kind-badge">{entry.kind === 'textbook' ? 'Textbook' : 'Material'}</span>
                                                {entry.pageReference && <span className="lecture-material-pill">Pages {entry.pageReference}</span>}
                                            </div>
                                            <div className="detail-card-excerpt">{buildExcerpt(entry.summary || entry.text || entry.content, getTopicLabel(selectedTopic))}</div>
                                            <div className="detail-card-actions">
                                                <button
                                                    type="button"
                                                    className="detail-link-btn"
                                                    onClick={() => onOpenSource({ type: 'material', id: entry.id })}
                                                >
                                                    Open {entry.kind === 'textbook' ? 'textbook section' : 'material source'}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="mindmap-detail-section">
                                <h4>{selectedTopic.isRoot ? 'Announcements, Pages, and Course Evidence' : 'Broader Course Evidence'}</h4>
                                {selectedRelatedCourseItems.length === 0 ? (
                                    <p className="detail-empty">No broader course evidence is linked yet.</p>
                                ) : (
                                    selectedRelatedCourseItems.slice(0, 4).map(entry => (
                                        <div key={`${entry.type}-${entry.id}`} className="detail-card">
                                            <div className="detail-card-name">{entry.name || entry.title || 'Course evidence'}</div>
                                            <div className="material-card-meta">
                                                <span className="lecture-content-kind-badge">{entry.type || 'course-item'}</span>
                                                {(entry.date || entry.posted_at) && (
                                                    <span>{new Date(entry.date || entry.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                )}
                                            </div>
                                            <div className="detail-card-excerpt">{buildExcerpt(entry.description || entry.content || '', getTopicLabel(selectedTopic)) || 'No excerpt available.'}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}