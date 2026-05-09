/**
 * BookWise AI — Frontend Application
 * Handles chat interactions, document upload, history, streaming,
 * theme switching, voice input, and book recommendation cards.
 */

const STORAGE_KEYS = {
    sessionId: 'bookwise_session',
    conversations: 'bookwise_conversations',
    theme: 'bookwise_theme',
};

const LANG_LABELS = {
    en: 'English', hi: 'हिन्दी', es: 'Español', fr: 'Français', de: 'Deutsch',
    ja: '日本語', zh: '中文', ko: '한국어', pt: 'Português', ru: 'Русский',
    ar: 'العربية', it: 'Italiano',
};

const state = {
    sessionId: localStorage.getItem(STORAGE_KEYS.sessionId) || generateId(),
    temperature: 0.7,
    topP: 0.9,
    isLoading: false,
    isStreaming: false,
    currentAbortController: null,
    currentAssistantMessage: null,
    lastUserMessage: '',
    listening: false,
    recognition: null,
    conversations: loadConversationStore(),
};

localStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId);

const $ = (selector) => document.querySelector(selector);

const elements = {
    messagesContainer: $('#messagesContainer'),
    welcomeScreen: $('#welcomeScreen'),
    messageInput: $('#messageInput'),
    sendBtn: $('#sendBtn'),
    stopBtn: $('#stopBtn'),
    clearBtn: $('#clearBtn'),
    exportBtn: $('#exportBtn'),
    newChatBtn: $('#newChatBtn'),
    themeToggle: $('#themeToggle'),
    voiceBtn: $('#voiceBtn'),
    temperatureSlider: $('#temperatureSlider'),
    topPSlider: $('#topPSlider'),
    tempValue: $('#tempValue'),
    topPValue: $('#topPValue'),
    fileInput: $('#fileInput'),
    uploadZone: $('#uploadZone'),
    uploadStatus: $('#uploadStatus'),
    statusDot: $('#statusDot'),
    statusText: $('#statusText'),
    langIndicator: $('#langIndicator'),
    msgCounter: $('#msgCounter'),
    suggestionsGrid: $('#suggestionsGrid'),
    sidebar: $('#sidebar'),
    sidebarOpen: $('#sidebarOpen'),
    sidebarClose: $('#sidebarClose'),
    chatHistoryList: $('#chatHistoryList'),
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMarkdown();
    initSpeechRecognition();
    setupEventListeners();
    checkApiStatus();
    loadSuggestions();
    loadConversation();
    renderChatHistoryList();
});

