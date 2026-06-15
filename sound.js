class Sound {
  constructor() {
    this.audioContext = null;
    this.periodicWaveCache = new Map();
  }

  getContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  getPeriodicWave(samples) {
    const key = samples.join(",");

    if (!this.periodicWaveCache.has(key)) {
      this.periodicWaveCache.set(
        key,
        this.createPeriodicWave(samples)
      );
    }
    return this.periodicWaveCache.get(key);
  }

  play(freq, duration, type = "square", volume = 0.1) {
    const ctx = this.getContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (Array.isArray(type)) {
      osc.setPeriodicWave(this.createPeriodicWave(type));
    } else {
      osc.type = type;
    }

    osc.frequency.value = freq;

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playSynth(p = {}, delay = 0) {
    const ctx = this.getContext();
    const time = ctx.currentTime + delay;

    const type         = p.type || "sine";
    const duration     = p.duration || 0.1;
    const volStart     = p.volume ?? 0.1;

    const freqStart    = p.freqStart || 440;
    const freqEnd      = p.freqEnd || freqStart;
    const freqTime     = p.freqTime || duration;

    const filterType   = p.filterType || null;
    const filterFreq   = p.filterFreq || 1000;
    const filterFreqEnd = p.filterFreqEnd ?? filterFreq;
    const filterQ      = p.filterQ || 1.0;

    const attackTime   = p.attackTime ?? 0.005;

    const noiseSmooth  = p.noiseSmooth ?? 0;
    const smoothCount  = p.smoothCount ?? 0;

    let sourceNode;
    const gainNode = ctx.createGain();

    if (type === "noise") {
      sourceNode = ctx.createBufferSource();
      sourceNode.buffer = this.createNoiseBuffer(
        duration,
        noiseSmooth,
        smoothCount
      );
    } else {
      sourceNode = ctx.createOscillator();
      sourceNode.type = type;

      sourceNode.frequency.setValueAtTime(freqStart, time);
      sourceNode.frequency.exponentialRampToValueAtTime(
        freqEnd,
        time + freqTime
      );
    }

    let lastNode = sourceNode;

    if (filterType) {
      const filterNode = ctx.createBiquadFilter();

      filterNode.type = filterType;
      filterNode.Q.value = filterQ;

      filterNode.frequency.setValueAtTime(
        filterFreq,
        time
      );

      if (filterFreqEnd !== filterFreq) {
        filterNode.frequency.linearRampToValueAtTime(
          filterFreqEnd,
          time + duration
        );
      }

      lastNode.connect(filterNode);
      lastNode = filterNode;
    }

    lastNode.connect(gainNode);

    gainNode.gain.setValueAtTime(0.001, time);
    gainNode.gain.linearRampToValueAtTime(
      volStart,
      time + attackTime
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      time + duration
    );

    gainNode.connect(ctx.destination);

    sourceNode.start(time);

    if (type !== "noise") {
      sourceNode.stop(time + duration);
    }
  }

  createPeriodicWave(samples) {
    this.validateSamples(samples);
    const ctx = this.getContext();
    const N = samples.length;

    const real = new Float32Array(N / 2 + 1);
    const imag = new Float32Array(N / 2 + 1);

    // DFT
    for (let k = 0; k <= N / 2; k++) {
      let re = 0;
      let im = 0;

      for (let n = 0; n < N; n++) {
        const phase = (2 * Math.PI * k * n) / N;

        re += samples[n] * Math.cos(phase);
        im -= samples[n] * Math.sin(phase);
      }
      real[k] = re / N;
      imag[k] = im / N;
    }

    return ctx.createPeriodicWave(real, imag, {
      disableNormalization: false,
    });
  }

  validateSamples(samples) {
    if (!Array.isArray(samples) && !(samples instanceof Float32Array)) {
      throw new TypeError("samples must be an Array or Float32Array");
    }
    const length = samples.length;
    if (length < 64 || length > 256) {
      throw new RangeError("samples length must be between 64 and 256");
    }
    if ((length & (length - 1)) !== 0) {
      throw new RangeError("samples length must be a power of two");
    }
    for (let i = 0; i < length; i++) {
      const value = samples[i];
      if (!Number.isFinite(value)) {
        throw new TypeError(`samples[${i}] must be a finite number`);
      }
      if (Math.abs(value) > 1) {
        throw new RangeError(`samples[${i}] must be between -1 and 1`);
      }
    }
  }

  createNoiseBuffer(duration, smoothAmount = 0.9, smoothPasses = 2) {
  const ctx = this.getContext();
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // ホワイトノイズ生成
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  // 平滑化
  for (let pass = 0; pass < smoothPasses; pass++) {
    let last = data[0];
    for (let i = 1; i < length; i++) {
      last = smoothAmount * last + (1 - smoothAmount) * data[i];
      data[i] = last;
    }
  }

  // 音量低下を補正
  let peak = 0;
  for (let i = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0) {
    const gain = 1 / peak;
    for (let i = 0; i < length; i++) {
      data[i] *= gain;
    }
  }

  return buffer;
}

  // タイル移動の効果音
  move() {
    this.playSynth({
      type: "noise",
      duration: 0.07,
      volume: 0.38,

      noiseSmooth: 0.85,
      smoothCount: 3,

      filterType: "bandpass",
      filterFreq: 4000,
      filterFreqEnd: 2000,
      filterQ: 2.0,

      attackTime: 0.03,
    });
  }

  // タイルのマージポップの効果音
  merge(value) {
    const pitch = 280 + Math.log2(value) * 20;
    const volume = Math.min(0.35, 0.20 + Math.log2(value) * 0.01);
    let toneDuration = 0.06;

    if (value >= 512) {
      toneDuration = 0.10;
    }

    this.playSynth({ 
      type: "noise", 
      duration: 0.01, 
      volume: 0.07, 
      filterType: "bandpass", 
      filterFreq: 3400, 
      filterQ: 5 
    });
    
    this.playSynth({ 
      type: "sine", 
      duration: toneDuration, 
      volume: volume, 
      freqStart: pitch,
      freqEnd: pitch * 0.75,
      freqTime: 0.01 
    }, 0.018);

    if (value >= 1024) {
      this.playSynth({
        type: "triangle",
        duration: toneDuration * 1.2,
        volume: 0.06,
        freqStart: 190,
        freqEnd: 150,
        freqTime: 0.02,
      }, 0.018);
    }
  }


  // 2048達成
  clear() {
    const notes = [523, 659, 784, 1046];

    notes.forEach((freq, i) => {
      this.playSynth({
        type: "triangle",
        duration: 0.15,
        volume: 0.1,
        freqStart: freq,
      }, i * 0.1);
    });
  }

  // ピロン　ゲームオーバー
  gameOver() {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    this.playSynth({
      type: "triangle",
      duration: 0.15,
      volume: 0.1,
      freqStart: 780,
      freqEnd: 700,       // ほんの少しだけピッチを下げて「ガッカリ感」を出す
      freqTime: 0.3
    });

    // 2音目：0.08秒後に少し低い音を重ねて、和音（マイナー気味）にして「終わり感」を補強
    this.playSynth({
      type: "triangle",
      duration: 0.10,
      volume: 0.05,
      freqStart: 598,     // ファの音（悲しげな響きを作る）
      freqEnd: 550,
      freqTime: 0.25
    }, 0.08);


    this.playSynth({
      type: "triangle",
      duration: 0.15,
      volume: 0.1,
      freqStart: 780,
      freqEnd: 700,       // ほんの少しだけピッチを下げて「ガッカリ感」を出す
      freqTime: 0.3
    }, 0.28);

  }
}

