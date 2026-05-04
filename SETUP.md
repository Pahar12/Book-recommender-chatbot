# 🚀 BookWise AI - Setup & Installation Guide

Complete guide to set up and run BookWise AI on your system.

---

## 📋 Prerequisites

- **Python 3.8+** - [Download Python](https://www.python.org/downloads/)
- **pip** - Python package manager (usually comes with Python)
- **Google Gemini API Key** (optional, app works in fallback mode without it)

---

## ⚡ Quick Setup (5 minutes)

### 1. Navigate to Project Directory
```bash
cd /path/to/ai-book-recommender
```

### 2. Create Virtual Environment
```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Create `.env` File (Optional)
```bash
# Create .env file in project root
cat > .env << EOF
GEMINI_API_KEY=your_api_key_here
FLASK_SECRET_KEY=your_secret_key_here
PORT=5000
EOF
```

### 5. Run the Application
```bash
python app.py
```

The app starts at: **http://localhost:5000**

---

## 🔑 Get Your Google Gemini API Key

### Step-by-Step:
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Click **"Create API Key"**
3. Select your project (or create new)
4. Copy the generated API key
5. Paste it in `.env` file as `GEMINI_API_KEY=your_key_here`

### No API Key?
The app still works in **Fallback Mode** with:
- All book recommendations from knowledge base
- FAQs and genre information
- BUT no advanced AI personalization

---

## 📁 Project Structure

```
ai-book-recommender/
├── app.py                          # Flask backend
├── requirements.txt                # Python packages
├── .env                            # API keys (create this)
├── knowledge_base/
│   ├── book_data.json              # 100+ book recommendations
│   ├── book_faqs.json              # FAQs and genre info
│   └── system_prompts.json         # AI instructions
├── templates/
│   └── index.html                  # Web interface
├── static/
│   ├── css/style.css               # Styling
│   └── js/app.js                   # JavaScript logic
├── README.md                       # Full documentation
└── SETUP.md                        # This file
```

---

## 🧪 Testing Your Setup

### 1. Check Server Status
Open browser: **http://localhost:5000**

You should see the BookWise AI chat interface.

### 2. Check API Connection
- Look at sidebar: "API Status" indicator
- **Green dot + "Gemini API Connected"** = API key working ✅
- **Red dot + "Fallback Mode"** = No API key set (still works!) ⚠️

### 3. Send a Test Message
Try: "Hello" or "Recommend a book"

You should get a response instantly.

---

## 🎯 Common Issues & Solutions

### Issue: `ModuleNotFoundError: No module named 'flask'`
**Solution:**
```bash
pip install -r requirements.txt
```

### Issue: `Port 5000 already in use`
**Solution:** Change port in `.env`
```env
PORT=8080  # Use different port
```
Then restart: `python app.py`

### Issue: API key not working
**Solution:**
1. Check `.env` file exists in project root
2. Verify API key is correct (no extra spaces)
3. Check key is from Gemini API, not another Google API
4. Generate new key if needed

### Issue: Page shows "Connection error"
**Solution:**
1. Ensure server is running: `python app.py`
2. Try in new browser tab
3. Check browser console (F12) for errors
4. Restart the server

---

## 🔄 Updating & Maintenance

### Add New Books to Knowledge Base
Edit `knowledge_base/book_data.json`:
```json
{
  "curated_recommendations": {
    "your_category": [
      {
        "title": "Book Title",
        "author": "Author Name",
        "genre": "Genre",
        "year": 2024,
        "description": "Book description"
      }
    ]
  }
}
```

### Update System Prompts
Edit `knowledge_base/system_prompts.json` to change AI behavior.

### Customize UI
Edit `static/css/style.css` for styling changes.

---

## 📝 Environment Variables

### Full `.env` Template
```env
# Google Gemini API Configuration
GEMINI_API_KEY=your_api_key_here

# Flask Configuration  
FLASK_SECRET_KEY=your_secret_key_here

# Server Configuration
PORT=5000

# Optional: Debug Mode
# DEBUG=True
```

---

## 🌐 Deployment

### Run on Specific Host
```bash
# Make accessible from network
python -c "
import subprocess
subprocess.run(['python', 'app.py'], 
               env={'FLASK_RUN_HOST': '0.0.0.0', 
                   'FLASK_RUN_PORT': '5000'})
"
```

### Production Deployment
For production, use:
- **Gunicorn**: `pip install gunicorn`
- **Run**: `gunicorn -w 4 -b 0.0.0.0:5000 app:app`

---

## 🛠️ Development Mode

### Enable Debug Mode
Add to `.env`:
```env
DEBUG=True
```

Or modify `app.py`:
```python
app.run(debug=True)
```

This enables:
- Auto-reload on code changes
- Detailed error messages
- Interactive debugger

### Watching Logs
The server logs show:
- Chat messages
- API calls
- Errors and warnings

---

## 📱 Mobile Testing

### Test on Mobile Device
1. Find your computer's IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. On mobile, go to: `http://YOUR_IP:5000`
3. Chat interface is fully mobile-responsive

---

## 🔐 Security Tips

1. **Never commit `.env` file** - Already in `.gitignore`
2. **Keep API key secret** - Don't share or commit
3. **Use strong `FLASK_SECRET_KEY`** - For session security
4. **Change defaults** - Use custom port and secret if exposed

---

## 📞 Troubleshooting

### Step 1: Check Python Version
```bash
python --version  # Should be 3.8+
```

### Step 2: Verify Dependencies
```bash
pip list  # Shows installed packages
```

### Step 3: Check File Permissions
```bash
ls -la  # Should see all files
```

### Step 4: View Server Logs
The console shows detailed logs when you run:
```bash
python app.py
```

---

## ✅ Verification Checklist

- [ ] Python 3.8+ installed
- [ ] Virtual environment created and activated
- [ ] `requirements.txt` installed
- [ ] `.env` file created (optional)
- [ ] Server runs without errors
- [ ] Browser opens http://localhost:5000
- [ ] Can send/receive chat messages
- [ ] Sidebar shows API status

---

## 🎉 You're Ready!

Once setup is complete:
1. Open **http://localhost:5000**
2. Start chatting with BookWise AI
3. Get personalized book recommendations
4. Explore the knowledge base

---

## 📚 Next Steps

- Read [README.md](README.md) for full features
- Customize the knowledge base
- Deploy to your server
- Share with friends!

---

## 🆘 Still Stuck?

1. Check the [README.md](README.md) FAQ section
2. Review the logs in terminal
3. Verify all prerequisites are installed
4. Ensure `.env` file is in correct location

---

Happy Reading! 📚✨
