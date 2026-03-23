Component({
  properties: {
    show: { type: Boolean, value: false },
    word: { type: String, value: '' },
    phonetic: { type: String, value: '' },
    loading: { type: Boolean, value: false }
  },

  methods: {
    handleMaskTap() {
      this.triggerEvent('close');
    },

    handleCardTap() {
      // prevent mask tap
    },

    handleClose() {
      this.triggerEvent('close');
    },

    handlePlay() {
      if (this.data.loading) return;
      this.triggerEvent('play');
    }
  }
});