function generateId() {
    const id = `bw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(STORAGE_KEYS.sessionId, id);
    return id;
}

function loadConversationStore() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.conversations) || '{}');
    } catch {
        return {};
    }
}

function saveConversationStore() {
    localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(state.conversations));
}

function ensureConversation(sessionId) {
    if (!state.conversations[sessionId]) {
        state.conversations[sessionId] = {
            id: sessionId,
            title: 'New chat',
            messages: [],
            updatedAt: new Date().toISOString(),
        };
    }
    return state.conversations[sessionId];
}

function setupEventListeners() {
    elements.sendBtn.addEventListener('click', () => sendMessage());
    elements.stopBtn.addEventListener('click', stopGeneration);
    elements.newChatBtn.addEventListener('click', startNewChat);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.voiceBtn.addEventListener('click', toggleVoiceInput);

    elements.messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    elements.messageInput.addEventListener('input', resizeMessageInput);
    elements.temperatureSlider.addEventListener('input', (event) => {
        state.temperature = parseFloat(event.target.value);
        elements.tempValue.textContent = state.temperature.toFixed(1);
    });
    elements.topPSlider.addEventListener('input', (event) => {
        state.topP = parseFloat(event.target.value);
        elements.topPValue.textContent = state.topP.toFixed(1);
    });

    elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileUpload);
    elements.uploadZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        elements.uploadZone.classList.add('dragover');
    });
    elements.uploadZone.addEventListener('dragleave', () => {
        elements.uploadZone.classList.remove('dragover');
    });
    elements.uploadZone.addEventListener('drop', (event) => {
        event.preventDefault();
        elements.uploadZone.classList.remove('dragover');
        if (event.dataTransfer.files.length) {
            elements.fileInput.files = event.dataTransfer.files;
            handleFileUpload();
        }
    });

    elements.clearBtn.addEventListener('click', clearChat);
    elements.exportBtn.addEventListener('click', exportChat);

    elements.sidebarOpen.addEventListener('click', () => elements.sidebar.classList.add('open'));
    elements.sidebarClose.addEventListener('click', () => elements.sidebar.classList.remove('open'));

    document.querySelectorAll('.book-action').forEach((button) => {
        button.addEventListener('click', () => loadAndDisplayBooks(button.dataset.bookCategory));
    });

    window.addEventListener('beforeunload', persistConversationFromDOM);
}

function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
    const preferredTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    applyTheme(preferredTheme);
}

function applyTheme(theme) {
    document.body.dataset.theme = theme;
    elements.themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
    elements.themeToggle.classList.toggle('active', theme === 'light');
    localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function toggleTheme() {
    const nextTheme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
}

function initMarkdown() {
    if (window.marked) {
        window.marked.setOptions({
            breaks: true,
            gfm: true,
            mangle: false,
            headerIds: false,
        });
    }
}

function initSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
        elements.voiceBtn.style.display = 'none';
        return;
    }

    state.recognition = new Recognition();
    state.recognition.lang = 'en-US';
    state.recognition.interimResults = true;
    state.recognition.continuous = false;

    state.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join('');
        elements.messageInput.value = transcript;
        resizeMessageInput();
    };

    state.recognition.onend = () => {
        state.listening = false;
        elements.voiceBtn.classList.remove('active');
    };

    state.recognition.onerror = () => {
        state.listening = false;
        elements.voiceBtn.classList.remove('active');
    };
}

async function checkApiStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        if (data.services && data.services.gemini_api === '✅') {
            elements.statusDot.className = 'status-dot active';
            elements.statusText.textContent = 'Gemini API Connected';
        } else {
            elements.statusDot.className = 'status-dot error';
            elements.statusText.textContent = 'Fallback Mode (No API Key)';
        }
    } catch {
        elements.statusDot.className = 'status-dot error';
        elements.statusText.textContent = 'Server Offline';
    }
}

async function loadSuggestions() {
    try {
        const response = await fetch('/api/suggestions');
        const data = await response.json();
        elements.suggestionsGrid.innerHTML = '';
        data.suggestions.forEach((suggestion) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'suggestion-card';
            card.textContent = suggestion.text;
            card.addEventListener('click', () => {
                elements.messageInput.value = suggestion.prompt;
                resizeMessageInput();
                sendMessage();
            });
            elements.suggestionsGrid.appendChild(card);
        });
    } catch (error) {
        console.error('Failed to load suggestions:', error);
    }
}

async function loadConversation() {
    const sessionId = state.sessionId;

    try {
        const response = await fetch(`/api/history?session_id=${encodeURIComponent(sessionId)}`);
        const data = await response.json();
        if (data.history && data.history.length > 0) {
            renderMessages(data.history);
            syncConversationFromMessages(sessionId, data.history);
            updateCounter();
            hideWelcome();
            scrollToBottom();
            renderChatHistoryList();
            return;
        }
    } catch (error) {
        console.error('Failed to load history:', error);
    }

    const saved = state.conversations[sessionId];
    if (saved && saved.messages.length > 0) {
        renderMessages(saved.messages);
        updateCounter();
        hideWelcome();
        scrollToBottom();
    } else {
        showWelcome();
    }
}

function renderMessages(messages) {
    clearMessagesOnly();
    messages.forEach((message) => {
        appendMessage(message.role, message.content, { animate: false, persist: false });
    });
}

function clearMessagesOnly() {
    elements.messagesContainer.querySelectorAll('.message').forEach((node) => node.remove());
}

function showWelcome() {
    elements.welcomeScreen.style.display = 'flex';
}

function hideWelcome() {
    elements.welcomeScreen.style.display = 'none';
}

function resizeMessageInput() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = `${Math.min(elements.messageInput.scrollHeight, 120)}px`;
}

function updateCounter() {
    const currentConversation = state.conversations[state.sessionId];
    const count = currentConversation ? currentConversation.messages.length : elements.messagesContainer.querySelectorAll('.message').length;
    elements.msgCounter.textContent = `${count} message${count === 1 ? '' : 's'}`;
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    });
}

function markdownToHtml(text) {
    const safeText = escapeHtml(text || '');
    if (window.marked) {
        return window.marked.parse(safeText);
    }

    return simpleMarkdownToHtml(safeText);
}

function simpleMarkdownToHtml(text) {
    return text
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, language, code) => `<pre><code class="language-${language || 'text'}">${code}</code></pre>`)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^\- (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>')
        .replace(/<ul><\/ul>/g, '');
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightCodeBlocks(container) {
    if (!window.hljs) return;
    container.querySelectorAll('pre code').forEach((block) => {
        window.hljs.highlightElement(block);
    });
}

function getMessageText(messageElement) {
    return messageElement.querySelector('.message-text')?.dataset.rawText || messageElement.querySelector('.message-text')?.textContent || '';
}

function createMessageElement(role, content, options = {}) {
    const message = document.createElement('div');
    message.className = `message ${role}`;
    if (options.animate === false) {
        message.style.animation = 'none';
    }

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '📚';

    const bubble = document.createElement('div');
    bubble.className = 'message-content';

    const text = document.createElement('div');
    text.className = 'message-text';
    text.dataset.rawText = content || '';

    if (role === 'assistant' && options.streaming && !content) {
        text.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    } else if (role === 'assistant') {
        text.innerHTML = markdownToHtml(content);
        window.requestAnimationFrame(() => highlightCodeBlocks(text));
    } else {
        text.innerHTML = markdownToHtml(content);
    }

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.appendChild(text);

    if (role === 'assistant' && (!options.streaming || content)) {
        bubble.appendChild(createMessageActions(message));
    }

    bubble.appendChild(time);
    message.appendChild(avatar);
    message.appendChild(bubble);

    return message;
}

function createMessageActions(messageElement) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const buttons = [
        { label: 'Copy', action: 'copy' },
        { label: 'Speak', action: 'speak' },
        { label: 'Regenerate', action: 'regenerate' },
    ];

    buttons.forEach((buttonConfig) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'message-action-btn';
        button.textContent = buttonConfig.label;
        button.addEventListener('click', () => handleMessageAction(buttonConfig.action, messageElement));
        actions.appendChild(button);
    });

    return actions;
}

function appendMessage(role, content, options = {}) {
    const message = createMessageElement(role, content, options);
    elements.messagesContainer.appendChild(message);
    scrollToBottom();
    if (options.persist !== false) {
        persistConversationFromDOM();
    }
    return message;
}

function updateMessageContent(messageElement, content) {
    const bubble = messageElement.querySelector('.message-content');
    const text = messageElement.querySelector('.message-text');
    if (!text) return;
    text.dataset.rawText = content;
    text.innerHTML = markdownToHtml(content);

    let actions = messageElement.querySelector('.message-actions');
    if (!actions) {
        actions = createMessageActions(messageElement);
        bubble.insertBefore(actions, messageElement.querySelector('.message-time'));
    }

    window.requestAnimationFrame(() => highlightCodeBlocks(text));
}

function handleMessageAction(action, messageElement) {
    const content = getMessageText(messageElement);

    if (action === 'copy') {
        navigator.clipboard.writeText(content).catch(() => {
            const fallback = document.createElement('textarea');
            fallback.value = content;
            document.body.appendChild(fallback);
            fallback.select();
            document.execCommand('copy');
            fallback.remove();
        });
        return;
    }

    if (action === 'speak') {
        speakText(content);
        return;
    }

    if (action === 'regenerate') {
        if (!state.lastUserMessage) return;
        sendMessage(state.lastUserMessage, true);
    }
}

function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

function stripMarkdown(text) {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[#>*_\-\[\]\(\)!]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toggleVoiceInput() {
    if (!state.recognition) return;

    if (state.listening) {
        state.recognition.stop();
        state.listening = false;
        elements.voiceBtn.classList.remove('active');
        return;
    }

    state.recognition.start();
    state.listening = true;
    elements.voiceBtn.classList.add('active');
}

async function sendMessage(overrideMessage = null, isRegenerate = false) {
    const message = (overrideMessage ?? elements.messageInput.value).trim();
    if (!message || state.isLoading) return;

    if (!isRegenerate) {
        state.lastUserMessage = message;
    }

    hideWelcome();
    appendMessage('user', message, { persist: false });
    if (!overrideMessage) {
        elements.messageInput.value = '';
        resizeMessageInput();
    }

    state.isLoading = true;
    state.isStreaming = true;
    elements.sendBtn.disabled = true;
    elements.stopBtn.style.display = 'inline-flex';

    const assistantMessage = appendMessage('assistant', '', { streaming: true, persist: false });
    state.currentAssistantMessage = assistantMessage;

    const payload = {
        message,
        session_id: state.sessionId,
        temperature: state.temperature,
        top_p: state.topP,
    };

    try {
        await streamChatResponse(payload, assistantMessage);
    } catch (error) {
        console.error('Streaming failed, falling back:', error);
        await fallbackChatResponse(payload, assistantMessage);
    } finally {
        state.isLoading = false;
        state.isStreaming = false;
        state.currentAbortController = null;
        state.currentAssistantMessage = null;
        elements.sendBtn.disabled = false;
        elements.stopBtn.style.display = 'none';
        persistConversationFromDOM();
        renderChatHistoryList();
        scrollToBottom();
    }
}

async function streamChatResponse(payload, assistantMessage) {
    if (!window.ReadableStream) {
        throw new Error('Streaming not supported');
    }

    const controller = new AbortController();
    state.currentAbortController = controller;

    const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
    });

    if (!response.ok || !response.body) {
        throw new Error('Streaming endpoint unavailable');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventBlock of events) {
            const dataLine = eventBlock.split('\n').find((line) => line.startsWith('data:'));
            if (!dataLine) continue;

            const payloadText = dataLine.slice(5).trim();
            if (!payloadText || payloadText === '[DONE]') continue;

            const data = safeJsonParse(payloadText);
            if (!data) continue;

            if (data.type === 'meta' && data.language) {
                updateLanguageIndicator(data.language);
                continue;
            }

            if (data.error) {
                throw new Error(data.error);
            }

            if (data.content) {
                fullText += data.content;
                updateMessageContent(assistantMessage, fullText);
                scrollToBottom();
            }
        }
    }

    if (!fullText.trim()) {
        throw new Error('Empty streaming response');
    }

    updateMessageContent(assistantMessage, fullText);
}

async function fallbackChatResponse(payload, assistantMessage) {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (data.error) {
        updateMessageContent(assistantMessage, `❌ ${data.error}`);
        return;
    }

    updateMessageContent(assistantMessage, data.response || '');
    if (data.language) {
        updateLanguageIndicator(data.language);
    }
}

function stopGeneration() {
    if (state.currentAbortController) {
        state.currentAbortController.abort();
    }
    state.isLoading = false;
    state.isStreaming = false;
    elements.sendBtn.disabled = false;
    elements.stopBtn.style.display = 'none';
}

function updateLanguageIndicator(languageCode) {
    elements.langIndicator.textContent = LANG_LABELS[languageCode] || languageCode || 'English';
}

async function handleFileUpload() {
    const file = elements.fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('document', file);
    formData.append('session_id', state.sessionId);

    elements.uploadStatus.style.display = 'block';
    setUploadStatus('⏳ Uploading...', 'rgba(124,92,252,0.1)', '#7c5cfc', 'rgba(124,92,252,0.2)');

    try {
        const response = await fetch('/api/upload-document', {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();

        if (data.success) {
            setUploadStatus(
                `✅ ${data.filename} (${data.char_count.toLocaleString()} chars)`,
                'rgba(76,223,138,0.1)',
                '#4cdf8a',
                'rgba(76,223,138,0.2)'
            );
            appendMessage('assistant', data.message, { persist: false });
        } else {
            setUploadStatus(`❌ ${data.error}`, 'rgba(252,92,106,0.1)', '#fc5c6a', 'rgba(252,92,106,0.2)');
        }
    } catch {
        setUploadStatus('❌ Upload failed. Check server connection.', 'rgba(252,92,106,0.1)', '#fc5c6a', 'rgba(252,92,106,0.2)');
    }

    elements.fileInput.value = '';
    persistConversationFromDOM();
}

function setUploadStatus(text, background, color, borderColor) {
    elements.uploadStatus.textContent = text;
    elements.uploadStatus.style.background = background;
    elements.uploadStatus.style.color = color;
    elements.uploadStatus.style.borderColor = borderColor;
}

async function clearChat() {
    try {
        await fetch('/api/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: state.sessionId }),
        });
    } catch (error) {
        console.error('Failed to clear on server:', error);
    }

    clearMessagesOnly();
    showWelcome();
    state.conversations[state.sessionId] = {
        id: state.sessionId,
        title: 'New chat',
        messages: [],
        updatedAt: new Date().toISOString(),
    };
    saveConversationStore();
    updateCounter();
    elements.uploadStatus.style.display = 'none';
    renderChatHistoryList();
}

function startNewChat() {
    state.sessionId = generateId();
    localStorage.setItem(STORAGE_KEYS.sessionId, state.sessionId);
    state.lastUserMessage = '';
    elements.messageInput.value = '';
    resizeMessageInput();
    state.conversations[state.sessionId] = {
        id: state.sessionId,
        title: 'New chat',
        messages: [],
        updatedAt: new Date().toISOString(),
    };
    clearMessagesOnly();
    showWelcome();
    updateCounter();
    saveConversationStore();
    renderChatHistoryList();
}

function exportChat() {
    const messages = elements.messagesContainer.querySelectorAll('.message');
    if (!messages.length) return;

    let text = '📚 BookWise AI — Chat Export\n';
    text += `Date: ${new Date().toLocaleString()}\n`;
    text += '═'.repeat(50) + '\n\n';

    messages.forEach((message) => {
        const role = message.classList.contains('user') ? '👤 You' : '🤖 BookWise AI';
        const content = getMessageText(message);
        text += `${role}:\n${content}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bookwise-chat-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
}

