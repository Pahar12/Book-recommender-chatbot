# 📚 BookWise AI — Intelligent Book Recommender Chatbot

An AI-powered book recommendation chatbot built with **Flask** and **Google Gemini 2.0 Flash API**. The chatbot provides personalized book suggestions, literary discussions, and document-based Q&A with multilingual support.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **Generative AI API** | Google Gemini 2.0 Flash for intelligent responses |
| 📖 **Domain-Constrained** | Strictly focused on books, reading & literature |
| 🧠 **Conversation Memory** | Remembers context across the entire session |
| 📄 **Document Q&A** | Upload text files and ask questions about them |
| 🌍 **Multilingual Support** | Auto-detects language and responds accordingly |
| 🌡️ **Temperature Control** | Adjust randomness/creativity of responses |
| 🎯 **Top-P Control** | Control probability mass of token selection |
| 📊 **Knowledge Base** | Curated FAQs, genre taxonomy, and book database |
| 💾 **Session Storage** | In-memory conversations with localStorage backup |
| ♻️ **Graceful Fallback** | Works without API key using local knowledge base |

## 🏗️ Architecture

```
ai-book-recommender/
├── app.py                          # Flask backend + Gemini API
├── requirements.txt                # Python dependencies
├── .env                            # API keys (not committed)
├── knowledge_base/
│   ├── book_faqs.json              # Domain FAQs & genre taxonomy
│   ├── book_data.json              # Curated book recommendations
│   └── system_prompts.json         # AI system instructions
├── templates/
│   └── index.html                  # Chat interface
├── static/
│   ├── css/style.css               # Premium dark theme
│   └── js/app.js                   # Frontend logic
└── README.md
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd ai-book-recommender
pip install -r requirements.txt
```

### 2. Configure API Key
Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey), then edit `.env`:
```
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Run the Application
```bash
python app.py
```
Open **http://localhost:5000** in your browser.

## 🔧 AI Controls

### Temperature (0.0 – 1.0)
- **Low (0.0–0.3)**: Deterministic, factual answers
- **Medium (0.4–0.7)**: Balanced creativity and accuracy
- **High (0.8–1.0)**: Maximum creativity and variation

### Top-P (0.1 – 1.0)
- **Low (0.1–0.3)**: Restricted, safer responses
- **High (0.7–1.0)**: Broader, more diverse expression

## 📊 Data Collection & Domain Knowledge

The knowledge base was curated from:
- **Goodreads** Top 100 book lists
- **New York Times** Bestseller lists
- **Pulitzer Prize** & **Booker Prize** archives
- **American Library Association** recommendations
- Common user queries and reading intents
- Genre taxonomies and mood-to-genre mappings

## 🌍 Supported Languages

Auto-detects and responds in: English, Hindi, Spanish, French, German, Japanese, Chinese, Korean, Portuguese, Russian, Arabic, Italian, and more.

## 📝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Main chat interface |
| POST | `/api/chat` | Send a message |
| POST | `/api/upload-document` | Upload document for Q&A |
| GET | `/api/history` | Get conversation history |
| POST | `/api/clear` | Clear conversation |
| GET | `/api/suggestions` | Get quick prompts |
| GET | `/api/status` | Check API status |

## 🛠️ Tech Stack

- **Backend**: Python, Flask, Flask-CORS
- **AI API**: Google Gemini 2.0 Flash
- **Language Detection**: langdetect
- **Frontend**: HTML5, CSS3 (custom dark theme), Vanilla JavaScript
- **Design**: Glassmorphism, ambient animations, responsive layout
- **Storage**: Session-based (in-memory) with localStorage backup

## 💾 Data Storage & Persistence

### Current Implementation: Session-Based Storage

BookWise AI uses a **graceful fallback architecture** for data storage:

```
Primary Path (if available):
  SQLite Database (SQLAlchemy ORM)
    ↓ On compatibility issues, automatically falls back to:
  In-Memory Sessions + Browser localStorage
```

### What Gets Saved

✅ **During Session (In-Memory)**
- Conversation history
- Message metadata
- User session ID
- Preferences (temperature, top-p)

✅ **Persistent (Browser localStorage)**
- Chat history (with timestamps)
- Recent conversations list
- User preferences
- Chat export data

❌ **Not Persisted (yet)**
- Cross-session history (requires database)
- User profiles (requires authentication)
- Long-term analytics

### Session Lifetime

| When | Data | Status |
|------|------|--------|
| During active chat | In memory + localStorage | ✅ Available |
| After page reload | localStorage synced | ✅ Restored |
| After browser close | localStorage persists | ✅ Can reopen |
| Server restart | In-memory cleared | ℹ️ New session |

**To keep conversations permanent, export before closing the browser!**

### Database Infrastructure (Ready for Upgrade)

The app is prepared for persistent database storage when Python 3.14 compatibility improves:

```python
# Available models in database.py:
- User (profiles, preferences)
- Conversation (session metadata)
- Message (chat history)
- Document (uploaded files metadata)
- DocumentChunk (RAG indexing)
```

See [DATABASE_STRATEGY.md](DATABASE_STRATEGY.md) for detailed information.
