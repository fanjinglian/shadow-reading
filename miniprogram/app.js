App({
  globalData: {
    session: null
  },

  startSession(payload) {
    this.globalData.session = {
      ...payload,
      startedAt: Date.now(),
      completedAt: null
    };
  },

  completeSession() {
    if (this.globalData.session) {
      this.globalData.session.completedAt = Date.now();
    }
  },

  resetSession() {
    this.globalData.session = null;
  }
});