function persistConversationFromDOM() {
    const messages = Array.from(elements.messagesContainer.querySelectorAll('.message')).map((message) => ({
        role: message.classList.contains('user') ? 'user' : 'assistant',
        content: getMessageText(message),
        timestamp: new Date().toISOString(),
    })).filter((message) => message.content.trim());

    syncConversationFromMessages(state.sessionId, messages);
    saveConversationStore();
}

function syncConversationFromMessages(sessionId, messages) {
    const conversation = ensureConversation(sessionId);
    conversation.messages = messages;
    conversation.updatedAt = new Date().toISOString();
    conversation.title = buildConversationTitle(messages);
}

function buildConversationTitle(messages) {
    const firstUserMessage = messages.find((message) => message.role === 'user');
    if (!firstUserMessage) return 'New chat';
    const words = firstUserMessage.content.replace(/\s+/g, ' ').trim().split(' ');
    return words.slice(0, 6).join(' ');
}

function renderChatHistoryList() {
    const entries = Object.values(state.conversations).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    elements.chatHistoryList.innerHTML = '';

    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'history-item';
        empty.textContent = 'No saved chats yet';
        elements.chatHistoryList.appendChild(empty);
        return;
    }

    entries.forEach((conversation) => {
        const item = document.createElement('div');
        item.className = `history-item${conversation.id === state.sessionId ? ' active' : ''}`;

        const title = document.createElement('div');
        title.className = 'history-item-title';
        title.textContent = conversation.title || 'New chat';

        const meta = document.createElement('div');
        meta.className = 'history-item-meta';
        meta.innerHTML = `<span>${conversation.messages.length} messages</span><span>${formatRelativeTime(conversation.updatedAt)}</span>`;

        const actions = document.createElement('div');
        actions.className = 'history-item-actions';

        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'history-action';
        openButton.textContent = 'Open';
        openButton.addEventListener('click', (event) => {
            event.stopPropagation();
            switchConversation(conversation.id);
        });

        const renameButton = document.createElement('button');
        renameButton.type = 'button';
        renameButton.className = 'history-action';
        renameButton.textContent = 'Rename';
        renameButton.addEventListener('click', (event) => {
            event.stopPropagation();
            renameConversation(conversation.id);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'history-action';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteConversation(conversation.id);
        });

        actions.append(openButton, renameButton, deleteButton);
        item.append(title, meta, actions);
        item.addEventListener('click', () => switchConversation(conversation.id));
        elements.chatHistoryList.appendChild(item);
    });
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return 'now';
    const deltaMs = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(deltaMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

async function switchConversation(sessionId) {
    state.sessionId = sessionId;
    localStorage.setItem(STORAGE_KEYS.sessionId, sessionId);
    clearMessagesOnly();

    try {
        const response = await fetch(`/api/history?session_id=${encodeURIComponent(sessionId)}`);
        const data = await response.json();
        if (data.history && data.history.length > 0) {
            renderMessages(data.history);
            syncConversationFromMessages(sessionId, data.history);
            hideWelcome();
            updateCounter();
            renderChatHistoryList();
            return;
        }
    } catch (error) {
        console.error('Failed to switch conversation:', error);
    }

    const saved = state.conversations[sessionId];
    if (saved && saved.messages.length > 0) {
        renderMessages(saved.messages);
        hideWelcome();
        updateCounter();
    } else {
        showWelcome();
        updateCounter();
    }

    renderChatHistoryList();
}

function renameConversation(sessionId) {
    const conversation = state.conversations[sessionId];
    if (!conversation) return;
    const nextTitle = window.prompt('Rename this chat', conversation.title || 'New chat');
    if (!nextTitle) return;
    conversation.title = nextTitle.trim().slice(0, 80) || conversation.title;
    conversation.updatedAt = new Date().toISOString();
    saveConversationStore();
    renderChatHistoryList();
}

function deleteConversation(sessionId) {
    const conversation = state.conversations[sessionId];
    if (!conversation) return;
    const confirmed = window.confirm(`Delete "${conversation.title || 'New chat'}"?`);
    if (!confirmed) return;

    delete state.conversations[sessionId];
    saveConversationStore();

    if (sessionId === state.sessionId) {
        startNewChat();
    } else {
        renderChatHistoryList();
    }
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function loadAndDisplayBooks(category) {
    try {
        let endpoint = '';
        let title = '';

        switch (category) {
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

        const response = await fetch(endpoint);
        const data = await response.json();
        const books = normalizeBooksForCategory(category, data);

        if (books.length > 0) {
            hideWelcome();
            renderBookCards(title, books);
            persistConversationFromDOM();
            renderChatHistoryList();
        }
    } catch (error) {
        console.error('Failed to load books:', error);
    }
}

function normalizeBooksForCategory(category, data) {
    if (category === 'series' && data.series) {
        return data.series.map((item) => ({
            title: item.series,
            author: item.author,
            genre: item.genre,
            description: `${item.books} books • ${item.description}`,
        }));
    }

    if (category === 'trending' && data.trending) {
        return data.trending;
    }

    if (category === 'beginner' && data.beginner_books) {
        return data.beginner_books;
    }

    if (category === 'short' && data.short_reads) {
        return data.short_reads;
    }

    return [];
}

function renderBookCards(title, books) {
    const message = document.createElement('div');
    message.className = 'message assistant';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '📚';

    const bubble = document.createElement('div');
    bubble.className = 'message-content';

    const text = document.createElement('div');
    text.className = 'message-text';
    const summaryText = `**${title}**\n\n${books.length} picks ready for you.`;
    text.dataset.rawText = summaryText;
    text.innerHTML = markdownToHtml(summaryText);

    const grid = document.createElement('div');
    grid.className = 'book-cards-grid';

    books.slice(0, 8).forEach((book) => {
        const card = document.createElement('article');
        card.className = 'book-card';
        card.innerHTML = `
            <div class="book-card-title">${escapeHtml(book.title || book.series || 'Untitled')}</div>
            <div class="book-card-meta">${escapeHtml(book.author || 'Unknown')}${book.genre ? ' • ' + escapeHtml(book.genre) : ''}</div>
            <div class="book-card-desc">${escapeHtml(book.description || book.summary || '')}</div>
        `;
        grid.appendChild(card);
    });

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.append(text, grid, time);
    message.append(avatar, bubble);
    elements.messagesContainer.appendChild(message);
    window.requestAnimationFrame(() => highlightCodeBlocks(text));
    scrollToBottom();
}

function persistConversationFromDOM() {
    const messages = Array.from(elements.messagesContainer.querySelectorAll('.message')).map((message) => ({
        role: message.classList.contains('user') ? 'user' : 'assistant',
        content: getMessageText(message),
        timestamp: new Date().toISOString(),
    })).filter((message) => message.content.trim());

    syncConversationFromMessages(state.sessionId, messages);
    saveConversationStore();
}

function hideWelcome() {
    elements.welcomeScreen.style.display = 'none';
}

function showWelcome() {
    elements.welcomeScreen.style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════════════
   ENHANCED UI/UX UTILITIES (v2.1)
   ═══════════════════════════════════════════════════════════════ */

/* ─── 🔔 Toast Notifications ────────────────────────── */
const NotificationManager = {
    toasts: [],
    
    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        const ariaLabels = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };
        
        toast.innerHTML = `
            <span aria-hidden="true">${icons[type] || '•'}</span>
            <span role="status" aria-live="polite" aria-atomic="true">${message}</span>
        `;
        toast.setAttribute('aria-label', `${ariaLabels[type]}: ${message}`);
        
        document.body.appendChild(toast);
        this.toasts.push(toast);
        
        if (duration > 0) {
            setTimeout(() => {
                toast.remove();
                this.toasts = this.toasts.filter(t => t !== toast);
            }, duration);
        }
        
        return toast;
    },
    
    success(message) { return this.show(message, 'success'); },
    error(message) { return this.show(message, 'error'); },
    warning(message) { return this.show(message, 'warning'); },
    info(message) { return this.show(message, 'info'); },
};

/* ─── ⚡ Loading Indicators ────────────────────────── */
const LoadingManager = {
    createSpinner() {
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        return spinner;
    },
    
    createLoadingIndicator(text = 'Processing...') {
        const indicator = document.createElement('div');
        indicator.className = 'loading-indicator';
        indicator.innerHTML = `
            <div class="loading-spinner"></div>
            <span>${text}</span>
        `;
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');
        indicator.setAttribute('aria-label', text);
        return indicator;
    },
    
    addToMessage(messageElement) {
        const indicator = this.createLoadingIndicator();
        messageElement.appendChild(indicator);
        return indicator;
    }
};

/* ─── ⚠️ Error Handling ────────────────────────────── */
const ErrorHandler = {
    display(errorMsg, container = elements.messagesContainer) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.setAttribute('role', 'alert');
        errorDiv.setAttribute('aria-live', 'assertive');
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'error-close';
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close error message');
        closeBtn.onclick = () => errorDiv.remove();
        
        errorDiv.innerHTML = `
            <span class="error-icon" aria-hidden="true">⚠</span>
            <span class="error-text">${errorMsg}</span>
        `;
        errorDiv.appendChild(closeBtn);
        
        if (container) {
            container.appendChild(errorDiv);
            setTimeout(() => errorDiv.focus(), 100);
        }
        
        return errorDiv;
    },
    
    handle(error, fallbackMsg = 'An error occurred') {
        const message = error?.message || fallbackMsg;
        console.error('Error:', error);
        this.display(message);
        NotificationManager.error(message);
    }
};

/* ─── ✅ Validation Feedback ────────────────────────── */
const ValidationHelper = {
    validateFileSize(file, maxSizeMB = 50) {
        const maxBytes = maxSizeMB * 1024 * 1024;
        if (file.size > maxBytes) {
            const msg = `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: ${maxSizeMB}MB`;
            ErrorHandler.display(msg);
            NotificationManager.error(msg);
            return false;
        }
        return true;
    },
    
    validateFileType(file, allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) {
        if (!allowedTypes.includes(file.type)) {
            const types = allowedTypes.map(t => t.split('/')[1]).join(', ');
            const msg = `File type not supported. Allowed: ${types}`;
            ErrorHandler.display(msg);
            NotificationManager.error(msg);
            return false;
        }
        return true;
    },
    
    validateInput(text, minLength = 1, maxLength = 5000) {
        if (text.trim().length < minLength) {
            NotificationManager.warning('Message too short');
            return false;
        }
        if (text.length > maxLength) {
            const msg = `Message too long (${text.length}/${maxLength})`;
            NotificationManager.warning(msg);
            return false;
        }
        return true;
    }
};

/* ─── ♿ Accessibility Helpers ──────────────────── */
const A11yHelper = {
    announceToScreenReader(message, priority = 'polite') {
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', priority);
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only'; // Visually hidden but accessible
        announcement.style.cssText = `
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        `;
        announcement.textContent = message;
        document.body.appendChild(announcement);
        
        setTimeout(() => announcement.remove(), 1000);
    },
    
    setFieldError(inputElement, errorMsg) {
        inputElement.setAttribute('aria-invalid', 'true');
        inputElement.setAttribute('aria-describedby', `error-${inputElement.id || 'field'}`);
        
        let errorEl = document.getElementById(`error-${inputElement.id || 'field'}`);
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = `error-${inputElement.id || 'field'}`;
            errorEl.className = 'error-message';
            errorEl.style.fontSize = '12px';
            errorEl.style.marginTop = '4px';
            inputElement.parentNode.insertBefore(errorEl, inputElement.nextSibling);
        }
        errorEl.textContent = errorMsg;
    },
    
    clearFieldError(inputElement) {
        inputElement.setAttribute('aria-invalid', 'false');
        inputElement.removeAttribute('aria-describedby');
        
        const errorEl = document.getElementById(`error-${inputElement.id || 'field'}`);
        if (errorEl) errorEl.remove();
    }
};

