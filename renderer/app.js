// ── Constants ────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_NOTE_SET = new Set(['C#', 'D#', 'F#', 'G#', 'A#']);

const CHORD_TYPES = [
    ['',        [0, 4, 7]],
    ['m',       [0, 3, 7]],
    ['7',       [0, 4, 7, 10]],
    ['maj7',    [0, 4, 7, 11]],
    ['m7',      [0, 3, 7, 10]],
    ['dim',     [0, 3, 6]],
    ['aug',     [0, 4, 8]],
    ['sus2',    [0, 2, 7]],
    ['sus4',    [0, 5, 7]],
    ['dim7',    [0, 3, 6, 9]],
    ['m(maj7)', [0, 3, 7, 11]],
    ['aug7',    [0, 4, 8, 10]],
];

const ANALYSIS_INTERVAL_MS = 100;
const SILENCE_THRESHOLD_DB = -60;
const CONFIDENCE_THRESHOLD = 0.7;

// ── Chord Templates ─────────────────────────────────────────

function buildTemplates() {
    const templates = [];
    for (let rootIdx = 0; rootIdx < 12; rootIdx++) {
        for (const [suffix, intervals] of CHORD_TYPES) {
            const template = new Float64Array(12);
            for (const interval of intervals) {
                template[(rootIdx + interval) % 12] = 1.0;
            }
            const norm = Math.sqrt(template.reduce((sum, v) => sum + v * v, 0));
            for (let i = 0; i < 12; i++) template[i] /= norm;
            templates.push({ name: `${NOTE_NAMES[rootIdx]}${suffix}`, template });
        }
    }
    return templates;
}

// ── Chord Detection ─────────────────────────────────────────

function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < 12; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
}

function detectChord(chromaVector, templates) {
    const maxChroma = Math.max(...chromaVector);
    if (maxChroma < 1e-6) {
        return { chord: 'N/C', confidence: 0, activeNotes: [] };
    }

    const norm = Math.sqrt(chromaVector.reduce((s, v) => s + v * v, 0)) + 1e-10;
    const chromaNorm = chromaVector.map(v => v / norm);

    let bestName = 'N/C';
    let bestScore = -1;
    for (const { name, template } of templates) {
        const score = cosineSimilarity(chromaNorm, template);
        if (score > bestScore) {
            bestScore = score;
            bestName = name;
        }
    }

    const threshold = 0.3 * maxChroma;
    const activeNotes = NOTE_NAMES.filter((_, i) => chromaVector[i] > threshold);

    if (bestScore < CONFIDENCE_THRESHOLD) {
        return { chord: 'N/C', confidence: bestScore, activeNotes };
    }
    return { chord: bestName, confidence: bestScore, activeNotes };
}

// ── Chord Smoother ──────────────────────────────────────────

class ChordSmoother {
    constructor(windowSize = 5) {
        this.history = [];
        this.windowSize = windowSize;
        this.lastStable = 'N/C';
    }

    push(chordName) {
        this.history.push(chordName);
        if (this.history.length > this.windowSize) this.history.shift();
        if (this.history.length < 2) return chordName;

        const counts = {};
        for (const c of this.history) counts[c] = (counts[c] || 0) + 1;

        let mostCommon = chordName;
        let maxCount = 0;
        for (const [name, count] of Object.entries(counts)) {
            if (count > maxCount) { maxCount = count; mostCommon = name; }
        }
        if (maxCount >= 2) this.lastStable = mostCommon;
        return this.lastStable;
    }
}

// ── Chroma from FFT ─────────────────────────────────────────

function buildChromaMap(fftSize, sampleRate) {
    const binCount = fftSize / 2;
    const chromaMap = Array.from({ length: 12 }, () => new Float64Array(binCount));

    for (let i = 1; i < binCount; i++) {
        const freq = i * sampleRate / fftSize;
        if (freq < 20 || freq > 5000) continue;
        const midi = 12 * Math.log2(freq / 440) + 69;
        const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
        chromaMap[pitchClass][i] += 1.0;
    }
    return chromaMap;
}

