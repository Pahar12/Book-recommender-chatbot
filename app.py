"""
BookWise AI — Production-Ready Upgrade
Enhanced Flask backend with streaming, RAG, document processing, and modular utilities.
Maintains stable operation without database dependency issues.
"""

import os
import json
import uuid
import tempfile
from datetime import datetime
from io import StringIO
from functools import wraps

# Flask & extensions
from flask import Flask, render_template, request, jsonify, stream_with_context, Response
from flask_cors import CORS
from dotenv import load_dotenv

# AI & NLP
import google.generativeai as genai
from langdetect import detect, LangDetectException

# Local imports - our new utility modules
try:
    from embeddings import RAGPipeline
    from document_processor import DocumentProcessor, analyze_document
    from utils import (
        generate_id, stream_gemini_response, stream_sse_format, stream_sse_done,
        validate_file_upload, sanitize_filename, get_text_statistics,
        format_timestamp, extract_code_blocks, is_gemini_quota_error
    )
    HAS_UTILS = True
except ImportError as e:
    print(f"⚠️  Warning: Could not import utility modules: {e}")
    HAS_UTILS = False

# Database imports - optional, graceful fallback
HAS_DB = False
try:
    from database import (
        init_db, get_db, get_user, create_conversation, add_message,
        get_conversation_history, save_document, SessionLocal, User, 
        Conversation as ConvModel, Message as MessageModel
    )
    HAS_DB = True
except Exception as e:
    print(f"⚠️  Database unavailable (using session-based storage): {type(e).__name__}")
    HAS_DB = False

# ═══════════════════════════════════════════════════════════════
#  INITIALIZATION
# ═══════════════════════════════════════════════════════════════

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "bookwise-ai-secret-2024")
CORS(app)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Knowledge base
KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "knowledge_base")

