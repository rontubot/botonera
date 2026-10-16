const fs = require('fs');
const path = require('path');

const soundsDir = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Helper para crear un buffer WAV PCM de 16-bit mono a 44100Hz
function createWavBuffer(sampleRate, samples) {
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(intSample), 44 + i * 2);
  }

  return buffer;
}

const sampleRate = 44100;

// 1. Airhorn synth
function genAirhorn() {
  const duration = 1.2;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  const notes = [466.16, 622.25, 783.99]; // Bb4, Eb5, G5
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = 0;
    // modulated pulse
    const mod = 1 + 0.05 * Math.sin(2 * Math.PI * 45 * t);
    for (let f of notes) {
      const p = 2 * Math.PI * f * mod * t;
      s += Math.sign(Math.sin(p)) * 0.25;
      s += Math.sin(p * 2) * 0.15;
    }
    const env = t < 0.05 ? t / 0.05 : Math.max(0, 1 - (t - 0.05) / (duration - 0.05));
    samples[i] = s * env * 0.6;
  }
  return createWavBuffer(sampleRate, samples);
}

// 2. Buzzer Incorrecto (grave tipo quiz show)
function genBuzzer() {
  const duration = 0.9;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // dos ondas de sierra disonantes a 130Hz y 137Hz
    const s1 = (2 * ((130 * t) % 1)) - 1;
    const s2 = (2 * ((138 * t) % 1)) - 1;
    const env = t < 0.02 ? t / 0.02 : Math.max(0, 1 - t / duration);
    samples[i] = (s1 + s2) * 0.4 * env;
  }
  return createWavBuffer(sampleRate, samples);
}

// 3. Ding / Campanilla
function genBell() {
  const duration = 1.6;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  const freqs = [1046.5, 2093, 3135.9];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = 0;
    s += Math.sin(2 * Math.PI * freqs[0] * t) * 0.6 * Math.exp(-3 * t);
    s += Math.sin(2 * Math.PI * freqs[1] * t) * 0.3 * Math.exp(-5 * t);
    s += Math.sin(2 * Math.PI * freqs[2] * t) * 0.15 * Math.exp(-8 * t);
    samples[i] = s;
  }
  return createWavBuffer(sampleRate, samples);
}

// 4. Retro Coin (tipo 8-bit Mario)
function genCoin() {
  const duration = 0.55;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let freq = t < 0.1 ? 987.77 : 1318.51; // B5 luego E6
    const p = 2 * Math.PI * freq * t;
    const s = Math.sin(p) > 0 ? 0.4 : -0.4;
    const env = t < 0.1 ? 1 : Math.max(0, 1 - (t - 0.1) / 0.45);
    samples[i] = s * env;
  }
  return createWavBuffer(sampleRate, samples);
}

// 5. Fanfarria Victoria (arpegio brillante)
function genVictory() {
  const duration = 1.3;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  const notes = [
    { f: 523.25, start: 0.0, end: 0.2 },
    { f: 659.25, start: 0.2, end: 0.4 },
    { f: 783.99, start: 0.4, end: 0.6 },
    { f: 1046.50, start: 0.6, end: 1.3 }
  ];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (let n of notes) {
      if (t >= n.start && t < n.end) {
        const localT = t - n.start;
        const p = 2 * Math.PI * n.f * localT;
        // onda cuadrada suavizada con armónicos
        const noteWave = Math.sin(p) + 0.3 * Math.sin(3 * p) + 0.15 * Math.sin(5 * p);
        const env = n.end === 1.3 ? Math.max(0, 1 - (t - 0.6) / 0.7) : 0.9;
        s += noteWave * 0.4 * env;
      }
    }
    samples[i] = s;
  }
  return createWavBuffer(sampleRate, samples);
}

// 6. Fail Trompeta Triste (wah wah wah)
function genSadTrombone() {
  const duration = 2.4;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  const notes = [
    { f: 370, start: 0.0, end: 0.5 },
    { f: 349, start: 0.5, end: 1.0 },
    { f: 330, start: 1.0, end: 1.5 },
    { f: 293, start: 1.5, end: 2.4, slide: -25 }
  ];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (let n of notes) {
      if (t >= n.start && t < n.end) {
        const localT = t - n.start;
        let curFreq = n.f;
        if (n.slide) {
          curFreq = n.f + (n.slide * (localT / (n.end - n.start)));
        }
        // vibrato
        const vib = 1 + 0.02 * Math.sin(2 * Math.PI * 6 * localT);
        const p = 2 * Math.PI * curFreq * vib * localT;
        // sawtooth-like wave
        const wave = ((p % (2 * Math.PI)) / Math.PI) - 1;
        const env = Math.sin((localT / (n.end - n.start)) * Math.PI);
        s += wave * 0.45 * Math.pow(env, 0.7);
      }
    }
    samples[i] = s;
  }
  return createWavBuffer(sampleRate, samples);
}