function computeChroma(frequencyData, chromaMap) {
    const chroma = new Float64Array(12);
    for (let pc = 0; pc < 12; pc++) {
        const row = chromaMap[pc];
        let sum = 0;
        for (let bin = 0; bin < frequencyData.length; bin++) {
            if (row[bin] > 0) {
                // Convert dB to linear magnitude
                const mag = Math.pow(10, frequencyData[bin] / 20);
                sum += mag;
            }
        }
        chroma[pc] = sum;
    }
    return chroma;
}

// ── Audio ────────────────────────────────────────────────────

const templates = buildTemplates();
const smoother = new ChordSmoother(5);
let analyser = null;
let chromaMap = null;

async function startAudio() {
    const statusEl = document.getElementById('status');
    const debugEl = document.getElementById('meter-debug');
    try {
        statusEl.textContent = 'Requesting mic...';
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });

        const tracks = stream.getAudioTracks();
        debugEl.textContent = `tracks: ${tracks.length}, label: ${tracks[0]?.label || 'none'}`;

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        chromaMap = buildChromaMap(analyser.fftSize, audioContext.sampleRate);

        document.getElementById('start-section').classList.add('hidden');
        statusEl.textContent = `Listening (${audioContext.sampleRate} Hz)`;
        statusEl.classList.add('connected');

        runAnalysisLoop();
    } catch (err) {
        statusEl.textContent = `Error: ${err.name}`;
        debugEl.textContent = err.message;
        console.error('Microphone error:', err);
    }
}

function runAnalysisLoop() {
    const frequencyData = new Float32Array(analyser.frequencyBinCount);
    const timeData = new Float32Array(analyser.fftSize);
    const meterBar = document.getElementById('meter-bar');
    const debugEl = document.getElementById('meter-debug');

    setInterval(() => {
        // Get time-domain data for the level meter
        analyser.getFloatTimeDomainData(timeData);
        let rms = 0;
        for (let i = 0; i < timeData.length; i++) rms += timeData[i] * timeData[i];
        rms = Math.sqrt(rms / timeData.length);
        const rmsDB = rms > 0 ? 20 * Math.log10(rms) : -100;

        // Level meter: map -60..0 dB to 0..100%
        const meterPct = Math.max(0, Math.min(100, ((rmsDB + 60) / 60) * 100));
        meterBar.style.width = `${meterPct}%`;
        meterBar.style.backgroundColor = meterPct > 80 ? '#e94560' : meterPct > 40 ? '#f0c040' : '#4ecca3';

        // Get frequency data for chord detection
        analyser.getFloatFrequencyData(frequencyData);
        const peakDB = Math.max(...frequencyData);

        debugEl.textContent = `rms: ${rms.toFixed(5)} (${rmsDB.toFixed(1)} dB) peak: ${peakDB.toFixed(1)} dB`;

        if (peakDB < SILENCE_THRESHOLD_DB) {
            updateChordDisplay('N/C', 0);
            updatePiano([]);
            updateChromaBars(new Float64Array(12));
            return;
        }

        const chroma = computeChroma(frequencyData, chromaMap);
        const { chord, confidence, activeNotes } = detectChord(chroma, templates);
        const smoothed = smoother.push(chord);

        updateChordDisplay(smoothed, confidence);
        updatePiano(activeNotes);
        updateChromaBars(chroma);
    }, ANALYSIS_INTERVAL_MS);
}

// ── UI: Chord Display ───────────────────────────────────────

function updateChordDisplay(chord, confidence) {
    const display = document.getElementById('chord-display');
    display.textContent = chord;
    display.classList.toggle('silent', chord === 'N/C');

    const pct = Math.round(confidence * 100);
    document.getElementById('confidence-bar').style.width = `${pct}%`;
    document.getElementById('confidence-value').textContent = `${pct}%`;
}

// ── UI: Piano ───────────────────────────────────────────────