/* ─── 🎯 Feedback on User Actions ────────────────– */
const FeedbackManager = {
    showCopyFeedback(element) {
        const originalText = element.textContent;
        element.textContent = '✓ Copied';
        element.classList.add('success-message');
        
        setTimeout(() => {
            element.textContent = originalText;
            element.classList.remove('success-message');
        }, 1500);
        
        A11yHelper.announceToScreenReader('Message copied to clipboard');
    },
    
    showLoadingState(button, text = 'Loading...') {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.innerHTML = `<span class="loading-spinner"></span> ${text}`;
    },
    
    hideLoadingState(button) {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || button.textContent;
    },
    
    pulseElement(element) {
        element.classList.add('message');
        setTimeout(() => element.classList.remove('message'), 300);
    }
};

/* ─── 📱 Mobile UX Enhancements ────────────────────── */
const MobileHelper = {
    isSmallScreen() {
        return window.innerWidth < 768;
    },
    
    isTouchDevice() {
        return () => (('ontouchstart' in window) ||
                      (navigator.maxTouchPoints > 0) ||
                      (navigator.msMaxTouchPoints > 0));
    },
    
    optimizeForTouch(element) {
        if (this.isTouchDevice()()) {
            element.style.minHeight = '44px'; // Apple's recommended touch target
            element.style.padding = '12px 16px';
        }
    }
};

