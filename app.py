"""
BookWise AI - Intelligent Book Recommender Chatbot
Flask backend with Gemini API, conversation memory, document Q&A, multilingual support.
"""
import os, json, uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
from langdetect import detect, LangDetectException

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "bookwise-ai-secret-2024")
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "knowledge_base")

def load_json(filename):
    with open(os.path.join(KNOWLEDGE_DIR, filename), "r", encoding="utf-8") as f:
        return json.load(f)

BOOK_FAQS = load_json("book_faqs.json")
BOOK_DATA = load_json("book_data.json")
SYSTEM_PROMPTS = load_json("system_prompts.json")

conversations = {}
uploaded_documents = {}
user_preferences = {}  # Track user preferences across sessions

def track_preferences(session_id, user_message):
    """Track user preferences based on their messages for better personalization"""
    if session_id not in user_preferences:
        user_preferences[session_id] = {"genres": [], "mood": [], "authors": [], "interests": []}
    
    msg_lower = user_message.lower()
    prefs = user_preferences[session_id]
    
    # Track genres mentioned
    genres = ["mystery", "thriller", "sci-fi", "fantasy", "romance", "horror", 
              "literary fiction", "historical", "adventure", "self-help", "non-fiction",
              "educational", "education", "learning", "academic", "study"]
    for genre in genres:
        if genre in msg_lower and genre not in prefs["genres"]:
            prefs["genres"].append(genre)
    
    # Track moods
    moods = ["happy", "sad", "adventurous", "thoughtful", "relaxed", "scared", "motivated"]
    for mood in moods:
        if mood in msg_lower and mood not in prefs["mood"]:
            prefs["mood"].append(mood)
    
    # Track reading preferences
    if "series" in msg_lower:
        prefs["interests"].append("book_series")
    if "standalone" in msg_lower or "one book" in msg_lower:
        prefs["interests"].append("standalone_books")
    if "short" in msg_lower or "quick read" in msg_lower:
        prefs["interests"].append("short_reads")
    if "beginner" in msg_lower or "easy" in msg_lower or "light" in msg_lower:
        prefs["interests"].append("beginner_friendly")

def detect_language(text):
    try:
        return detect(text)
    except LangDetectException:
        return "en"

def build_knowledge_context():
    parts = ["## Domain Knowledge - FAQs:"]
    for faq in BOOK_FAQS.get("faqs", []):
        parts.append(f"Q: {faq['question']}\nA: {faq['answer']}\n")
    parts.append("\n## Genre Taxonomy:")
    for cat, genres in BOOK_FAQS.get("genre_taxonomy", {}).items():
        parts.append(f"- {cat.title()}: {', '.join(genres)}")
    parts.append("\n## Mood Mappings:")
    for mood, genres in BOOK_FAQS.get("mood_mappings", {}).items():
        parts.append(f"- {mood.title()}: {', '.join(genres)}")
    parts.append("\n## Curated Books (use as reference, but recommend beyond this list too):")
    for cat, books in BOOK_DATA.get("curated_recommendations", {}).items():
        parts.append(f"\n### {cat.replace('_', ' ').title()}:")
        for b in books:
            parts.append(f"- \"{b['title']}\" by {b['author']} ({b['genre']}, {b['year']}) - {b['description']}")
    # Add Indian authors reference
    indian_ref = BOOK_DATA.get("indian_authors_reference", {})
    if indian_ref:
        parts.append("\n## Indian Authors Reference:")
        for category, authors in indian_ref.items():
            parts.append(f"- {category.replace('_', ' ').title()}: {', '.join(authors)}")
    return "\n".join(parts)

def build_conversation_history(session_id):
    history = conversations.get(session_id, [])
    if not history:
        return ""
    formatted = "\n## Conversation History:\n"
    for msg in history[-10:]:
        role = "User" if msg["role"] == "user" else "BookWise AI"
        formatted += f"{role}: {msg['content']}\n\n"
    return formatted

def get_gemini_response(user_message, session_id, temperature=0.7, top_p=0.9):
    if not GEMINI_API_KEY:
        return generate_fallback_response(user_message)
    lang = detect_language(user_message)
    system_prompt = SYSTEM_PROMPTS["system_prompt"]
    knowledge = build_knowledge_context()
    history = build_conversation_history(session_id)
    doc_ctx = ""
    if session_id in uploaded_documents and uploaded_documents[session_id]:
        doc_ctx = f"\n## Uploaded Document:\n{uploaded_documents[session_id][:5000]}\n"
    lang_inst = ""
    if lang != "en":
        lang_inst = f"\n**IMPORTANT**: Respond in language '{lang}' matching the user.\n"
    full_prompt = f"{system_prompt}\n\n{knowledge}\n{doc_ctx}\n{history}\n{lang_inst}\nUser: {user_message}\n\nRespond helpfully:"
    try:
        config = genai.types.GenerationConfig(temperature=temperature, top_p=top_p, max_output_tokens=1500)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(full_prompt, generation_config=config)
        return response.text
    except Exception as e:
        print(f"Gemini API Error: {e}")
        return generate_fallback_response(user_message)

