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

    handleCardTap(event) {
      event.stopPropagation();
    },

    handleClose() {
      this.triggerEvent('close');
    },

    handlePlay(event) {
      event.stopPropagation();
      if (this.data.loading) return;
      this.triggerEvent('play');
    }
  }
});
