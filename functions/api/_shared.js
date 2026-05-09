const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const TEXT_HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
};

const DAY_SECONDS = 60 * 60 * 24;
const assetCache = new Map();

function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

async function readJsonAsset(request, assetPath) {
  if (assetCache.has(assetPath)) {
    return assetCache.get(assetPath);
  }

  const response = await fetch(new URL(assetPath, request.url));
  if (!response.ok) {
    throw new Error(`Unable to load asset: ${assetPath}`);
  }

  const payload = await response.json();
  assetCache.set(assetPath, payload);
  return payload;
}

async function getKnowledgeBase(request) {
  const [bookFaqs, bookData, systemPrompts] = await Promise.all([
    readJsonAsset(request, '/knowledge_base/book_faqs.json'),
    readJsonAsset(request, '/knowledge_base/book_data.json'),
    readJsonAsset(request, '/knowledge_base/system_prompts.json'),
  ]);

  return { bookFaqs, bookData, systemPrompts };
}

async function createCacheKey(message, sessionId, temperature, topP) {
  const input = `${temperature}|${topP}|${normalizeText(message)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = Array.from(new Uint8Array(digest));
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
  return hex;
}

async function getCachedResponse(request, cacheKey) {
  const cache = caches.default;
  const url = new URL(`/__bookwise_cache__/${cacheKey}`, request.url);
  const cached = await cache.match(url.toString());
  if (!cached) {
    return null;
  }

  return cached.json();
}

async function putCachedResponse(request, cacheKey, payload) {
  const cache = caches.default;
  const url = new URL(`/__bookwise_cache__/${cacheKey}`, request.url);
  const response = new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${DAY_SECONDS}`,
    },
  });
  await cache.put(url.toString(), response);
}

function isGeminiQuotaError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return hasAny(message, [
    '429',
    'quota exceeded',
    'rate limit',
    'resourceexhausted',
    'free_tier_requests',
    'free_tier_input_token_count',
    'retry in',
  ]);
}

function getFaqResponse(message, bookFaqs) {
  const normalized = normalizeText(message);
  const faqs = bookFaqs?.faqs || [];

  if (hasAny(normalized, ['hello', 'hi', 'hey', 'namaste', 'greetings'])) {
    return {
      response: `📚 **Welcome to BookWise AI!**\n\nI can help with:\n• Book recommendations\n• Spoiler-free summaries\n• Reading lists\n• Series suggestions\n• Quick classics and trending picks\n\nTell me your mood, genre, or a book you already like, and I’ll suggest a great next read.`,
      source: 'local',
      reason: 'greeting',
    };
  }

  for (const faq of faqs) {
    const question = normalizeText(faq.question);
    if (question && (normalized.includes(question.slice(0, 24)) || question.split(' ').some((word) => word.length > 4 && normalized.includes(word)))) {
      return {
        response: `**${faq.question}**\n\n${faq.answer}`,
        source: 'local',
        reason: 'faq',
      };
    }
  }

  return null;
}