/* ─── 🎨 Theme Persistence Helper ────────────────– */
const ThemeHelper = {
    save(theme) {
        localStorage.setItem(STORAGE_KEYS.theme, theme);
    },
    
    load() {
        return localStorage.getItem(STORAGE_KEYS.theme) || 
               (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    },
    
    getPreference() {
        return window.matchMedia('(prefers-color-scheme: dark)');
    }
};

/* ─── 💫 Animation Utilities ────────────────────────– */
const AnimationHelper = {
    fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.transition = `opacity ${duration}ms ease`;
        setTimeout(() => element.style.opacity = '1', 10);
    },
    
    fadeOut(element, duration = 300) {
        element.style.opacity = '1';
        element.style.transition = `opacity ${duration}ms ease`;
        element.style.opacity = '0';
        setTimeout(() => element.remove(), duration);
    },
    
    slideIn(element, direction = 'up', duration = 300) {
        const transforms = {
            up: 'translateY(20px)',
            down: 'translateY(-20px)',
            left: 'translateX(20px)',
            right: 'translateX(-20px)'
        };
        
        element.style.transform = transforms[direction];
        element.style.opacity = '0';
        element.style.transition = `all ${duration}ms ease`;
        setTimeout(() => {
            element.style.transform = 'translate(0)';
            element.style.opacity = '1';
        }, 10);
    }
};

