# Rechordnizer

Real-time piano chord recognition from microphone input.

**[Try it live](https://ting.bgo.city/rechordnizer.html)**

Rechordnizer listens to your microphone, analyzes the audio using FFT-based chroma extraction, and identifies piano chords in real-time. It displays the detected chord name, highlights active notes on a piano keyboard, and shows a live chroma frequency visualization.

Runs entirely in the browser — no install needed. Just open the page and allow microphone access.

## Features

- Real-time chord detection at ~10 Hz
- 144 chord templates: 12 root notes across 12 chord types (major, minor, 7th, maj7, m7, dim, aug, sus2, sus4, dim7, m(maj7), aug7)
- Cosine similarity matching with confidence scoring
- Prediction smoothing via majority vote
- Piano keyboard visualization with highlighted active notes
- Chroma bar display showing pitch class energy distribution
- Input level meter
- Single-file, zero dependencies — just HTML, CSS, and JavaScript

## How it works

1. Microphone audio is captured via the Web Audio API
2. An `AnalyserNode` computes the FFT magnitude spectrum
3. FFT bins are mapped to 12 pitch classes (C through B) using the MIDI frequency formula
4. The resulting chroma vector is matched against 144 pre-computed chord templates using cosine similarity
5. A majority-vote smoother stabilizes predictions over a sliding window

## Self-hosting

The entire app is a single `index.html` file. Serve it from any web server, or open it directly in a browser.

```bash
git clone https://github.com/tanketom/rechordnizer.git
cd rechordnizer
open index.html
```

> Note: Microphone access requires HTTPS in most browsers. For local development, `localhost` or `file://` will work.

## Supported chord types

| Type | Example | Intervals |
|------|---------|-----------|
| Major | C | 0, 4, 7 |
| Minor | Cm | 0, 3, 7 |
| Dominant 7th | C7 | 0, 4, 7, 10 |
| Major 7th | Cmaj7 | 0, 4, 7, 11 |
| Minor 7th | Cm7 | 0, 3, 7, 10 |
| Diminished | Cdim | 0, 3, 6 |
| Augmented | Caug | 0, 4, 8 |
| Suspended 2nd | Csus2 | 0, 2, 7 |
| Suspended 4th | Csus4 | 0, 5, 7 |
| Diminished 7th | Cdim7 | 0, 3, 6, 9 |
| Minor-major 7th | Cm(maj7) | 0, 3, 7, 11 |
| Augmented 7th | Caug7 | 0, 4, 8, 10 |

## License

Open-source, MIT License. Developed by Andreas Hadsel Opsvik and Claude.

Heia Ivar Aasen!
