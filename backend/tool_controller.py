"""
Tool Controller: Orchestrates the LLM function-calling loop.

1. Sends user message + tool definitions to K2-Think-v2
2. If LLM returns a tool_call, executes the tool via canvas_tools.py
3. Feeds tool result back to LLM
4. Repeats until LLM returns a final text response
5. Supports both streaming and non-streaming modes
"""

import json
import httpx
from config import config
from canvas_tools import TOOL_DEFINITIONS, execute_tool

# Maximum number of tool-call rounds before forcing a text response
MAX_TOOL_ROUNDS = 6

SYSTEM_PROMPT = """You are "School AI", an intelligent and patient academic tutor with access to the student's Canvas LMS.

CRITICAL FORMATTING RULES:
1. LaTeX for ALL math: Use $x^2$ for inline math, $$formula$$ for block math.
2. Markdown: Use **bold**, *italics*, ## headings, bullet lists, tables.
3. No em dashes. Use commas or colons instead.
4. NEVER use emojis unless the student asks for them.

## Core Teaching Philosophy (Socratic Method)
1. Never give the direct answer first. Guide with questions and hints.
2. Use hints progressively: broad first, then more specific if the student is stuck.
3. Encourage critical thinking: "What do you think happens when...?"
4. If a student says "I give up" or "just tell me", provide the answer with a clear explanation.

## Tool Usage Rules
- ALWAYS use your tools to fetch real Canvas data before answering Canvas-related questions.
- If a tool returns empty results, say "You have no [items] listed." Do NOT hallucinate data.
- For multi-step questions (e.g., "assignments for Economics due this week"):
  1. Call get_active_courses() to find the right course ID
  2. Call get_assignments(course_id) to get that course's assignments
  3. Filter and present results
- For specific assignment content questions, call get_assignment_details() to retrieve the full text.
- Use search_content() when the student asks about previously-seen material.

## Safety
- Never fabricate assignment names, due dates, or grades.
- If the Canvas API returns an error, tell the student there was a connection issue.
- Always cite which course/assignment you are referencing.
"""


async def run_tool_loop(
    user_messages: list[dict],
    on_chunk=None,
    on_tool_call=None,
) -> str:
    """
    Run the function-calling loop until the LLM produces a final text response.

    Args:
        user_messages: List of message dicts (role + content)
        on_chunk: Async callback for streaming text chunks
        on_tool_call: Async callback when a tool is called (for UI feedback)

    Returns:
        The final assistant text response.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + user_messages

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.K2_API_KEY}",
    }

    for round_num in range(MAX_TOOL_ROUNDS):
        # On the final round, don't offer tools to force a text response
        is_last_round = round_num == MAX_TOOL_ROUNDS - 1

        payload = {
            "model": config.K2_MODEL,
            "messages": messages,
            "stream": False,
        }

        if not is_last_round:
            payload["tools"] = TOOL_DEFINITIONS
            payload["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(config.K2_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        choice = data["choices"][0]
        message = choice["message"]

        # If the LLM wants to call tools
        if message.get("tool_calls"):
            # Add the assistant's message with tool_calls to history
            messages.append(message)

            for tool_call in message["tool_calls"]:
                fn_name = tool_call["function"]["name"]
                fn_args = json.loads(tool_call["function"]["arguments"])

                if on_tool_call:
                    await on_tool_call(fn_name, fn_args)

                # Execute the tool
                tool_result = execute_tool(fn_name, fn_args)

                # Add tool result to message history
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": tool_result,
                    }
                )
        else:
            # LLM returned a text response, we're done
            final_text = message.get("content", "")
            return final_text

    # If we exhausted all rounds, return whatever we have
    return "I was unable to complete this request. Please try again with a more specific question."


async def run_tool_loop_streaming(
    user_messages: list[dict],
    on_tool_call=None,
):
    """
    Generator version: runs the tool loop, then streams the final response.
    Yields SSE-formatted chunks.
    """
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + user_messages

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.K2_API_KEY}",
    }

    for round_num in range(MAX_TOOL_ROUNDS):
        is_last_round = round_num == MAX_TOOL_ROUNDS - 1

        # Non-streaming for tool rounds, streaming for final round
        is_final_text_round = is_last_round

        payload = {
            "model": config.K2_MODEL,
            "messages": messages,
            "stream": False,  # Non-streaming for tool resolution
        }

        if not is_last_round:
            payload["tools"] = TOOL_DEFINITIONS
            payload["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(config.K2_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        choice = data["choices"][0]
        message = choice["message"]

        if message.get("tool_calls"):
            messages.append(message)

            for tool_call in message["tool_calls"]:
                fn_name = tool_call["function"]["name"]
                fn_args = json.loads(tool_call["function"]["arguments"])

                if on_tool_call:
                    await on_tool_call(fn_name, fn_args)

                # Yield a tool-call status event
                yield f"data: {json.dumps({'type': 'tool_call', 'name': fn_name, 'args': fn_args})}\n\n"

                tool_result = execute_tool(fn_name, fn_args)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": tool_result,
                    }
                )
        else:
            # Final text response: now stream it
            # Re-request with streaming enabled and no tools
            payload_stream = {
                "model": config.K2_MODEL,
                "messages": messages,
                "stream": True,
            }

            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST", config.K2_API_URL, headers=headers, json=payload_stream
                ) as stream_response:
                    async for line in stream_response.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            parsed = json.loads(data_str)
                            content = parsed["choices"][0]["delta"].get("content", "")
                            if content:
                                yield f"data: {json.dumps({'type': 'content', 'text': content})}\n\n"
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
            return

    yield f"data: {json.dumps({'type': 'content', 'text': 'I was unable to complete this request. Please try again.'})}\n\n"
    yield "data: [DONE]\n\n"
