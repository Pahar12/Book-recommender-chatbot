import { jsonResponse } from './_shared.js';

const MAX_CHARS = 20000;

export async function onRequestPost(context) {
  const formData = await context.request.formData().catch(() => null);
  if (!formData) {
    return jsonResponse({ error: 'Invalid upload payload' }, { status: 400 });
  }

  const file = formData.get('document');
  const sessionId = formData.get('session_id') || `session_${crypto.randomUUID()}`;

  if (!file || typeof file.text !== 'function') {
    return jsonResponse({ error: 'No file uploaded' }, { status: 400 });
  }

  const content = await file.text();
  const text = content.slice(0, MAX_CHARS);
  const charCount = text.length;
  const filename = file.name || 'uploaded-document';

  return jsonResponse({
    success: true,
    session_id: sessionId,
    filename,
    char_count: charCount,
    message: `✅ ${filename} uploaded successfully. I can read the first ${charCount.toLocaleString()} characters for Q&A in this demo mode.`,
    preview: text.slice(0, 1000),
    note: 'Cloudflare Pages demo mode supports text-based uploads. PDF/DOCX extraction is available in the Flask backend version.',
  });
}
