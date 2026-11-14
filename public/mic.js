class MicrophonePCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new ArrayBuffer(8000);
    this.view = new DataView(this.chunk);
    this.offset = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (const sample of samples) {
      const value = Math.max(-1, Math.min(1, sample));
      this.view.setInt16(this.offset, value * (value < 0 ? 32768 : 32767), true);
      this.offset += 2;
      if (this.offset === this.chunk.byteLength) {
        this.port.postMessage(this.chunk, [this.chunk]);
        this.chunk = new ArrayBuffer(8000);
        this.view = new DataView(this.chunk);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('mic-pcm', MicrophonePCM);
