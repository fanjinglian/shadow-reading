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
    this.wordAudioJobs = {};
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
    Promise.resolve(ensurePromise)
      .catch(() => {})
      .finally(() => {
        this.prefetchKeywordAudio(index);
        if (showOverlay || this.data.isInitializing) {
          this.setData({ isInitializing: false });
        }
      });
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
    const cachedUrl = this.wordAudioCache[word] || '';
    this.setData({
      showWordPopup: true,
      popupWord: word,
      popupPhonetic: phonetic || '',
      popupAudioUrl: cachedUrl,
      popupLoading: !cachedUrl
    });
    if (!cachedUrl) {
      this.ensureWordAudio(word)
        .then((audioUrl) => {
          if (this.data.popupWord === word) {
            this.setData({ popupAudioUrl: audioUrl, popupLoading: false });
          }
        })
        .catch(() => {
          if (this.data.popupWord === word) {
            this.setData({ popupLoading: false });
          }
        });
    }
  },

  prefetchKeywordAudio(index) {
    const keywords = (this.session.keywords && this.session.keywords[index]) || [];
    keywords.forEach((item) => {
      if (!item?.word) return;
      this.ensureWordAudio(item.word, true).catch(() => {});
    });
  },

  ensureWordAudio(word, silent = false) {
    if (!word) return Promise.resolve('');
    if (this.wordAudioCache[word]) {
      return Promise.resolve(this.wordAudioCache[word]);
    }
    if (!this.wordAudioJobs[word]) {
      this.wordAudioJobs[word] = getWordAudio(word)
        .then((audioUrl) => {
          this.wordAudioCache[word] = audioUrl;
          return audioUrl;
        })
        .catch((error) => {
          if (!silent) {
            wx.showToast({ title: '单词发音暂不可用', icon: 'none' });
          }
          throw error;
        })
        .finally(() => {
          delete this.wordAudioJobs[word];
        });
    }
    return this.wordAudioJobs[word];
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
    if (popupAudioUrl) {
      this.startPlayback(popupAudioUrl);
      return;
    }
    this.setData({ popupLoading: true });
    this.ensureWordAudio(popupWord)
      .then((audioUrl) => {
        if (this.data.popupWord === popupWord) {
          this.setData({ popupAudioUrl: audioUrl, popupLoading: false });
        }
        this.startPlayback(audioUrl);
      })
      .catch(() => {
        if (this.data.popupWord === popupWord) {
          this.setData({ popupLoading: false });
        }
      });
  }
});
