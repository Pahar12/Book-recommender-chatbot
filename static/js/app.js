/**
 * BookWise AI — Frontend Application
 * Handles chat interactions, document upload, session management,
 * and dynamic UI updates.
 */

// ═══════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════
const state = {
    sessionId: localStorage.getItem('bookwise_session') || generateId(),
    isLoading: false,
    messageCount: 0,
    temperature: 0.7,
    topP: 0.9,
    documentUploaded: false,
};

function generateId() {
    const id = 'bw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('bookwise_session', id);
    return id;
}

// ═══════════════════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);
const messagesContainer = $('#messagesContainer');
const welcomeScreen = $('#welcomeScreen');
const messageInput = $('#messageInput');
const sendBtn = $('#sendBtn');
const clearBtn = $('#clearBtn');
const exportBtn = $('#exportBtn');
const temperatureSlider = $('#temperatureSlider');
const topPSlider = $('#topPSlider');
const tempValue = $('#tempValue');
const topPValue = $('#topPValue');
const fileInput = $('#fileInput');
const uploadZone = $('#uploadZone');
const uploadStatus = $('#uploadStatus');
const statusDot = $('#statusDot');
const statusText = $('#statusText');
const langIndicator = $('#langIndicator');
const msgCounter = $('#msgCounter');
const suggestionsGrid = $('#suggestionsGrid');
const sidebar = $('#sidebar');
const sidebarOpen = $('#sidebarOpen');
const sidebarClose = $('#sidebarClose');

// ═══════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    checkApiStatus();
    loadSuggestions();
    setupEventListeners();
    loadHistory();
});

function setupEventListeners() {
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    // Sliders
    temperatureSlider.addEventListener('input', (e) => {
        state.temperature = parseFloat(e.target.value);
        tempValue.textContent = state.temperature.toFixed(1);
    });
    topPSlider.addEventListener('input', (e) => {
        state.topP = parseFloat(e.target.value);
        topPValue.textContent = state.topP.toFixed(1);
    });

    // File upload
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload();
        }
    });

    // Actions
    clearBtn.addEventListener('click', clearChat);
    exportBtn.addEventListener('click', exportChat);

    // Sidebar toggle (mobile)
    sidebarOpen.addEventListener('click', () => sidebar.classList.add('open'));
    sidebarClose.addEventListener('click', () => sidebar.classList.remove('open'));
}

// ═══════════════════════════════════════════════════════════════
//  API CALLS
// ═══════════════════════════════════════════════════════════════
async function checkApiStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.api_configured) {
            statusDot.classList.add('active');
            statusText.textContent = 'Gemini API Connected';
        } else {
            statusDot.classList.add('error');
            statusText.textContent = 'Fallback Mode (No API Key)';
        }
    } catch {
        statusDot.classList.add('error');
        statusText.textContent = 'Server Offline';
    }
}

async function loadSuggestions() {
    try {
        const res = await fetch('/api/suggestions');
        const data = await res.json();
        suggestionsGrid.innerHTML = '';
        data.suggestions.forEach((s) => {
            const card = document.createElement('div');
            card.className = 'suggestion-card';
            card.textContent = s.text;
            card.addEventListener('click', () => {
                messageInput.value = s.prompt;
                sendMessage();
            });
            suggestionsGrid.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load suggestions:', err);
    }
}

async function loadHistory() {
    try {
        const res = await fetch(`/api/history?session_id=${state.sessionId}`);
        const data = await res.json();
        if (data.history && data.history.length > 0) {
            welcomeScreen.style.display = 'none';
            data.history.forEach((msg) => {
                appendMessage(msg.role, msg.content, false);
            });
            state.messageCount = data.history.length;
            updateCounter();
            scrollToBottom();
        }
    } catch (err) {
        console.error('Failed to load history:', err);
    }
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message || state.isLoading) return;

    // Hide welcome screen
    welcomeScreen.style.display = 'none';

    // Add user message
    appendMessage('user', message);
    messageInput.value = '';
    messageInput.style.height = 'auto';
    state.messageCount++;
    updateCounter();

    // Show typing indicator
    const typingEl = showTyping();
    state.isLoading = true;
    sendBtn.disabled = true;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                session_id: state.sessionId,
                temperature: state.temperature,
                top_p: state.topP,
            }),
        });
        const data = await res.json();

        removeTyping(typingEl);

        if (data.error) {
            appendMessage('assistant', '❌ ' + data.error);
        } else {
            appendMessage('assistant', data.response);
            // Update language indicator
            if (data.language) {
                const langNames = {
                    en: 'English', hi: 'हिन्दी', es: 'Español', fr: 'Français',
                    de: 'Deutsch', ja: '日本語', zh: '中文', ko: '한국어',
                    pt: 'Português', ru: 'Русский', ar: 'العربية', it: 'Italiano',
                };
                langIndicator.textContent = langNames[data.language] || data.language;
            }
            state.messageCount++;
            updateCounter();
        }
    } catch (err) {
        removeTyping(typingEl);
        appendMessage('assistant', '❌ Connection error. Please make sure the server is running.');
    }

    state.isLoading = false;
    sendBtn.disabled = false;
    scrollToBottom();
}