def generate_fallback_response(user_message):
    msg = user_message.lower()
    greetings = ["hello", "hi", "hey", "greetings", "good morning", "good evening", "namaste"]
    if any(g in msg for g in greetings):
        return ("📚 **Hello! Welcome to BookWise AI!**\n\n"
                "I can help you with:\n"
                "1. 📖 **Book Recommendations** — by genre, mood, author, or region\n"
                "2. 📝 **Book Summaries** — spoiler-free overviews\n"
                "3. ✍️ **Author Information** — explore writers and their works\n"
                "4. 📋 **Reading Lists** — curated selections by theme or culture\n"
                "5. 📚 **Book Series** — binge-worthy series recommendations\n"
                "6. 📄 **Document Q&A** — upload and discuss documents\n\n"
                "What kind of book are you in the mood for? 🎉")

    # Detect regional/cultural keywords
    indian_keywords = ["indian", "india", "hindi", "desi", "bollywood", "bharat",
                       "tamil", "bengali", "marathi", "telugu", "kannada", "malayalam",
                       "urdu", "punjabi", "gujarati", "premchand", "tagore", "narayan",
                       "ruskin bond", "chetan bhagat", "arundhati", "rushdie", "jhumpa",
                       "vikram", "amitav", "sudha murty", "ashwin sanghi"]
    is_indian_query = any(kw in msg for kw in indian_keywords)

    # Detect genre keywords
    genre_keywords = {
        "mystery_thriller": ["mystery", "thriller", "suspense", "detective", "crime", "whodunit"],
        "science_fiction_fantasy": ["sci-fi", "science fiction", "fantasy", "space", "magic", "dragon", "cyberpunk"],
        "self_improvement": ["self-help", "self-improvement", "productivity", "motivation", "habits", "psychology", "mindset"],
        "educational_books": ["educational", "education", "learning", "study", "academic", "school", "college", "university", "textbook", "science", "history", "coding"],
        "indian_literature": ["indian", "india", "hindi", "desi", "bharat"],
        "all_time_classics": ["classic", "classics", "timeless", "greatest", "all-time"],
        "modern_bestsellers": ["modern", "recent", "new", "bestseller", "trending", "2020", "2021", "2022", "2023", "2024"],
        "historical_fiction": ["historical", "history", "past", "war", "period"],
        "romance": ["romance", "love", "romantic", "relationship", "enemies to lovers"]
    }

    # Check for series, trending, beginner books
    if any(w in msg for w in ["educational", "education", "learning", "academic", "study", "school", "college", "university", "coding", "textbook"]):
        educational = BOOK_DATA.get("curated_recommendations", {}).get("educational_books", [])[:5]
        if educational:
            parts = ["🎓 **Educational book recommendations:**\n"]
            for b in educational:
                parts.append(f"**{b['title']}** by {b['author']}\n"
                             f"   📌 *{b['genre']}* ({b['year']}) — {b['description']}\n")
            parts.append("\n💡 *Great for learning, study, and academic curiosity!*")
            return "\n".join(parts)

    if any(w in msg for w in ["series", "binge", "sequential", "ongoing"]):
        series = BOOK_DATA.get("book_series", {}).get("popular_series", [])[:5]
        if series:
            parts = ["📚 **Great book series to dive into:**\n"]
            for s in series:
                parts.append(f"**{s['series']}** by {s['author']}\n"
                             f"   📌 {s['books']} books • {s['description']}\n")
            parts.append("\n💡 *For more detailed recommendations, set up your Gemini API key!*")
            return "\n".join(parts)
    
    if any(w in msg for w in ["trending", "new", "popular", "bestseller", "2024"]):
        trending = BOOK_DATA.get("trending_books", [])[:5]
        if trending:
            parts = ["⭐ **Currently Trending Books:**\n"]
            for b in trending:
                parts.append(f"**{b['title']}** by {b['author']}\n"
                             f"   📌 *{b['genre']}* ({b['year']}) — {b['description']}\n")
            parts.append("\n💡 *For personalized picks, set up your Gemini API key!*")
            return "\n".join(parts)
    
    if any(w in msg for w in ["beginner", "start reading", "easy", "simple", "beginner friendly", "first book"]):
        beginner = BOOK_DATA.get("beginner_friendly", [])[:5]
        if beginner:
            parts = ["👶 **Perfect books to start your reading journey:**\n"]
            for b in beginner:
                parts.append(f"**{b['title']}** by {b['author']}\n"
                             f"   📌 *{b['genre']}* — {b['description']}\n")
            parts.append("\n💡 *These books are accessible and engaging for new readers!*")
            return "\n".join(parts)
    
    if any(w in msg for w in ["quick", "short", "fast", "fast read", "little time"]):
        short = BOOK_DATA.get("short_reads", [])[:5]
        if short:
            parts = ["⚡ **Quick reads you can finish fast:**\n"]
            for b in short:
                pages = b.get('pages', '~100')
                parts.append(f"**{b['title']}** by {b['author']}\n"
                             f"   📌 *{b['genre']}* ({pages} pages) — {b['description']}\n")
            parts.append("\n💡 *Perfect for commutes or weekend reading!*")
            return "\n".join(parts)

    # Check for summary requests
    if any(w in msg for w in ["summary", "summarize", "about", "plot", "overview"]):
        all_books = []
        for cat, books in BOOK_DATA.get("curated_recommendations", {}).items():
            all_books.extend(books)
        all_books.extend(BOOK_DATA.get("trending_books", []))
        all_books.extend(BOOK_DATA.get("beginner_friendly", []))
        all_books.extend(BOOK_DATA.get("short_reads", []))
        
        found_books = []
        for b in all_books:
            if b['title'].lower() in msg:
                if not any(fb['title'] == b['title'] for fb in found_books):
                    found_books.append(b)
        
        if found_books:
            parts = ["📝 **Here is the summary you requested:**\n"]
            for b in found_books[:3]:
                summary_text = b.get("summary", b.get("description", "No summary available."))
                parts.append(f"**{b['title']}** by {b['author']}\n   {summary_text}\n")
            parts.append("\n💡 *For summaries of other books, set up your Gemini API key!*")
            return "\n".join(parts)
        else:
            return ("📝 **Book Summaries**\n\n"
                    "I can provide spoiler-free summaries for books in my database. "
                    "Try asking:\n- *\"Give me a summary of The Great Gatsby\"*\n"
                    "- *\"What is 1984 about?\"*\n\n"
                    "💡 *For summaries of any book in the world, please set your Gemini API key in the `.env` file!*")

    # Find matching categories
    matched_categories = []
    if is_indian_query:
        matched_categories.append("indian_literature")
    for cat, keywords in genre_keywords.items():
        if cat not in matched_categories and any(kw in msg for kw in keywords):
            matched_categories.append(cat)

    # If we have matches or generic book request
    if matched_categories or any(w in msg for w in ["recommend", "suggest", "book", "read", "fiction", "novel", "author", "writer"]):
        recs = BOOK_DATA.get("curated_recommendations", {})
        parts = []

        if is_indian_query:
            parts.append("📚🇮🇳 **Indian Literature Recommendations:**\n")
        else:
            parts.append("📚 **Here are some great recommendations:**\n")

        # If no specific category matched, pick from all
        if not matched_categories:
            matched_categories = list(recs.keys())

        count = 0
        for cat in matched_categories:
            books = recs.get(cat, [])
            for b in books:
                if count >= 8:
                    break
                parts.append(f"**{count+1}. \"{b['title']}\"** by {b['author']}\n"
                             f"   📌 *{b['genre']}* ({b['year']})\n"
                             f"   {b['description']}\n")
                count += 1
            if count >= 8:
                break

        if count == 0:
            parts.append("I'd love to help! Could you tell me more about your preferences? 🤔\n")
        else:
            parts.append("\n**Want something more specific?** I'd love to help! 🤔\n"
                         "Could you tell me:\n"
                         "1. Do you prefer standalone novels or book series?\n"
                         "2. Are you looking for something light and fun, or more thought-provoking?\n"
                         "3. What is your favorite genre or what mood are you in right now?\n")

        parts.append("\n💡 *For the best experience with personalized and diverse recommendations, "
                     "please set your Gemini API key in the `.env` file!*")
        return "\n".join(parts)

    # Check FAQs
    for faq in BOOK_FAQS.get("faqs", []):
        kws = faq["question"].lower().split()
        if sum(1 for kw in kws if kw in msg) >= 3:
            return f"📚 **Great question!**\n\n{faq['answer']}"

    return ("📚 I'm BookWise AI! I help with book recommendations, summaries, and literary discussions.\n\n"
            "Try asking:\n- *\"Recommend Indian literature\"*\n- *\"Best thriller novels\"*\n"
            "- *\"Books by Premchand\"*\n- *\"Suggest science fiction for beginners\"*\n"
            "- *\"Best book series to binge\"*\n- *\"Trending books\"*\n\n"
            "What would you like to explore? 🎯")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    user_message = data.get("message", "").strip()
    session_id = data.get("session_id", str(uuid.uuid4()))
    temperature = float(data.get("temperature", 0.7))
    top_p = float(data.get("top_p", 0.9))
    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400
    if session_id not in conversations:
        conversations[session_id] = []
    
    # Track user preferences for personalization
    track_preferences(session_id, user_message)
    
    conversations[session_id].append({"role": "user", "content": user_message, "timestamp": datetime.now().isoformat()})
    lang = detect_language(user_message)
    ai_response = get_gemini_response(user_message, session_id, temperature, top_p)
    conversations[session_id].append({"role": "assistant", "content": ai_response, "timestamp": datetime.now().isoformat()})
    return jsonify({"response": ai_response, "session_id": session_id, "language": lang, "timestamp": datetime.now().isoformat(), "message_count": len(conversations[session_id])})

