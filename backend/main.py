"""
School AI Backend — FastAPI Application.
Provides SSE streaming chat endpoint with Canvas LMS integration,
function calling, and RAG-powered semantic search.
"""

import json
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from config import config
from tool_controller import run_tool_loop_streaming
from canvas_tools import get_active_courses
from pdf_tools import extract_pdf_text
from rag import get_stats

app = FastAPI(
    title="School AI Backend",
    description="Production-grade RAG + Function Calling backend for Canvas LMS",
    version="1.0.0",
)

# --- FIX FOR "FAILED TO FETCH" ---
# Changing config.ALLOWED_ORIGINS to ["*"] ensures your browser 
# doesn't block the connection to localhost.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "service": "School AI Backend", "version": "1.0.0"}

@app.get("/api/courses")
async def list_courses():
    """Quick endpoint to list active courses."""
    try:
        result = json.loads(get_active_courses())
        return JSONResponse(content=result)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/stats")
async def stats():
    """Get RAG index statistics."""
    return JSONResponse(content=get_stats())

@app.post("/api/chat")
async def chat(request: Request):
    """
    SSE streaming chat endpoint.
    Streams Server-Sent Events with tool calls and content chunks.
    """
    body = await request.json()
    messages = body.get("messages", [])

    if not messages:
        return JSONResponse(
            status_code=400,
            content={"error": "No messages provided"},
        )

    # Allow per-request overrides for Canvas/K2 credentials if provided by frontend
    if body.get("api_key"):
        config.K2_API_KEY = body["api_key"]
    if body.get("canvas_url"):
        config.CANVAS_API_URL = body["canvas_url"]
    if body.get("canvas_token"):
        config.CANVAS_API_TOKEN = body["canvas_token"]

    async def event_stream():
        try:
            async for chunk in run_tool_loop_streaming(messages):
                yield chunk
        except Exception as e:
            # If the LLM (K2/OpenAI) fails, this catches it and sends the error to the chat
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/extract-pdf")
async def extract_pdf(request: Request):
    try:
        file_name = request.headers.get("X-File-Name", "document.pdf")
        file_bytes = await request.body()
        payload = extract_pdf_text(file_bytes, file_name)
        return JSONResponse(content=payload)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"PDF extraction failed: {str(e)}"})

@app.post("/api/index")
async def trigger_index(request: Request):
    """
    Trigger manual re-indexing of Canvas content into ChromaDB.
    """
    try:
        from canvasapi import Canvas
        from rag import index_assignment
        import re
        from html import unescape

        canvas = Canvas(config.CANVAS_API_URL, config.CANVAS_API_TOKEN)
        courses = canvas.get_courses(enrollment_state="active")

        total_indexed = 0
        for course in courses:
            try:
                assignments = course.get_assignments()
                for a in assignments:
                    if a.description:
                        clean = re.sub(r"<[^>]+>", " ", a.description)
                        clean = unescape(clean)
                        clean = re.sub(r"\s+", " ", clean).strip()
                        count = index_assignment(course.id, a.id, a.name, clean)
                        total_indexed += count
            except Exception:
                continue

        return JSONResponse(
            content={
                "status": "ok",
                "total_chunks_indexed": total_indexed,
                "stats": get_stats(),
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Indexing failed: {str(e)}"},
        )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=config.HOST,
        port=config.PORT,
        reload=True,
    )