import { getKnowledgeBase, jsonResponse } from './_shared.js';

export async function onRequestGet(context) {
  const { bookData } = await getKnowledgeBase(context.request);
  return jsonResponse({ short_reads: bookData?.short_reads || [] });
}
