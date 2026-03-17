const app = getApp();
const { splitText } = require('../../utils/api');

const SAMPLE_TEXT = `Tom was a little boy who loved animals.
One day he found a small bird!
He built a nest for it by the window.`;

function estimateSentences(text) {
  return text.trim() ? text.replace(/\s+/g, ' ').split(/(?<=[.!?])/g).filter((item) => item.trim()).length : 0;
}

Page({
  data: {
    inputText: '',
    charCount: 0,
    sentenceEstimate: 0,
    isLoading: false,
    error: ''
  },

  handleInput(event) {
    const value = event.detail.value || '';
    this.setData({
      inputText: value,
      charCount: value.length,
      sentenceEstimate: estimateSentences(value)
    });
  },

  handleExample() {
    this.setData({
      inputText: SAMPLE_TEXT,
      charCount: SAMPLE_TEXT.length,
      sentenceEstimate: estimateSentences(SAMPLE_TEXT),
      error: ''
    });
  },

  async handleStart() {
    const text = this.data.inputText.trim();
    if (!text) {
      this.setData({ error: '请先输入或粘贴要练习的英文文本。' });
      return;
    }
    this.setData({ isLoading: true, error: '' });
    try {
      const payload = await splitText(text);
      const sentences = payload.sentences || [];
      if (!sentences.length) {
        throw new Error('未能识别有效句子，请确认文本包含 . ? ! 结尾。');
      }
      const keywords = payload.keywords || sentences.map(() => []);
      app.startSession({ text, sentences, keywords });
      wx.navigateTo({ url: '/pages/shadowing/shadowing' });
    } catch (error) {
      wx.showToast({ title: error.message || '网络异常，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  }
});
