const app = getApp();
const { getSentenceTts, getPhonetic, getWordAudio } = require('../../utils/api');

Page({
  data: {
    currentIndex: 0,
    total: 0,
    sentence: '',
    keywords: [],
    progressText: '',
    progressPercent: 0,
    isPlaying: false,
    isFetchingAudio: false,
    isInitializing: true,
    showWordPopup: false,
    popupWord: '',
    popupPhonetic: '',
    popupLoading: false,
    popupAudioUrl: ''
  },

  onLoad() {
    const session = app.globalData.session;
    if (!session || !session.sentences?.length) {
      this.redirectHome();
      return;
    }
    this.session = session;
    this.audioCache = {};
    this.wordAudioCache = {};
    this.innerAudio = wx.createInnerAudioContext();
    this.innerAudio.onEnded(() => this.setData({ isPlaying: false }));
    this.innerAudio.onStop(() => this.setData({ isPlaying: false }));
    this.innerAudio.onError(() => {
      this.setData({ isPlaying: false });
      wx.showToast({ title: '音频播放失败', icon: 'none' });
    });
    this.updateSentence(0, true);
  },

  onUnload() {
    this.stopAudio();
    if (this.innerAudio) {
      this.innerAudio.destroy();
    }
  },

  redirectHome() {
    wx.showModal({
      title: '提示',
      content: '请先输入要练习的文本。',
      showCancel: false,
      success: () => {
        wx.redirectTo({ url: '/pages/input/input' });
      }
    });
  },

  updateSentence(index, showOverlay = false) {
    const total = this.session.sentences.length;
    const sentence = this.session.sentences[index];
    const keywords = (this.session.keywords && this.session.keywords[index]) || [];
    const percent = total ? Math.round(((index + 1) / total) * 100) : 0;
    this.setData({
      currentIndex: index,
      total,
      sentence,
      keywords,
      progressText: `Sentence ${index + 1} / ${total}`,
      progressPercent: percent,
      isInitializing: showOverlay
    });
    const ensurePromise = this.ensureKeywordPhonetics(index);
    if (showOverlay) {
      Promise.resolve(ensurePromise).finally(() => {
        this.setData({ isInitializing: false });
      });
    } else if (this.data.isInitializing) {
      this.setData({ isInitializing: false });
    }
  },

  async ensureKeywordPhonetics(index) {
    const keywords = (this.session.keywords && this.session.keywords[index]) || [];
    const pending = keywords.filter((item) => !item.phonetic);
    if (!pending.length) return;
    try {
      await Promise.all(
        pending.map(async (item) => {
          try {
            const { phonetic } = await getPhonetic(item.word);
            item.phonetic = phonetic;
          } catch (error) {
            item.phonetic = `/${item.word}/`;
          }
        })
      );
      const updatedKeywords = [...this.session.keywords];
      updatedKeywords[index] = keywords;
      this.session.keywords = updatedKeywords;
      this.setData({ keywords });
    } catch (error) {
      console.warn('phonetic lookup failed', error);
    }
  },

  async playCurrentSentence(forceReplay = false) {
    if (this.data.isFetchingAudio) return;
    const index = this.data.currentIndex;
    const cachedUrl = this.audioCache[index];
    if (cachedUrl && !forceReplay) {
      this.startPlayback(cachedUrl);
      return;
    }
    this.setData({ isFetchingAudio: true });
    try {
      if (cachedUrl && forceReplay) {
        this.startPlayback(cachedUrl);
      } else {
        const { audio_url } = await getSentenceTts(this.data.sentence);
        if (!audio_url) throw new Error('后端未返回音频 URL');
        this.audioCache[index] = audio_url;
        this.startPlayback(audio_url);
      }
    } catch (error) {
      wx.showToast({ title: error.message || '播放失败', icon: 'none' });
    } finally {
      this.setData({ isFetchingAudio: false });
    }
  },

  startPlayback(url) {
    if (!this.innerAudio) return;
    this.stopAudio();
    this.innerAudio.src = url;
    this.innerAudio.play();
    this.setData({ isPlaying: true });
  },

  stopAudio() {
    if (this.innerAudio) {
      this.innerAudio.stop();
    }
    this.setData({ isPlaying: false });
  },

  handleListen() {
    this.playCurrentSentence(false);
  },

  handleReplay() {
    this.playCurrentSentence(true);
  },

  handleNext() {
    const nextIndex = this.data.currentIndex + 1;
    if (nextIndex >= this.data.total) {
      this.finishSession();
      return;
    }
    this.stopAudio();
    this.updateSentence(nextIndex, true);
  },

  finishSession() {
    this.stopAudio();
    app.completeSession();
    wx.navigateTo({ url: '/pages/result/result' });
  },

  handleKeywordTap(event) {
    const word = event.currentTarget.dataset.word;
    const phonetic = event.currentTarget.dataset.phonetic;
    if (!word) return;
    this.stopAudio();
    this.setData({
      showWordPopup: true,
      popupWord: word,
      popupPhonetic: phonetic || '',
      popupAudioUrl: this.wordAudioCache[word] || '',
      popupLoading: !this.wordAudioCache[word]
    });
    if (!this.wordAudioCache[word]) {
      this.loadWordAudio(word);
    }
  },

  async loadWordAudio(word) {
    this.setData({ popupLoading: true });
    try {
      const audioUrl = await getWordAudio(word);
      this.wordAudioCache[word] = audioUrl;
      if (this.data.popupWord === word) {
        this.setData({ popupAudioUrl: audioUrl, popupLoading: false });
      }
    } catch (error) {
      this.setData({ popupLoading: false });
      wx.showToast({ title: '单词发音暂不可用', icon: 'none' });
    }
  },

  handlePopupClose() {
    this.setData({
      showWordPopup: false,
      popupWord: '',
      popupPhonetic: '',
      popupAudioUrl: '',
      popupLoading: false
    });
  },

  handlePopupPlay() {
    const { popupWord, popupAudioUrl } = this.data;
    if (!popupWord) return;
    if (!popupAudioUrl) {
      this.loadWordAudio(popupWord);
      return;
    }
    this.startPlayback(popupAudioUrl);
  }
});
