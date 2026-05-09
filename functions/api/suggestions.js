import { jsonResponse } from './_shared.js';

export async function onRequestGet() {
  return jsonResponse({
    suggestions: [
      { text: '📖 Thriller recommendation', prompt: 'Recommend a great thriller' },
      { text: '🌟 Best classics', prompt: 'What are must-read classics?' },
      { text: '🚀 Sci-fi for beginners', prompt: 'Sci-fi books for beginners?' },
      { text: '💕 Romance novels', prompt: 'Best romance novels?' },
      { text: '📚 Book series', prompt: 'Great book series to binge?' },
      { text: '⚡ Quick reads', prompt: 'Short books I can finish fast?' },
    ],
  });
}