function findCollection(bookData, keys) {
  for (const key of keys) {
    const value = bookData?.[key];
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return [];
}

function formatBooks(books, count = 5) {
  return books.slice(0, count).map((book, index) => {
    const title = book.title || book.series || 'Untitled';
    const author = book.author || 'Unknown author';
    const genre = book.genre || 'Book';
    const year = book.year ? ` • ${book.year}` : '';
    const summary = book.summary || book.description || 'A strong pick for your reading list.';
    return `**${index + 1}. ${title}** by ${author}\n*${genre}*${year}\n\n${summary}`;
  }).join('\n\n');
}

function getLocalBookResponse(message, bookFaqs, bookData) {
  const normalized = normalizeText(message);
  const curated = bookData?.curated_recommendations || {};
  const series = findCollection(bookData, ['series', 'popular_series']);
  const trending = findCollection(bookData, ['trending_books']);
  const beginner = findCollection(bookData, ['beginner_friendly']);
  const shortReads = findCollection(bookData, ['short_reads']);
  const selfImprovement = findCollection(curated, ['self_improvement']);
  const classics = findCollection(curated, ['all_time_classics']);
  const indianLit = findCollection(curated, ['indian_literature']);
  const romance = findCollection(curated, ['romance']);
  const mystery = findCollection(curated, ['mystery_thriller']);
  const sciFi = findCollection(curated, ['science_fiction_fantasy']);
  const historical = findCollection(curated, ['historical_fiction']);

  if (hasAny(normalized, ['series', 'book series', 'binge'])) {
    return {
      response: `📚 **Great book series to try**\n\n${formatBooks(series, 5)}\n\n💡 **Why this for you:** Series are perfect if you want characters and worlds you can stay with longer.`,
      source: 'local',
      reason: 'series',
    };
  }

  if (hasAny(normalized, ['trending', 'popular', 'bestseller', 'new books', 'new release'])) {
    return {
      response: `🌟 **Trending books right now**\n\n${formatBooks(trending, 5)}\n\n💡 **Why this for you:** These are strong current picks if you want something widely talked about and easy to start with.`,
      source: 'local',
      reason: 'trending',
    };
  }

  if (hasAny(normalized, ['beginner', 'easy read', 'easy to read', 'new reader', 'start reading'])) {
    return {
      response: `🎯 **Beginner-friendly books**\n\n${formatBooks(beginner, 5)}\n\n💡 **Why this for you:** These books are approachable, engaging, and good for building reading momentum.`,
      source: 'local',
      reason: 'beginner',
    };
  }

  if (hasAny(normalized, ['short', 'quick read', 'short reads', 'novella', 'fast read'])) {
    return {
      response: `⚡ **Short reads you can finish quickly**\n\n${formatBooks(shortReads, 4)}\n\n💡 **Why this for you:** These are compact but meaningful choices if you want something rewarding without a long commitment.`,
      source: 'local',
      reason: 'short_reads',
    };
  }

  if (hasAny(normalized, ['self help', 'self-improvement', 'productivity', 'motivation', 'habit'])) {
    return {
      response: `🧠 **Self-improvement picks**\n\n${formatBooks(selfImprovement, 5)}\n\n💡 **Why this for you:** These are practical, high-impact books for building better habits and decision-making.`,
      source: 'local',
      reason: 'self_improvement',
    };
  }

  if (hasAny(normalized, ['classic', 'must read', 'must-read', 'timeless'])) {
    return {
      response: `🏛️ **Classic books worth reading**\n\n${formatBooks(classics, 5)}\n\n💡 **Why this for you:** Classics last because they combine great storytelling with ideas that keep resonating.`,
      source: 'local',
      reason: 'classics',
    };
  }

  if (hasAny(normalized, ['indian', 'india', 'indian authors', 'hindi', 'bharat'])) {
    return {
      response: `🇮🇳 **Great Indian literature picks**\n\n${formatBooks(indianLit, 5)}\n\n💡 **Why this for you:** These books show the range of Indian literary voices, from modern classics to deeply rooted cultural stories.`,
      source: 'local',
      reason: 'indian_literature',
    };
  }

  if (hasAny(normalized, ['romance', 'love story', 'romantic'])) {
    return {
      response: `💕 **Romance recommendations**\n\n${formatBooks(romance, 3)}\n\n💡 **Why this for you:** These are character-driven, emotionally engaging, and easy to enjoy.`,
      source: 'local',
      reason: 'romance',
    };
  }

  if (hasAny(normalized, ['thriller', 'mystery', 'crime', 'detective'])) {
    return {
      response: `🕵️ **Mystery and thriller picks**\n\n${formatBooks(mystery, 5)}\n\n💡 **Why this for you:** If you want suspense and page-turning tension, these are solid choices.`,
      source: 'local',
      reason: 'thriller',
    };
  }

  if (hasAny(normalized, ['sci fi', 'science fiction', 'fantasy', 'space', 'dystopian'])) {
    return {
      response: `🚀 **Science fiction and fantasy picks**\n\n${formatBooks(sciFi, 5)}\n\n💡 **Why this for you:** These books are ideal if you want imaginative worlds, big ideas, and a strong sense of adventure.`,
      source: 'local',
      reason: 'sci_fi_fantasy',
    };
  }

  if (hasAny(normalized, ['historical', 'history', 'period', 'war'])) {
    return {
      response: `📜 **Historical fiction picks**\n\n${formatBooks(historical, 3)}\n\n💡 **Why this for you:** Historical fiction lets you learn through story while staying emotionally invested.`,
      source: 'local',
      reason: 'historical',
    };
  }

  if (hasAny(normalized, ['recommend', 'suggest', 'what should i read', 'book'])) {
    const combined = [
      ...classics.slice(0, 2),
      ...beginner.slice(0, 1),
      ...trending.slice(0, 1),
      ...selfImprovement.slice(0, 1),
    ];

    return {
      response: `📚 **A starter mix of strong picks**\n\n${formatBooks(combined, 5)}\n\n💡 **Why this for you:** This blend gives you classics, current hits, and practical reads so you can narrow your taste quickly.`,
      source: 'local',
      reason: 'general_recommendations',
    };
  }

  const faqResponse = getFaqResponse(message, bookFaqs);
  if (faqResponse) {
    return faqResponse;
  }

  return {
    response: `📚 I can help with book recommendations, summaries, authors, reading lists, series, and literary discussion.\n\nTry asking for a genre, mood, author, region, or reading level, and I’ll give you a focused list.`,
    source: 'local',
    reason: 'generic',
  };
}

function buildPrompt(message, bookFaqs, bookData, systemPrompts) {
  const systemPrompt = systemPrompts?.system_prompt || 'You are BookWise AI, an expert book recommender.';
  const domain = JSON.stringify({
    faqs: bookFaqs?.faqs || [],
    curated_recommendations: bookData?.curated_recommendations || {},
    book_series: bookData?.book_series || {},
    trending_books: bookData?.trending_books || [],
    beginner_friendly: bookData?.beginner_friendly || [],
    short_reads: bookData?.short_reads || [],
  }, null, 2);

  return `${systemPrompt}\n\nUse this domain context when helpful:\n${domain}\n\nUser message: ${message}\n\nAnswer as BookWise AI with concise, useful recommendations.`;
}

function shouldUseGemini(message, localResult) {
  if (!localResult) {
    return true;
  }

  if (localResult.reason === 'generic') {
    return false;
  }

  const normalized = normalizeText(message);
  return hasAny(normalized, [
    'compare',
    'analysis',
    'why is',
    'theme',
    'interpret',
    'deeper',
    'detailed',
    'write',
    'essay',
    'regional',
    'country',
    'culture',
  ]);
}

async function callGemini({ apiKey, prompt, temperature, topP, maxOutputTokens = 1200 }) {
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topP,
      maxOutputTokens,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return text;
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function textResponse(payload, init = {}) {
  return new Response(payload, {
    ...init,
    headers: {
      ...TEXT_HEADERS,
      ...(init.headers || {}),
    },
  });
}

function sseMessage(type, data) {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

function sseDone() {
  return 'data: [DONE]\n\n';
}

function extractListResponse(items, key) {
  return jsonResponse({ [key]: items });
}

export {
  callGemini,
  createCacheKey,
  extractListResponse,
  getCachedResponse,
  getKnowledgeBase,
  getLocalBookResponse,
  isGeminiQuotaError,
  jsonResponse,
  normalizeText,
  putCachedResponse,
  sseDone,
  sseMessage,
  shouldUseGemini,
  textResponse,
  titleCase,
  buildPrompt,
};