// 7. Aplausos / Claps (ráfaga de ruido filtrado)
function genApplause() {
  const duration = 2.0;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noise = (Math.random() * 2 - 1);
    // ráfagas aleatorias superpuestas
    const burst = Math.sin(2 * Math.PI * 8 * t) > 0.4 ? 1.5 : 0.6;
    const env = t < 0.2 ? t / 0.2 : Math.max(0, 1 - t / duration);
    samples[i] = noise * burst * env * 0.35;
  }
  return createWavBuffer(sampleRate, samples);
}

// 8. Chinchín / Brindis con vasos de cerveza
function genBeerCheers() {
  const duration = 1.5;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Dos tonos de cristal golpeando (2200Hz y 2780Hz) con decaimiento rápido
    const clink1 = Math.sin(2 * Math.PI * 2210 * t) * Math.exp(-9 * t);
    const clink2 = Math.sin(2 * Math.PI * 2790 * t) * Math.exp(-11 * t);
    const clink3 = Math.sin(2 * Math.PI * 4420 * t) * 0.5 * Math.exp(-15 * t);
    // segundo choque pequeño después de 0.06s
    let clink4 = 0;
    if (t > 0.06) {
      const t2 = t - 0.06;
      clink4 = Math.sin(2 * Math.PI * 2450 * t2) * 0.4 * Math.exp(-12 * t2);
    }
    samples[i] = (clink1 + clink2 + clink3 + clink4) * 0.5;
  }
  return createWavBuffer(sampleRate, samples);
}

// 9. Punch / Golpe cómico
function genPunch() {
  const duration = 0.5;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const pitch = 220 * Math.exp(-18 * t) + 40;
    const p = 2 * Math.PI * pitch * t;
    const s = Math.sin(p);
    const noise = (Math.random() * 2 - 1) * Math.exp(-25 * t);
    const env = Math.exp(-8 * t);
    samples[i] = (s * 0.7 + noise * 0.4) * env;
  }
  return createWavBuffer(sampleRate, samples);
}

// 10. Tambor / Rimshot (Ba-dum-tss)
function genRimshot() {
  const duration = 1.4;
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = 0;
    // Golpe 1 (0.0s)
    if (t < 0.25) {
      s += Math.sin(2 * Math.PI * (160 * Math.exp(-15 * t) + 70) * t) * Math.exp(-10 * t) * 0.8;
    }
    // Golpe 2 (0.28s)
    if (t >= 0.28 && t < 0.55) {
      const t2 = t - 0.28;
      s += Math.sin(2 * Math.PI * (210 * Math.exp(-15 * t2) + 90) * t2) * Math.exp(-10 * t2) * 0.8;
    }
    // Platillo / Tsss (0.58s)
    if (t >= 0.58) {
      const t3 = t - 0.58;
      const noise = (Math.random() * 2 - 1);
      s += noise * Math.exp(-4.5 * t3) * 0.6;
    }
    samples[i] = s;
  }
  return createWavBuffer(sampleRate, samples);
}

const sounds = [
  { file: 'airhorn.wav', gen: genAirhorn },
  { file: 'buzzer.wav', gen: genBuzzer },
  { file: 'bell.wav', gen: genBell },
  { file: 'coin.wav', gen: genCoin },
  { file: 'victory.wav', gen: genVictory },
  { file: 'fail.wav', gen: genSadTrombone },
  { file: 'applause.wav', gen: genApplause },
  { file: 'cheers.wav', gen: genBeerCheers },
  { file: 'punch.wav', gen: genPunch },
  { file: 'rimshot.wav', gen: genRimshot }
];

sounds.forEach(item => {
  const filePath = path.join(soundsDir, item.file);
  fs.writeFileSync(filePath, item.gen());
  console.log(`Generated: ${item.file}`);
});
console.log('All default sounds generated successfully!');
