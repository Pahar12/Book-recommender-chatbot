import {
  buildPrompt,
  createCacheKey,
  getCachedResponse,
  getKnowledgeBase,
  getLocalBookResponse,
  isGeminiQuotaError,
  jsonResponse,
  putCachedResponse,
  shouldUseGemini,
  callGemini,
} from './_shared.js';

export async function onRequestPost(context) {
  const requestBody = await context.request.json().catch(() => ({}));
  const message = String(requestBody.message || '').trim();
  const sessionId = requestBody.session_id || `session_${crypto.randomUUID()}`;
  const temperature = Number(requestBody.temperature ?? 0.7);
  const topP = Number(requestBody.top_p ?? 0.9);

  if (!message) {
    return jsonResponse({ error: 'Message cannot be empty' }, { status: 400 });
  }

  const { bookFaqs, bookData, systemPrompts } = await getKnowledgeBase(context.request);
  const localResult = getLocalBookResponse(message, bookFaqs, bookData);
  const cacheKey = await createCacheKey(message, sessionId, temperature, topP);
  const cached = await getCachedResponse(context.request, cacheKey);

  if (cached) {
    return jsonResponse({
      success: true,
      response: cached.response,
      session_id: sessionId,
      language: cached.language || 'en',
      source: cached.source || 'cache',
      cached: true,
      timestamp: new Date().toISOString(),
      message_count: cached.message_count || 2,
    });
  }

  let responseText = localResult?.response || '';
  let source = localResult?.source || 'local';

  if (shouldUseGemini(message, localResult)) {
    try {
      const prompt = buildPrompt(message, bookFaqs, bookData, systemPrompts);
      responseText = await callGemini({
        apiKey: context.env.GEMINI_API_KEY,
        prompt,
        temperature,
        topP,
        maxOutputTokens: 1200,
      });
      source = 'gemini';
    } catch (error) {
      if (isGeminiQuotaError(error)) {
        source = 'fallback';
        responseText = localResult?.response || '📚 Gemini quota is exhausted right now, so BookWise is using its offline knowledge base.';
      } else {
        source = 'fallback';
        responseText = localResult?.response || `📚 I couldn't reach Gemini right now. ${String(error.message || error)}`;
      }
    }
  }

  const payload = {
    success: true,
    response: responseText,
    session_id: sessionId,
    language: 'en',
    source,
    cached: false,
    timestamp: new Date().toISOString(),
    message_count: 2,
  };

  await putCachedResponse(context.request, cacheKey, {
    response: responseText,
    source,
    language: 'en',
    message_count: 2,
  });

  return jsonResponse(payload);
}
