class Sound {
  constructor() {
    this.audioContext = null;
    this.waveBuffer = [
      0,
      1.0,
      0.5,
      0.25,
      0.125,
      0.0625,
    ];
  }

  getContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
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
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration
    );

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

    let sourceNode;
    const gainNode = ctx.createGain();

    if (type === "noise") {
      sourceNode = ctx.createBufferSource();
      sourceNode.buffer = this.createNoiseBuffer(
        duration,
        noiseSmooth
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
    const ctx = this.getContext();

    const real = new Float32Array(samples.length);
    const imag = new Float32Array(samples.length);

    for (let i = 1; i < samples.length; i++) {
      imag[i] = samples[i];
    }

    return ctx.createPeriodicWave(real, imag);
  }

  createNoiseBuffer(duration = 0.1, lowPassAmount = 0) {
    const ctx = this.getContext();
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;

      if (lowPassAmount > 0) {
        data[i] = (1 - lowPassAmount) * white + lowPassAmount * lastOut;
        lastOut = data[i];
      } else {
        data[i] = white;
      }
    }

    return buffer;
  }

  // タイル移動の効果音
  move() {
    this.playSynth({
      type: "noise",
      duration: 0.07,
      volume: 0.09,

      noiseSmooth: 0.85,

      filterType: "bandpass",
      filterFreq: 4000,
      filterFreqEnd: 2000,
      filterQ: 2.0,

      attackTime: 0.03,
    });
  }

  // タイルのマージポップの効果音
  merge() {
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
      duration: 0.06, 
      volume: 0.25, 
      freqStart: 380,
      freqEnd: 280,   // 固定
      freqTime: 0.01 
    }, 0.018); // より引き締めるために、重なりを少し多めに（0.008秒後）
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
  }
}

