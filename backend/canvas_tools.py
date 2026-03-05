"""
Canvas LMS Toolbox for LLM Function Calling.
Each function represents a tool the LLM can invoke.
Uses the canvasapi library + requests for Canvas REST API access.
"""

import re
import json
from datetime import datetime, timedelta
from html import unescape
from canvasapi import Canvas
from config import config


def _get_canvas() -> Canvas:
    """Create a Canvas API client instance."""
    if not config.CANVAS_API_URL or not config.CANVAS_API_TOKEN:
        raise ValueError("Canvas API URL and Token must be configured in .env")
    return Canvas(config.CANVAS_API_URL, config.CANVAS_API_TOKEN)


def _strip_html(html: str) -> str:
    """Strip HTML tags from a string."""
    if not html:
        return ""
    clean = re.sub(r"<[^>]+>", " ", html)
    clean = unescape(clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


# ============================================================
# TOOL DEFINITIONS (OpenAI function-calling format)
# ============================================================

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_active_courses",
            "description": "Lists all currently enrolled/active courses for the student. Returns course ID, name, and code.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_assignments",
            "description": "Fetches all assignments for a specific course. Returns assignment names, due dates, point values, and descriptions. Use this when the user asks about assignments for a particular class.",
            "parameters": {
                "type": "object",
                "properties": {
                    "course_id": {
                        "type": "integer",
                        "description": "The Canvas course ID. Get this from get_active_courses() first.",
                    }
                },
                "required": ["course_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_assignment_details",
            "description": "Retrieves the full text, questions, and requirements of a specific assignment. Use this when the user asks about the content of a particular assignment (e.g., 'What does assignment 23.1 say?').",
            "parameters": {
                "type": "object",
                "properties": {
                    "course_id": {
                        "type": "integer",
                        "description": "The Canvas course ID.",
                    },
                    "assignment_id": {
                        "type": "integer",
                        "description": "The Canvas assignment ID. Get this from get_assignments() first.",
                    },
                },
                "required": ["course_id", "assignment_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_announcements",
            "description": "Pulls the latest teacher announcements across all enrolled courses. Use this when the user asks about recent updates, news, or teacher messages.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_content",
            "description": "Performs a semantic search across all indexed assignment descriptions, syllabus content, and course materials. Use this when the user asks a specific question about course content that may have been previously fetched.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to find relevant content.",
                    }
                },
                "required": ["query"],
            },
        },
    },
]


# ============================================================
# TOOL IMPLEMENTATIONS
# ============================================================


def get_active_courses() -> str:
    """List all active/enrolled courses."""
    try:
        canvas = _get_canvas()
        courses = canvas.get_courses(enrollment_state="active")
        result = []
        for course in courses:
            result.append(
                {
                    "id": course.id,
                    "name": getattr(course, "name", "Unnamed Course"),
                    "code": getattr(course, "course_code", ""),
                }
            )
        if not result:
            return json.dumps({"courses": [], "message": "You have no active courses."})
        return json.dumps({"courses": result})
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch courses: {str(e)}"})


def get_assignments(course_id: int) -> str:
    """Fetch assignments for a specific course."""
    try:
        canvas = _get_canvas()
        course = canvas.get_course(course_id)
        assignments = course.get_assignments(order_by="due_at")
        result = []
        for a in assignments:
            result.append(
                {
                    "id": a.id,
                    "name": a.name,
                    "due_at": str(a.due_at) if a.due_at else None,
                    "points_possible": a.points_possible,
                    "description_preview": _strip_html(a.description)[:200] if a.description else "No description",
                    "html_url": getattr(a, "html_url", ""),
                }
            )
        if not result:
            return json.dumps(
                {"assignments": [], "message": "You have no assignments listed for this course."}
            )
        return json.dumps({"assignments": result, "course_name": course.name})
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch assignments: {str(e)}"})


def get_assignment_details(course_id: int, assignment_id: int) -> str:
    """Retrieve the full text of a specific assignment."""
    try:
        canvas = _get_canvas()
        course = canvas.get_course(course_id)
        assignment = course.get_assignment(assignment_id)

        full_description = _strip_html(assignment.description) if assignment.description else "No description available."

        result = {
            "id": assignment.id,
            "name": assignment.name,
            "due_at": str(assignment.due_at) if assignment.due_at else None,
            "points_possible": assignment.points_possible,
            "full_description": full_description,
            "submission_types": getattr(assignment, "submission_types", []),
            "html_url": getattr(assignment, "html_url", ""),
            "course_name": course.name,
        }

        # Auto-index in RAG for future semantic search
        try:
            from rag import index_assignment
            index_assignment(course_id, assignment.id, assignment.name, full_description)
        except Exception:
            pass  # RAG indexing is best-effort

        return json.dumps(result)
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch assignment details: {str(e)}"})


def get_announcements() -> str:
    """Pull latest announcements from all courses."""
    try:
        canvas = _get_canvas()
        courses = canvas.get_courses(enrollment_state="active")
        course_ids = [c.id for c in courses]

        if not course_ids:
            return json.dumps({"announcements": [], "message": "No active courses found."})

        # Build context codes for the announcements endpoint
        context_codes = [f"course_{cid}" for cid in course_ids]

        import requests
        headers = {"Authorization": f"Bearer {config.CANVAS_API_TOKEN}"}
        params = {"per_page": 30}
        for code in context_codes:
            params.setdefault("context_codes[]", [])
            if isinstance(params["context_codes[]"], list):
                params["context_codes[]"].append(code)
            else:
                params["context_codes[]"] = [params["context_codes[]"], code]

        # Use requests directly for announcements (canvasapi has limited support)
        url = f"{config.CANVAS_API_URL}/api/v1/announcements"
        resp = requests.get(url, headers=headers, params=params)
        resp.raise_for_status()

        result = []
        for a in resp.json():
            result.append(
                {
                    "title": a.get("title", ""),
                    "message": _strip_html(a.get("message", "")),
                    "posted_at": a.get("posted_at", ""),
                    "context_code": a.get("context_code", ""),
                }
            )

        if not result:
            return json.dumps({"announcements": [], "message": "No recent announcements found."})
        return json.dumps({"announcements": result})
    except Exception as e:
        return json.dumps({"error": f"Failed to fetch announcements: {str(e)}"})


def search_content(query: str) -> str:
    """Semantic search over indexed content using ChromaDB."""
    try:
        from rag import search
        results = search(query, k=5)
        if not results:
            return json.dumps(
                {"results": [], "message": "No relevant content found in the knowledge base. Try fetching the specific assignment first."}
            )
        return json.dumps({"results": results})
    except Exception as e:
        return json.dumps({"error": f"Search failed: {str(e)}"})


# ============================================================
# TOOL DISPATCHER
# ============================================================

TOOL_MAP = {
    "get_active_courses": get_active_courses,
    "get_assignments": get_assignments,
    "get_assignment_details": get_assignment_details,
    "get_announcements": get_announcements,
    "search_content": search_content,
}


def execute_tool(tool_name: str, arguments: dict) -> str:
    """Execute a tool by name with the given arguments."""
    if tool_name not in TOOL_MAP:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})
    try:
        fn = TOOL_MAP[tool_name]
        return fn(**arguments)
    except TypeError as e:
        return json.dumps({"error": f"Invalid arguments for {tool_name}: {str(e)}"})
