const app = getApp();

function formatDuration(ms) {
  if (!ms || ms < 0) return '不到 1 秒';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes} 分 ${remain} 秒`;
}

Page({
  data: {
    total: 0,
    durationLabel: '',
    preview: ''
  },

  onLoad() {
    const session = app.globalData.session;
    if (!session) {
      wx.redirectTo({ url: '/pages/input/input' });
      return;
    }
    const duration = session.completedAt && session.startedAt ? session.completedAt - session.startedAt : 0;
    this.setData({
      total: session.sentences?.length || 0,
      durationLabel: formatDuration(duration),
      preview: (session.text || '').slice(0, 120)
    });
  },

  handleReplay() {
    if (app.globalData.session) {
      app.globalData.session.startedAt = Date.now();
      app.globalData.session.completedAt = null;
    }
    wx.navigateTo({ url: '/pages/shadowing/shadowing' });
  },

  handleBackHome() {
    app.resetSession();
    wx.redirectTo({ url: '/pages/input/input' });
  }
});
