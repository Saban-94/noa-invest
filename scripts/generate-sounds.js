import fs from "node:fs";

// Generate a valid 44.1kHz 16-bit Mono WAV chime, then write as dispatch-alert.mp3/wav
function generateChimeWav() {
  const sampleRate = 44100;
  const duration = 0.6; // 600ms
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt subchunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate Two-tone Chime: 880Hz for 200ms, silence 50ms, 1320Hz for 300ms
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    if (t < 0.22) {
      // 880Hz with envelope
      const env = Math.exp(-t * 6);
      sample = Math.sin(2 * Math.PI * 880 * t) * env;
    } else if (t >= 0.25 && t < 0.58) {
      // 1320Hz with envelope
      const t2 = t - 0.25;
      const env = Math.exp(-t2 * 7);
      sample = Math.sin(2 * Math.PI * 1320 * t2) * env;
    }
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 30000)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

if (!fs.existsSync("public/sounds")) {
  fs.mkdirSync("public/sounds", { recursive: true });
}

const wavBuf = generateChimeWav();
fs.writeFileSync("public/sounds/dispatch-alert.mp3", wavBuf);
fs.writeFileSync("public/sounds/dispatch-alert.wav", wavBuf);
console.log("Generated dispatch alert audio files!");
