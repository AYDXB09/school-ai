# Lumina: Technical Product Breakdown & Architecture
**Built for the MBZUAI K2-Think Hackathon (build.k2think.ai)**

Lumina is an advanced, AI-native educational platform designed to seamlessly integrate with a student's existing learning management system (Canvas LMS). By utilizing the **MBZUAI K2-Think-v2** model, Lumina transforms static course materials, assignments, and lectures into a deeply interactive, adaptive, and personalized tutoring experience. 

Unlike generic LLM wrappers, Lumina builds a structured, course-specific knowledge graph for every class, anchoring the AI's responses and assessments strictly to the curriculum taught by the student's actual professors.

---

## 1. System Architecture

Lumina employs a modern, decoupled architecture consisting of a React-based frontend and a Python-powered intelligent backend.

### Frontend (React + Vite)
- **Framework**: React 18 with Vite for lightning-fast HMR and building.
- **UI/UX**: Custom-built, premium dark-mode aesthetic using Vanilla CSS and CSS Modules. Focuses on glassmorphism, fluid micro-animations, and a responsive layout that feels like a native application.
- **State Management**: React Hooks (`useState`, `useMemo`, `useEffect`) heavily utilized to manage complex local state like infinite quiz loops, dynamic mind map graphs, and live chat streaming.
- **Canvas Integration**: Local client-side fetching to the Canvas LMS API (`canvasApi.js`) to cache course lists, assignments, modules, and announcements using the user's personal access token.
- **Mind Map Rendering**: Custom force-directed/hierarchical graph layout system (`TopicMindMap.jsx`) building SVG nodes and edges dynamically based on extracted course concepts.

### Intelligent Backend (Python + FastAPI/Flask)
- **Routing**: Intercepts complex AI requests from the frontend and orchestrates multi-step agentic workflows.
- **Retrieval-Augmented Generation (RAG)**: Integrates with **ChromaDB** to index and semantically search through hundreds of pages of textbooks, lecture transcripts, and Canvas files.
- **Tool Orchestration**: Implements Function Calling with the K2 model, allowing the AI to dynamically query the Canvas API, search the vector database, or generate specific UI elements (like triggering a quiz) mid-conversation.
- **PDF/Media Extraction**: Handles intensive OCR and text extraction (`/api/extract-pdf`) from raw student uploads.

---

## 2. Core Features & Technical Implementation

### A. Context-Aware AI Chat (RAG + K2-Think)
- **The Feature**: A course-specific AI tutor that *knows* the syllabus. If a student asks, "How do I do question 4 on this week's homework?", the AI uses RAG to pull the exact assignment description and relevant textbook chapters.
- **Under the Hood**:
  - The frontend constructs a massive, dynamically updating System Prompt (`createSystemPrompt()`) containing the user's current mastery levels, the course timeline, and recent assignments.
  - The K2-Think-v2 model streams responses back to the frontend (`streamChatBackend`).
  - Supports **"Topic Context" injection**: Users can click a specific concept, and the UI injects a hidden contextual instruction (e.g., `Focus responses strictly on the concept: Combinations and Permutations`) into the prompt array, heavily guiding the K2 model's attention.

### B. Adaptive Infinite Quizzes
- **The Feature**: Generates highly relevant, curriculum-aligned multiple-choice and open-ended questions. Adapts difficulty based on performance until the student reaches "Mastery". Includes full LaTeX math rendering.
- **Under the Hood**:
  - Uses structured JSON generation from the K2 model. The AI is prompted to return a specific JSON schema `{"question": "...", "options": [...], "answer": "...", "explanation": "..."}`.
  - **Dynamic State Loop**: `QuizView.jsx` maintains an internal `masteryScore`. If a student gets a question wrong, the score drops, and the UI triggers the AI to generate *more* targeted questions (`dynamicCount` state) until the threshold (100) is achieved, displaying a celebratory completion state.

### C. AI-Extracted Knowledge Graphs (Concept Mind Maps)
- **The Feature**: Automatically reads through an entire semester of assignments, lectures, and textbook chapters, extracting the core academic concepts and mapping their relationships.
- **Under the Hood**:
  - **Phase 1: Heuristic Extraction (`courseWorkspace.js`)**: Parses raw Canvas assignment titles and descriptions. Uses regex patterns (`extractConceptFromTitle()`) to strip out administrative fluff ("Week 3 - Exercises (4 hours)") and isolate the pure concept ("Combinations and Permutations").
  - **Phase 2: Administrative Filtering**: Applies extensive NLP filtering (`isVagueLabel()`) to drop non-academic nodes like "Blue Slides", "Download and Upload", or "Assessment".
  - **Phase 3: K2 AI Verification**: An asynchronous, non-blocking sequence where the raw extracted labels are sent to the K2-Think model via a specialized prompt (`refineTopicLabelsWithAI()`). The model validates the academic integrity of the term, corrects formatting errors, and maps vague references to concrete curriculum topics.
  - **Phase 4: Graph Building**: Calculates node-weight (`evidenceScore`) based on topic frequency across materials, grouping related concepts into a hierarchical SVG tree.

### D. Mastery Tracking & "Red Areas"
- **The Feature**: Visually depicts a student's weak points. The platform tracks performance across chats, quizzes, and self-assessments.
- **Under the Hood**: Associates every AI interaction with specific nodes in the Knowledge Graph. If the K2 model grades a quiz poorly on "Sovereignty", the mastery score for that specific concept string is decremented, turning the mind map node red and prompting the system prompt to prioritize teaching that topic in future sessions.

---

## 3. Why MBZUAI K2-Think-v2?

Lumina heavily relies on the unique capabilities of the **K2-Think-v2** model:
1. **Deep Reasoning (`<think>` tokens)**: Essential for accurately grading complex mathematical or essay-based open-ended responses from students before giving final output. (The frontend parser explicitly strips `<think>` blocks from the UI to keep the chat clean while benefiting from the logic).
2. **Context Window**: Lumina passes massive amounts of context — textbook excerpts, full Canvas assignment histories, and syllabus rules — in single prompts. K2 handles this large context retrieval flawlessly.
3. **Structured Output Capability**: The entire Mind Map refinement layer and the Quiz generation engine rely on K2's ability to strictly adhere to JSON arrays and object schemas without conversational fluff.

## 4. Conclusion
Lumina represents a leap forward in personalized education. By combining the vast organizational data of Canvas LMS with the powerful reasoning and retrieval capabilities of MBZUAI's K2-Think-v2, it acts not just as an answer bot, but as a fully aware, adaptive teacher's assistant tailored to every individual student.
