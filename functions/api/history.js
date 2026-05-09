import { jsonResponse } from './_shared.js';

export async function onRequestGet() {
  return jsonResponse({ history: [] });
}