def load_json(filename):
    """Load JSON knowledge base file"""
    try:
        with open(os.path.join(KNOWLEDGE_DIR, filename), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️  Warning: Could not load {filename}: {e}")
        return {}

BOOK_FAQS = load_json("book_faqs.json")
BOOK_DATA = load_json("book_data.json")
SYSTEM_PROMPTS = load_json("system_prompts.json")
AUTHOR_DATA = load_json("author_data.json")

# Initialize database if available
if HAS_DB:
    try:
        init_db()
        print("✅ Database ready for persistent storage")
    except Exception as e:
        print(f"⚠️  Database init skipped (session storage active): {type(e).__name__}")
        HAS_DB = False

# In-memory storage (session-based)
conversations = {}
uploaded_documents = {}
user_preferences = {}

# RAG pipelines per user (if available)
rag_pipelines = {} if HAS_UTILS else None


# ═══════════════════════════════════════════════════════════════
#  UTILITIES & HELPERS
# ═══════════════════════════════════════════════════════════════

def get_rag_pipeline(user_id: str = None) -> 'RAGPipeline':
    """Get or create RAG pipeline for user"""
    if not HAS_UTILS or rag_pipelines is None:
        return None
    
    user_id = user_id or "default"
    if user_id not in rag_pipelines:
        rag_pipelines[user_id] = RAGPipeline()
    return rag_pipelines[user_id]


def detect_language(text: str) -> str:
    """Detect text language"""
    try:
        return detect(text)
    except:
        return "en"


def track_preferences(session_id, user_message):
    """Track user preferences based on their messages for better personalization"""
    if session_id not in user_preferences:
        user_preferences[session_id] = {
            "genres": [], "mood": [], "authors": [], "interests": []
        }
    
    msg_lower = user_message.lower()
    prefs = user_preferences[session_id]
    
    # Track genres
    genres = ["mystery", "thriller", "sci-fi", "fantasy", "romance", "horror", 
              "literary fiction", "historical", "adventure", "self-help"]
    for genre in genres:
        if genre in msg_lower and genre not in prefs["genres"]:
            prefs["genres"].append(genre)


def build_knowledge_context():
    """Build system context from knowledge base"""
    parts = ["## Domain Knowledge - FAQs:"]
    for faq in BOOK_FAQS.get("faqs", [])[:3]:
        parts.append(f"Q: {faq.get('question', '')}\nA: {faq.get('answer', '')}\n")
    
    # Genre taxonomy
    genre_text = "\n## Genre Taxonomy:\n"
    for cat, genres in BOOK_FAQS.get("genre_taxonomy", {}).items():
        genre_text += f"- {cat.title()}: {', '.join(genres)}\n"
    parts.append(genre_text)
    
    return "\n".join(parts)


def build_conversation_history(session_id):
    """Build conversation history context"""
    history = conversations.get(session_id, [])
    if not history:
        return ""
    
    formatted = "\n## Conversation History:\n"
    for msg in history[-5:]:
        role = "User" if msg["role"] == "user" else "BookWise AI"
        formatted += f"{role}: {msg['content'][:200]}\n\n"
    return formatted


def get_uploaded_document_text(session_id):
    """Return uploaded document text and metadata for a session."""
    payload = uploaded_documents.get(session_id)

    if isinstance(payload, dict):
        return payload.get("text", ""), payload.get("metadata", {})

    if isinstance(payload, str):
        return payload, {}

    return "", {}


def build_document_context(session_id, user_message):
    """Build context from uploaded documents and RAG retrieval."""
    document_text, metadata = get_uploaded_document_text(session_id)
    context_parts = []

    if HAS_UTILS:
        pipeline = get_rag_pipeline(session_id)
        if pipeline:
            rag_context = pipeline.get_rag_context(user_message)
            if rag_context:
                context_parts.append(rag_context)

    if document_text and not context_parts:
        context_parts.append(f"## Uploaded Document Context:\n{document_text[:2000]}")

    if metadata:
        context_parts.append(f"## Document Metadata:\n{json.dumps(metadata, ensure_ascii=False, indent=2)}")

    return "\n\n".join(context_parts)


def build_prompt(user_message, session_id, temperature=0.7, top_p=0.9):
    """Build the full LLM prompt with knowledge, history, and optional RAG context."""
    lang = detect_language(user_message)
    system_prompt = SYSTEM_PROMPTS.get("system_prompt", "You are BookWise AI.")
    knowledge = build_knowledge_context()
    history = build_conversation_history(session_id)
    document_context = build_document_context(session_id, user_message)

    lang_inst = f"\n🌍 Respond in {lang.upper()}." if lang != "en" else ""

    prompt_parts = [system_prompt, knowledge]
    if history:
        prompt_parts.append(history)
    if document_context:
        prompt_parts.append(document_context)
    if lang_inst:
        prompt_parts.append(lang_inst.strip())

    prompt_parts.append(f"User: {user_message}")
    prompt_parts.append("BookWise AI:")
    return "\n\n".join(prompt_parts), lang


def get_gemini_response(user_message, session_id, temperature=0.7, top_p=0.9):
    """Get response from Gemini API with context"""
    if not GEMINI_API_KEY:
        return get_fallback_response(user_message)
    
    try:
        full_prompt, _ = build_prompt(user_message, session_id, temperature, top_p)
        
        config = genai.types.GenerationConfig(
            temperature=temperature,
            top_p=top_p,
            max_output_tokens=1500,
        )
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(full_prompt, generation_config=config)
        return response.text
    
    except Exception as e:
        if is_gemini_quota_error(e):
            print(f"⚠️ Gemini quota exhausted, using fallback: {e}")
        else:
            print(f"❌ Gemini API Error: {e}")
        return get_fallback_response(user_message)


def get_fallback_response(message: str) -> str:
    """Fallback response from knowledge base"""
    msg_lower = message.lower()
    
    # Greetings
    if any(g in msg_lower for g in ["hello", "hi", "hey", "greetings", "namaste"]):
        return """📚 **Welcome to BookWise AI!** 👋

I'm your intelligent literary companion. I help with:
• 📖 Book recommendations by genre, mood, or author
• 📝 Spoiler-free summaries
• 🏆 Trending & classic books
• 📚 Book series suggestions
• 📄 Document Q&A (upload files)
• 🌍 Multilingual support

**What would you like to explore?** 🎯"""
    
    # Book recommendations
    recs = BOOK_DATA.get("curated_recommendations", {})
    if recs and any(w in msg_lower for w in ["recommend", "suggest", "book"]):
        parts = ["📚 **Great recommendations for you!**\n"]
        count = 0
        for cat, books in recs.items():
            if count >= 5:
                break
            parts.append(f"\n**{cat.replace('_', ' ').title()}:**")
            for book in books[:1]:
                parts.append(f"• **{book.get('title')}** by {book.get('author')}")
            count += 1
        return "\n".join(parts)
    
    return """📚 I'm BookWise AI! Ask me about:
- Book recommendations
- Literary discussions
- Book summaries
- Reading lists

*Enable Gemini API in .env for full capabilities!*"""


# ═══════════════════════════════════════════════════════════════
#  ROUTES - CHAT
# ═══════════════════════════════════════════════════════════════

@app.route("/", methods=["GET"])
def index():
    """Main chat interface"""
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    """Send message and get response"""
    try:
        data = request.json
        message = data.get("message", "").strip()
        session_id = data.get("session_id") or f"session_{uuid.uuid4()}"
        temperature = float(data.get("temperature", 0.7))
        top_p = float(data.get("top_p", 0.9))
        
        if not message:
            return jsonify({"error": "Message cannot be empty"}), 400
        if len(message) > 5000:
            return jsonify({"error": "Message too long"}), 400
        
        # Initialize conversation (in-memory)
        if session_id not in conversations:
            conversations[session_id] = []
        
        # If database available, also save to DB
        if HAS_DB:
            try:
                add_message(session_id, "user", message, detect_language(message))
            except Exception as db_err:
                print(f"⚠️  DB save skipped: {type(db_err).__name__}")
        
        # Track preferences
        track_preferences(session_id, message)
        
        # Add user message
        conversations[session_id].append({
            "role": "user",
            "content": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # Get response
        lang = detect_language(message)
        ai_response = get_gemini_response(message, session_id, temperature, top_p)
        
        # Add AI response
        conversations[session_id].append({
            "role": "assistant",
            "content": ai_response,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # If database available, also save to DB
        if HAS_DB:
            try:
                add_message(session_id, "assistant", ai_response, "en")
            except Exception as db_err:
                print(f"⚠️  DB save skipped: {type(db_err).__name__}")
        
        return jsonify({
            "success": True,
            "response": ai_response,
            "session_id": session_id,
            "language": lang,
            "timestamp": datetime.utcnow().isoformat(),
            "message_count": len(conversations[session_id])
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """Stream response token by token"""
    try:
        data = request.json
        message = data.get("message", "").strip()
        session_id = data.get("session_id") or f"session_{uuid.uuid4()}"
        temperature = float(data.get("temperature", 0.7))
        top_p = float(data.get("top_p", 0.9))
        
        if not message:
            return jsonify({"error": "Message cannot be empty"}), 400
        
        # Initialize conversation
        if session_id not in conversations:
            conversations[session_id] = []

        lang = detect_language(message)
        
        # Add user message
        conversations[session_id].append({
            "role": "user",
            "content": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        # If database available, also save to DB
        if HAS_DB:
            try:
                add_message(session_id, "user", message, lang)
            except Exception as db_err:
                print(f"⚠️  DB save skipped: {type(db_err).__name__}")
        
        def generate():
            try:
                full_response = ""
                prompt, lang = build_prompt(message, session_id, temperature, top_p)

                yield f"data: {json.dumps({'type': 'meta', 'language': lang, 'session_id': session_id})}\n\n"
                
                if not HAS_UTILS or not GEMINI_API_KEY:
                    # Fallback non-streaming
                    response = get_fallback_response(message)
                    full_response = response
                    yield f"data: {json.dumps({'type': 'content', 'content': response})}\n\n"
                else:
                    # Stream with utils available
                    for chunk in stream_gemini_response(prompt, temperature, top_p):
                        full_response += chunk
                        yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
                
                # Save response
                conversations[session_id].append({
                    "role": "assistant",
                    "content": full_response,
                    "timestamp": datetime.utcnow().isoformat()
                })
                
                # If database available, also save to DB
                if HAS_DB:
                    try:
                        add_message(session_id, "assistant", full_response, "en")
                    except Exception as db_err:
                        print(f"⚠️  DB save skipped: {type(db_err).__name__}")
                
                yield "data: [DONE]\n\n"
            
            except Exception as e:
                if is_gemini_quota_error(e):
                    fallback = get_fallback_response(message)
                    yield f"data: {json.dumps({'type': 'content', 'content': fallback})}\n\n"
                    conversations[session_id].append({
                        "role": "assistant",
                        "content": fallback,
                        "timestamp": datetime.utcnow().isoformat()
                    })
                    yield "data: [DONE]\n\n"
                    return

                yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={'X-Accel-Buffering': 'no'}
        )
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
#  ROUTES - DOCUMENTS
# ═══════════════════════════════════════════════════════════════

@app.route("/api/upload-document", methods=["POST"])
def upload_document():
    """Upload and process document"""
    try:
        if "document" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files["document"]
        session_id = request.form.get("session_id", str(uuid.uuid4()))
        
        if not file.filename:
            return jsonify({"error": "No file selected"}), 400

        ext = os.path.splitext(file.filename)[1].lower()
        allowed_extensions = tuple(DocumentProcessor.get_supported_formats()) if HAS_UTILS else (
            ".txt", ".md", ".csv", ".json", ".html", ".xml"
        )

        file_bytes = file.read()
        if HAS_UTILS:
            is_valid, error_message = validate_file_upload(
                file.filename,
                len(file_bytes),
                allowed_extensions=allowed_extensions,
            )
        else:
            is_valid = ext in allowed_extensions
            error_message = f"Unsupported format. Allowed: {', '.join(allowed_extensions)}"

        if not is_valid:
            return jsonify({"error": error_message}), 400

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
                temp_file.write(file_bytes)
                temp_path = temp_file.name

            if HAS_UTILS:
                extracted_text, metadata = DocumentProcessor.process(temp_path)
                stats = analyze_document(extracted_text)
            else:
                extracted_text = file_bytes.decode("utf-8", errors="ignore")
                metadata = {
                    "filename": file.filename,
                    "file_type": ext.lstrip('.'),
                    "file_size": len(file_bytes),
                }
                stats = get_text_statistics(extracted_text)

            uploaded_documents[session_id] = {
                "text": extracted_text,
                "metadata": metadata,
                "filename": sanitize_filename(file.filename),
                "uploaded_at": datetime.utcnow().isoformat(),
            }

            if HAS_UTILS:
                pipeline = get_rag_pipeline(session_id)
                if pipeline:
                    pipeline.ingest_document(extracted_text)

            return jsonify({
                "success": True,
                "filename": file.filename,
                "char_count": stats.get("char_count", len(extracted_text)),
                "word_count": stats.get("word_count", len(extracted_text.split())),
                "page_count": metadata.get("page_count", 0),
                "session_id": session_id,
                "metadata": metadata,
                "message": f"📄 Document uploaded! {stats.get('word_count', len(extracted_text.split()))} words."
            })
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
#  ROUTES - UTILITIES
# ═══════════════════════════════════════════════════════════════

@app.route("/api/history", methods=["GET"])
def get_history():
    """Get conversation history"""
    session_id = request.args.get("session_id", "")
    return jsonify({
        "history": conversations.get(session_id, []),
        "session_id": session_id
    })


@app.route("/api/clear", methods=["POST"])
def clear_conversation():
    """Clear conversation"""
    sid = request.json.get("session_id", "")
    conversations.pop(sid, None)
    uploaded_documents.pop(sid, None)
    return jsonify({"success": True, "message": "Cleared!"})


@app.route("/api/suggestions", methods=["GET"])
def get_suggestions():
    """Get suggested prompts"""
    return jsonify({
        "suggestions": [
            {"text": "📖 Thriller recommendation", "prompt": "Recommend a great thriller"},
            {"text": "🌟 Best classics", "prompt": "What are must-read classics?"},
            {"text": "🚀 Sci-fi for beginners", "prompt": "Sci-fi books for beginners?"},
            {"text": "💕 Romance novels", "prompt": "Best romance novels?"},
            {"text": "📚 Book series", "prompt": "Great book series to binge?"},
            {"text": "⚡ Quick reads", "prompt": "Short books I can finish fast?"},
        ]
    })


@app.route("/api/status", methods=["GET"])
def status():
    """Check service status"""
    return jsonify({
        "status": "running",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "gemini_api": "✅" if GEMINI_API_KEY else "⚠️",
            "knowledge_base": "✅" if BOOK_FAQS else "⚠️",
            "utils": "✅" if HAS_UTILS else "⚠️",
            "database": "✅ persistent" if HAS_DB else "📝 session-based",
        },
        "features": {
            "streaming": HAS_UTILS,
            "rag": HAS_UTILS,
            "document_qa": HAS_UTILS,
            "multilingual": True,
            "fallback_mode": True,
            "persistent_storage": HAS_DB,
        }
    })


@app.route("/api/series", methods=["GET"])
def get_series():
    """Get book series"""
    series_data = BOOK_DATA.get("book_series", {}).get("popular_series", [])
    return jsonify({"series": series_data})


@app.route("/api/beginner-friendly", methods=["GET"])
def get_beginner_books():
    """Get beginner-friendly books"""
    return jsonify({"beginner_books": BOOK_DATA.get("beginner_friendly", [])})


@app.route("/api/short-reads", methods=["GET"])
def get_short_reads():
    """Get short reads"""
    return jsonify({"short_reads": BOOK_DATA.get("short_reads", [])})


@app.route("/api/trending", methods=["GET"])
def get_trending():
    """Get trending books"""
    return jsonify({"trending": BOOK_DATA.get("trending_books", [])})


@app.route("/api/author", methods=["GET"])
def get_author():
    """Get author information and introduction"""
    author_name = request.args.get("name", "").lower().strip()
    
    if not author_name:
        return jsonify({"error": "Author name required"}), 400
    
    # Search for author in the database
    authors = AUTHOR_DATA.get("authors", {})
    
    # Try exact match or fuzzy matching
    found_author = None
    found_key = None
    
    # Try exact key match first
    for key, author in authors.items():
        if author.get("name", "").lower() == author_name:
            found_author = author
            found_key = key
            break
    
    # If not found, try partial name matching
    if not found_author:
        for key, author in authors.items():
            author_full_name = author.get("name", "").lower()
            if author_name in author_full_name or author_full_name in author_name:
                found_author = author
                found_key = key
                break
    
    if not found_author:
        # Fall back to Gemini for authors not in knowledge base
        if GEMINI_API_KEY:
            try:
                prompt = f"""Provide a comprehensive introduction for {author_name}. Include:
- Full name and nationality
- Birth year, death year (if applicable), and birthplace
- A brief biography (2-3 paragraphs)
- Literary style and themes
- Major works (list of at least 3)
- Awards and recognition
- A famous quote
- 3-4 interesting facts
- Recommended starting points for different reader types

Format as a detailed author profile."""
                
                response = get_gemini_response(prompt, session_id="system", temperature=0.7)
                return jsonify({
                    "author": author_name,
                    "source": "gemini",
                    "profile": response
                })
            except Exception as e:
                return jsonify({"error": f"Author not found and Gemini unavailable: {str(e)}"}), 404
        else:
            return jsonify({"error": f"Author '{author_name}' not found in knowledge base"}), 404
    
    # Return author info from knowledge base
    return jsonify({
        "author": found_author.get("name", ""),
        "source": "knowledge_base",
        "profile": {
            "name": found_author.get("name", ""),
            "nationality": found_author.get("nationality", ""),
            "birth_year": found_author.get("birth_year", ""),
            "death_year": found_author.get("death_year"),
            "born_in": found_author.get("born_in", ""),
            "biography": found_author.get("biography", ""),
            "literary_style": found_author.get("literary_style", ""),
            "themes": found_author.get("themes", ""),
            "major_works": found_author.get("major_works", []),
            "awards": found_author.get("awards", []),
            "quote": found_author.get("quote", ""),
            "interested_facts": found_author.get("interesting_facts", []),
            "influenced_by": found_author.get("influenced_by", [])
        }
    })


# ═══════════════════════════════════════════════════════════════
#  ERROR HANDLERS
# ═══════════════════════════════════════════════════════════════

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Server error"}), 500


# ═══════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    
    print("\n" + "=" * 70)
    print("  📚 BookWise AI — Production-Ready Upgrade")
    print("=" * 70)
    print(f"  🌐 Server: http://localhost:{port}")
    print(f"  🔑 Gemini API: {'✅ Ready' if GEMINI_API_KEY else '⚠️  Fallback mode'}")
    print(f"  📚 Knowledge Base: {'✅ Loaded' if BOOK_FAQS else '⚠️  Missing'}")
    print(f"  🚀 Utils: {'✅ Available (Streaming, RAG, Docs)' if HAS_UTILS else '⚠️  Basic mode'}")
    print(f"  💾 Storage: {'✅ Persistent DB' if HAS_DB else '📝 Session-based (in-memory)'}")
    print("=" * 70)
    print(f"  Features: Streaming | RAG | Document Q&A | Multilingual | Fallback\n")
    
    app.run(host="0.0.0.0", port=port, debug=True)
