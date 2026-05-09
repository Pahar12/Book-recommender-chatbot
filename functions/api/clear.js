import { jsonResponse } from './_shared.js';

export async function onRequestPost() {
  return jsonResponse({ success: true, message: 'Cleared!' });
}