@app.route("/api/upload-document", methods=["POST"])
def upload_document():
    if "document" not in request.files:
        return jsonify({"error": "No document uploaded"}), 400
    file = request.files["document"]
    session_id = request.form.get("session_id", str(uuid.uuid4()))
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    allowed = {".txt", ".md", ".csv", ".json", ".html", ".xml"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        return jsonify({"error": f"Unsupported type. Allowed: {', '.join(allowed)}"}), 400
    try:
        content = file.read().decode("utf-8")
        uploaded_documents[session_id] = content
        return jsonify({"success": True, "filename": file.filename, "char_count": len(content), "session_id": session_id,
                         "message": f"📄 Document '{file.filename}' uploaded ({len(content):,} chars). Ask me questions about it!"})
    except Exception as e:
        return jsonify({"error": f"Error reading file: {str(e)}"}), 500

@app.route("/api/history", methods=["GET"])
def get_history():
    session_id = request.args.get("session_id", "")
    return jsonify({"history": conversations.get(session_id, []), "session_id": session_id})

@app.route("/api/clear", methods=["POST"])
def clear_conversation():
    sid = request.json.get("session_id", "")
    conversations.pop(sid, None)
    uploaded_documents.pop(sid, None)
    return jsonify({"success": True, "message": "Conversation cleared."})

@app.route("/api/suggestions", methods=["GET"])
def get_suggestions():
    return jsonify({"suggestions": [
        {"text": "📖 Recommend a thriller", "prompt": "Recommend me a great thriller novel"},
        {"text": "🌟 Best classics", "prompt": "What are the must-read classic books?"},
        {"text": "🧠 Self-improvement", "prompt": "Suggest the best self-improvement books"},
        {"text": "🚀 Sci-fi adventures", "prompt": "Recommend science fiction books for beginners"},
        {"text": "💕 Romance novels", "prompt": "What are the best romance novels?"},
        {"text": "🎭 Book for my mood", "prompt": "I'm feeling adventurous, what should I read?"},
        {"text": "� Book series", "prompt": "Recommend some great book series I can binge"},
        {"text": "⚡ Quick reads", "prompt": "Suggest some short books I can read quickly"},
    ]})

@app.route("/api/series", methods=["GET"])
def get_series():
    """Get popular book series recommendations"""
    series_data = BOOK_DATA.get("book_series", {}).get("popular_series", [])
    return jsonify({"series": series_data})

@app.route("/api/trending", methods=["GET"])
def get_trending():
    """Get trending books"""
    trending = BOOK_DATA.get("trending_books", [])
    return jsonify({"trending": trending})

@app.route("/api/beginner-friendly", methods=["GET"])
def get_beginner_books():
    """Get beginner-friendly books"""
    beginner = BOOK_DATA.get("beginner_friendly", [])
    return jsonify({"beginner_books": beginner})

@app.route("/api/short-reads", methods=["GET"])
def get_short_reads():
    """Get short books"""
    short = BOOK_DATA.get("short_reads", [])
    return jsonify({"short_reads": short})

@app.route("/api/status", methods=["GET"])
def api_status():
    return jsonify({"status": "running", "api_configured": bool(GEMINI_API_KEY),
                     "knowledge_base_loaded": bool(BOOK_FAQS and BOOK_DATA), "active_sessions": len(conversations),
                     "features": {"conversation_memory": True, "document_qa": True, "multilingual": True, "temperature_control": True, "top_p_control": True}})

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print("\n" + "=" * 60)
    print("  📚 BookWise AI - Intelligent Book Recommender")
    print("=" * 60)
    print(f"  🌐 Server: http://localhost:{port}")
    print(f"  🔑 Gemini API: {'✅ Configured' if GEMINI_API_KEY else '⚠️  Not set (fallback mode)'}")
    print(f"  📖 Knowledge Base: ✅ Loaded")
    print(f"  🧠 Memory: ✅ | 🌍 Multilingual: ✅ | 📄 Doc Q&A: ✅")
    print("=" * 60 + "\n")
    app.run(host="0.0.0.0", port=port, debug=True)
