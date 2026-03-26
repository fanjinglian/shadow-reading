const BASE_URL = 'http://127.0.0.1:8000';
const STOP_WORDS = new Set(['the', 'a', 'is', 'was', 'to', 'of', 'in', 'and']);

function request({ url, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      timeout: 10000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.message || '服务器返回错误'));
        }
      },
      fail: (err) => reject(err)
    });
  });
}

function normalizeSentences(text) {
  const merged = text.replace(/\s+/g, ' ').trim();
  if (!merged) return [];
  const segments = merged.split(/(?<=[.!?])/g);
  return segments.map((s) => s.trim()).filter(Boolean);
}

function guessKeywords(sentence) {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(' ')
    .filter(Boolean);
  const picked = [];
  for (const word of words) {
    if (STOP_WORDS.has(word) || word.length <= 4) continue;
    if (!picked.find((item) => item.word === word)) {
      picked.push({ word, phonetic: null });
    }
    if (picked.length === 2) break;
  }
  return picked;
}

async function splitText(text) {
  try {
    const data = await request({ url: '/split', method: 'POST', data: { text } });
    return data;
  } catch (error) {
    console.warn('Using fallback split logic', error);
    const sentences = normalizeSentences(text);
    return {
      sentences,
      keywords: sentences.map((sentence) => guessKeywords(sentence))
    };
  }
}

async function getSentenceTts(sentence) {
  return request({ url: '/tts', method: 'POST', data: { sentence } });
}

async function getPhonetic(word) {
  return request({ url: '/phonetic', method: 'GET', data: { word } });
}

async function getWordAudio(word) {
  return request({ url: '/word-tts', method: 'GET', data: { word } }).then((res) => res.audio_url);
}

module.exports = {
  splitText,
  getSentenceTts,
  getPhonetic,
  getWordAudio
};