function buildPiano() {
    const piano = document.getElementById('piano');
    // One octave: which white key indices have a black key to their right
    // C=0, D=1, E=2, F=3, G=4, A=5, B=6
    // Black keys sit between: C-D (C#), D-E (D#), F-G (F#), G-A (G#), A-B (A#)
    const WHITE_NOTES_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const BLACK_KEYS_AFTER = { 'C': 'C#', 'D': 'D#', 'F': 'F#', 'G': 'G#', 'A': 'A#' };

    const KEY_W = 38;
    const BLACK_W = 24;
    const KEY_H = 140;
    const BLACK_H = 90;
    const NUM_OCTAVES = 2;
    const totalWhite = NUM_OCTAVES * 7;

    piano.style.width = `${totalWhite * KEY_W}px`;
    piano.style.height = `${KEY_H}px`;

    // White keys first (flow left to right)
    for (let oct = 0; oct < NUM_OCTAVES; oct++) {
        for (let i = 0; i < 7; i++) {
            const note = WHITE_NOTES_ORDER[i];
            const el = document.createElement('div');
            el.className = 'key-white piano-key';
            el.dataset.note = note;
            const idx = oct * 7 + i;
            el.style.left = `${idx * KEY_W}px`;
            el.style.width = `${KEY_W}px`;
            el.style.height = `${KEY_H}px`;
            piano.appendChild(el);
        }
    }

    // Black keys on top, positioned between white keys
    for (let oct = 0; oct < NUM_OCTAVES; oct++) {
        for (let i = 0; i < 7; i++) {
            const whiteNote = WHITE_NOTES_ORDER[i];
            const blackNote = BLACK_KEYS_AFTER[whiteNote];
            if (!blackNote) continue;

            const el = document.createElement('div');
            el.className = 'key-black piano-key';
            el.dataset.note = blackNote;
            const whiteIdx = oct * 7 + i;
            el.style.left = `${(whiteIdx + 1) * KEY_W - BLACK_W / 2}px`;
            el.style.width = `${BLACK_W}px`;
            el.style.height = `${BLACK_H}px`;
            piano.appendChild(el);
        }
    }
}

function updatePiano(activeNotes) {
    const noteSet = new Set(activeNotes);
    document.querySelectorAll('.piano-key').forEach(key => {
        key.classList.toggle('active', noteSet.has(key.dataset.note));
    });
}

// ── UI: Chroma Bars ─────────────────────────────────────────

function buildChromaBars() {
    const barsContainer = document.getElementById('chroma-bars');
    const labelsContainer = document.getElementById('chroma-labels');

    NOTE_NAMES.forEach((note, i) => {
        const bar = document.createElement('div');
        bar.className = 'chroma-bar';
        bar.id = `chroma-${i}`;
        barsContainer.appendChild(bar);

        const label = document.createElement('div');
        label.className = 'chroma-label';
        label.textContent = note;
        labelsContainer.appendChild(label);
    });
}

function updateChromaBars(chroma) {
    const maxVal = Math.max(...chroma, 1e-6);
    NOTE_NAMES.forEach((_, i) => {
        const bar = document.getElementById(`chroma-${i}`);
        const normalized = chroma[i] / maxVal;
        bar.style.height = `${Math.max(normalized * 100, 2)}%`;
        const hue = 240 - normalized * 240;
        bar.style.backgroundColor = `hsl(${hue}, 75%, 55%)`;
    });
}

// ── Init ────────────────────────────────────────────────────

buildPiano();
buildChromaBars();
document.getElementById('start-btn').addEventListener('click', startAudio);

// About modal
const aboutOverlay = document.getElementById('about-overlay');
document.getElementById('about-btn').addEventListener('click', () => {
    aboutOverlay.classList.remove('hidden');
});
document.getElementById('about-close').addEventListener('click', () => {
    aboutOverlay.classList.add('hidden');
});
aboutOverlay.addEventListener('click', (e) => {
    if (e.target === aboutOverlay) aboutOverlay.classList.add('hidden');
});
