import { getKnowledgeBase, jsonResponse } from './_shared.js';

export async function onRequestGet(context) {
  const { bookData } = await getKnowledgeBase(context.request);
  return jsonResponse({ series: bookData?.book_series?.popular_series || [] });
}
