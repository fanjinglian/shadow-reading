const BASE_URL = 'http://127.0.0.1:8000';
const STOP_WORDS = new Set(['the', 'a', 'is', 'was', 'to', 'of', 'in', 'and']);
const REQUEST_TIMEOUT = 10000;
const REQUEST_LOG_TAG = '[API]';

function logRequest({ url, method, status, duration, message }) {
  console.info(
    `${REQUEST_LOG_TAG} ${method} ${url} status=${status} duration=${duration}ms${message ? ` message=${message}` : ''}`
  );
}

function request({ url, method = 'GET', data, suppressToast = false }) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      timeout: REQUEST_TIMEOUT,
      success: (res) => {
        const duration = Date.now() - started;
        logRequest({ url, method, status: res.statusCode, duration });
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const message = res.data?.detail || res.data?.message || '服务器返回错误';
          if (!suppressToast) {
            wx.showToast({ title: message, icon: 'none' });
          }
          reject(new Error(message));
        }
      },
      fail: (err) => {
        const duration = Date.now() - started;
        logRequest({ url, method, status: 'NETWORK_ERROR', duration, message: err?.errMsg });
        if (!suppressToast) {
          wx.showToast({ title: '网络连接失败，请稍后重试', icon: 'none' });
        }
        reject(err instanceof Error ? err : new Error(err?.errMsg || '网络错误'));
      }
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
    const data = await request({ url: '/split', method: 'POST', data: { text }, suppressToast: true });
    return data;
  } catch (error) {
    console.warn('Using fallback split logic', error);
    wx.showToast({ title: '网络异常，使用本地拆分', icon: 'none' });
    const sentences = normalizeSentences(text);
    return {
      sentences,
      keywords: sentences.map((sentence) => guessKeywords(sentence))
    };
  }
}

async function getSentenceTts(sentence, rate = 0) {
  return request({ url: '/tts', method: 'POST', data: { sentence, rate }, suppressToast: true });
}

async function getPhonetic(word) {
  return request({ url: '/phonetic', method: 'GET', data: { word }, suppressToast: true });
}

async function getWordAudio(word, rate = 0) {
  return request({ url: '/word-tts', method: 'GET', data: { word, rate }, suppressToast: true }).then(
    (res) => res.audio_url
  );
}

module.exports = {
  splitText,
  getSentenceTts,
  getPhonetic,
  getWordAudio
};
