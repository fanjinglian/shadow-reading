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
    popupAudioUrl: '',
    speechRate: 0,
    rateDisplay: '标准',
    minRate: -40,
    maxRate: 40,
    rateStep: 5,
    rateMarks: [
      { label: '更慢', value: -40 },
      { label: '慢', value: -20 },
      { label: '标准', value: 0 },
      { label: '快', value: 20 },
      { label: '更快', value: 40 }
    ]
  },

  onLoad() {
    const storedRate = wx.getStorageSync('speechRate');
    this.applySpeechRate(typeof storedRate === 'number' ? storedRate : 0, false, false);
    const session = app.globalData.session;
    if (!session || !session.sentences?.length) {
      this.redirectHome();
      return;
    }
    this.session = session;
    this.audioCache = {};
    this.wordAudioCache = {};
    this.wordAudioJobs = {};
    this.sentenceAudioJobs = {};
    this.rateWarmupTimer = null;
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
    if (this.rateWarmupTimer) {
      clearTimeout(this.rateWarmupTimer);
      this.rateWarmupTimer = null;
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
        this.prefetchSentenceAudio(index);
        this.prefetchSentenceAudio(index + 1);
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
    const index = this.data.currentIndex;
    const rate = this.clampRate(this.data.speechRate);
    const cachedUrl = this.audioCache[index]?.[rate];
    if (cachedUrl && !forceReplay) {
      this.startPlayback(cachedUrl);
      return;
    }
    if (cachedUrl && forceReplay) {
      this.startPlayback(cachedUrl);
      return;
    }
    this.setData({ isFetchingAudio: true });
    this.ensureSentenceAudio(index, rate)
      .then((audioUrl) => {
        if (audioUrl) {
          this.startPlayback(audioUrl);
        } else {
          wx.showToast({ title: '播放失败', icon: 'none' });
        }
      })
      .catch((error) => {
        wx.showToast({ title: error?.message || '播放失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ isFetchingAudio: false });
      });
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
    const rate = this.data.speechRate;
    const cacheKey = this.getWordCacheKey(word, rate);
    const cachedUrl = this.wordAudioCache[cacheKey] || '';
    this.setData({
      showWordPopup: true,
      popupWord: word,
      popupPhonetic: phonetic || '',
      popupAudioUrl: cachedUrl,
      popupLoading: !cachedUrl
    });
    if (!cachedUrl) {
      this.ensureWordAudio(word, false, rate)
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
    if (!this.session?.keywords) return;
    const rate = this.data.speechRate;
    const keywords = (this.session.keywords && this.session.keywords[index]) || [];
    keywords.forEach((item) => {
      if (!item?.word) return;
      this.ensureWordAudio(item.word, true, rate).catch(() => {});
    });
  },

  ensureWordAudio(word, silent = false, rate = this.data.speechRate) {
    if (!word) return Promise.resolve('');
    const cacheKey = this.getWordCacheKey(word, rate);
    if (this.wordAudioCache[cacheKey]) {
      return Promise.resolve(this.wordAudioCache[cacheKey]);
    }
    if (!this.wordAudioJobs[cacheKey]) {
      this.wordAudioJobs[cacheKey] = getWordAudio(word, rate)
        .then((audioUrl) => {
          this.wordAudioCache[cacheKey] = audioUrl;
          return audioUrl;
        })
        .catch((error) => {
          if (!silent) {
            wx.showToast({ title: '单词发音暂不可用', icon: 'none' });
          }
          throw error;
        })
        .finally(() => {
          delete this.wordAudioJobs[cacheKey];
        });
    }
    return this.wordAudioJobs[cacheKey];
  },

  getWordCacheKey(word, rate) {
    return `${word}_${rate}`;
  },

  getSentenceCacheKey(index, rate) {
    return `${index}_${rate}`;
  },

  ensureSentenceAudio(index, rate = this.data.speechRate) {
    const sentence = this.session?.sentences?.[index];
    if (!sentence) {
      return Promise.reject(new Error('句子不存在'));
    }
    const normalizedRate = this.clampRate(Number(rate));
    const cacheForIndex = this.audioCache[index];
    if (cacheForIndex && cacheForIndex[normalizedRate]) {
      return Promise.resolve(cacheForIndex[normalizedRate]);
    }
    if (!this.sentenceAudioJobs) {
      this.sentenceAudioJobs = {};
    }
    const jobKey = this.getSentenceCacheKey(index, normalizedRate);
    if (!this.sentenceAudioJobs[jobKey]) {
      this.sentenceAudioJobs[jobKey] = getSentenceTts(sentence, normalizedRate)
        .then(({ audio_url }) => {
          if (!audio_url) throw new Error('后端未返回音频 URL');
          if (!this.audioCache[index]) {
            this.audioCache[index] = {};
          }
          this.audioCache[index][normalizedRate] = audio_url;
          return audio_url;
        })
        .finally(() => {
          delete this.sentenceAudioJobs[jobKey];
        });
    }
    return this.sentenceAudioJobs[jobKey];
  },

  prefetchSentenceAudio(index) {
    if (index == null || index < 0 || !this.session?.sentences?.[index]) return;
    this.ensureSentenceAudio(index, this.data.speechRate).catch(() => {});
  },

  clampRate(value) {
    if (Number.isNaN(value)) return 0;
    const rounded = Math.round(value / this.data.rateStep) * this.data.rateStep;
    return Math.max(this.data.minRate, Math.min(this.data.maxRate, rounded));
  },

  formatRateLabel(value) {
    if (value === 0) return '标准';
    if (value > 0) return `+${value}%`;
    return `${value}%`;
  },

  applySpeechRate(value, persist = true, prefetch = true) {
    const normalized = this.clampRate(Number(value));
    this.setData({
      speechRate: normalized,
      rateDisplay: this.formatRateLabel(normalized)
    });
    if (persist) {
      wx.setStorageSync('speechRate', normalized);
    }
    if (prefetch) {
      this.prefetchKeywordAudio(this.data.currentIndex);
      this.prefetchSentenceAudio(this.data.currentIndex);
      this.prefetchSentenceAudio(this.data.currentIndex + 1);
    }
    return normalized;
  },

  handleRateSliderChanging(event) {
    const value = event.detail.value;
    this.applySpeechRate(value, false, false);
    this.scheduleRateWarmup(value);
  },

  handleRateSliderChange(event) {
    this.applySpeechRate(event.detail.value, true, true);
  },

  scheduleRateWarmup(value) {
    if (this.rateWarmupTimer) {
      clearTimeout(this.rateWarmupTimer);
    }
    const normalized = this.clampRate(Number(value));
    this.rateWarmupTimer = setTimeout(() => {
      this.rateWarmupTimer = null;
      this.ensureSentenceAudio(this.data.currentIndex, normalized).catch(() => {});
    }, 250);
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
    this.ensureWordAudio(popupWord, false, this.data.speechRate)
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