async function handleFileUpload() {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('document', file);
    formData.append('session_id', state.sessionId);

    uploadStatus.style.display = 'block';
    uploadStatus.textContent = '⏳ Uploading...';
    uploadStatus.style.background = 'rgba(124,92,252,0.1)';
    uploadStatus.style.color = '#7c5cfc';
    uploadStatus.style.borderColor = 'rgba(124,92,252,0.2)';

    try {
        const res = await fetch('/api/upload-document', {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();

        if (data.success) {
            uploadStatus.textContent = `✅ ${data.filename} (${data.char_count.toLocaleString()} chars)`;
            uploadStatus.style.background = 'rgba(76,223,138,0.1)';
            uploadStatus.style.color = '#4cdf8a';
            uploadStatus.style.borderColor = 'rgba(76,223,138,0.2)';
            state.documentUploaded = true;
            // Show notification in chat
            welcomeScreen.style.display = 'none';
            appendMessage('assistant', data.message);
        } else {
            uploadStatus.textContent = '❌ ' + data.error;
            uploadStatus.style.background = 'rgba(252,92,106,0.1)';
            uploadStatus.style.color = '#fc5c6a';
            uploadStatus.style.borderColor = 'rgba(252,92,106,0.2)';
        }
    } catch (err) {
        uploadStatus.textContent = '❌ Upload failed. Check server connection.';
        uploadStatus.style.background = 'rgba(252,92,106,0.1)';
        uploadStatus.style.color = '#fc5c6a';
        uploadStatus.style.borderColor = 'rgba(252,92,106,0.2)';
    }
    fileInput.value = '';
}

async function clearChat() {
    try {
        await fetch('/api/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: state.sessionId }),
        });
    } catch (err) {
        console.error('Failed to clear on server:', err);
    }

    // Reset UI
    const messages = messagesContainer.querySelectorAll('.message');
    messages.forEach((m) => m.remove());
    welcomeScreen.style.display = 'flex';
    state.messageCount = 0;
    state.documentUploaded = false;
    updateCounter();
    uploadStatus.style.display = 'none';

    // New session
    state.sessionId = generateId();
}

function exportChat() {
    const messages = messagesContainer.querySelectorAll('.message');
    if (messages.length === 0) return;

    let text = '📚 BookWise AI — Chat Export\n';
    text += `Date: ${new Date().toLocaleString()}\n`;
    text += '═'.repeat(50) + '\n\n';

    messages.forEach((msg) => {
        const role = msg.classList.contains('user') ? '👤 You' : '🤖 BookWise AI';
        const content = msg.querySelector('.message-text')?.textContent || '';
        text += `${role}:\n${content}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookwise-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════════
function appendMessage(role, content, animate = true) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    if (!animate) msgDiv.style.animation = 'none';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '📚';

    const bubble = document.createElement('div');
    bubble.className = 'message-content';

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.innerHTML = formatMarkdown(content);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.appendChild(textDiv);
    bubble.appendChild(timeDiv);
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    messagesContainer.appendChild(msgDiv);
    scrollToBottom();
}

function formatMarkdown(text) {
    if (!text) return '';
    let html = text
        // Code blocks
        .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Bold & Italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Headers
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        // Lists
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
        // Paragraphs
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>.*?<\/li>)/gs, (match) => `<ul>${match}</ul>`);
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    return `<p>${html}</p>`;
}

function showTyping() {
    const div = document.createElement('div');
    div.className = 'message assistant typing-msg';
    div.innerHTML = `
        <div class="message-avatar">📚</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>`;
    messagesContainer.appendChild(div);
    scrollToBottom();
    return div;
}

function removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function updateCounter() {
    msgCounter.textContent = `${state.messageCount} message${state.messageCount !== 1 ? 's' : ''}`;
}

// ═══════════════════════════════════════════════════════════════
//  BOOK RECOMMENDATION FEATURES
// ═══════════════════════════════════════════════════════════════

/**
 * Render book cards from API data
 * Useful for displaying series, trending books, etc.
 */
async function loadAndDisplayBooks(category) {
    try {
        let endpoint = '';
        let title = '';
        
        switch(category) {
            case 'series':
                endpoint = '/api/series';
                title = '📚 Popular Book Series';
                break;
            case 'trending':
                endpoint = '/api/trending';
                title = '⭐ Trending Now';
                break;
            case 'beginner':
                endpoint = '/api/beginner-friendly';
                title = '👶 Great for Beginners';
                break;
            case 'short':
                endpoint = '/api/short-reads';
                title = '⚡ Quick Reads';
                break;
            default:
                return;
        }
        
        const res = await fetch(endpoint);
        const data = await res.json();
        let books = [];
        
        if (category === 'series' && data.series) {
            books = data.series.map(s => ({
                title: s.series,
                author: s.author,
                description: `${s.books} books • ${s.description}`,
                genre: s.genre
            }));
        } else if (category === 'trending' && data.trending) {
            books = data.trending;
        } else if (category === 'beginner' && data.beginner_books) {
            books = data.beginner_books;
        } else if (category === 'short' && data.short_reads) {
            books = data.short_reads;
        }
        
        if (books.length > 0) {
            appendMessage('assistant', `✨ **${title}**\n\n${books.slice(0, 5).map(b => 
                `**${b.title}** by ${b.author}\n📌 *${b.genre}* — ${b.description}`
            ).join('\n\n')}`);
        }
    } catch (err) {
        console.error('Failed to load books:', err);
    }
}