/* ─── 📊 User Feedback Analytics ────────────────── */
const AnalyticsHelper = {
    trackEvent(eventName, data = {}) {
        // Can be extended to track to external analytics service
        console.log(`[Analytics] ${eventName}:`, data);
    },
    
    trackMessageSent(length) {
        this.trackEvent('message_sent', { length, timestamp: new Date().toISOString() });
    },
    
    trackFeatureUsed(feature) {
        this.trackEvent('feature_used', { feature, timestamp: new Date().toISOString() });
    }
};

/* ─── 🌐 Accessibility Compliance ────────────────– */
const AccessibilityAuditor = {
    checkPageStructure() {
        const issues = [];
        
        // Check for multiple h1 tags
        if (document.querySelectorAll('h1').length > 1) {
            issues.push('Multiple h1 tags found');
        }
        
        // Check for images without alt text
        document.querySelectorAll('img').forEach(img => {
            if (!img.alt) issues.push(`Image without alt: ${img.src}`);
        });
        
        // Check for buttons without text
        document.querySelectorAll('button').forEach(btn => {
            if (!btn.textContent && !btn.getAttribute('aria-label')) {
                issues.push('Button without accessible text');
            }
        });
        
        return issues;
    },
    
    logReport() {
        const issues = this.checkPageStructure();
        if (issues.length > 0) {
            console.warn('[Accessibility] Issues found:', issues);
        }
    }
};

// Run accessibility check on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AccessibilityAuditor.logReport());
} else {
    AccessibilityAuditor.logReport();
}
