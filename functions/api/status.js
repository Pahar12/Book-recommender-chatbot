import { getKnowledgeBase, jsonResponse } from './_shared.js';

export async function onRequestGet(context) {
  const { bookFaqs, bookData } = await getKnowledgeBase(context.request);

  return jsonResponse({
    status: 'running',
    runtime: 'cloudflare-pages',
    timestamp: new Date().toISOString(),
    services: {
      gemini_api: context.env.GEMINI_API_KEY ? '✅' : '⚠️',
      knowledge_base: bookFaqs?.faqs?.length ? '✅' : '⚠️',
      cache: '✅',
      storage: '📝 localStorage',
    },
    features: {
      streaming: true,
      rag: false,
      document_qa: true,
      multilingual: true,
      fallback_mode: true,
      persistent_storage: false,
      cached_ai_answers: true,
      local_chat_history: true,
    },
    counts: {
      curated_groups: Object.keys(bookData?.curated_recommendations || {}).length,
      faq_count: bookFaqs?.faqs?.length || 0,
    },
  });
}
