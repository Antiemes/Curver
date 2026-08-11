const shapeCanvas = document.getElementById('shapeCanvas');
const shapeCtx = shapeCanvas.getContext('2d');
const fftCanvas = document.getElementById('fftCanvas');
const fftCtx = fftCanvas.getContext('2d');

// --- Configuration ---
const N = 32;
const SCALE = 3.78;
const CIRCLE_DIAMETER_MM = 3;
const LINE_THICKNESS_MM = 0.5;
const CIRCLE_RADIUS = (CIRCLE_DIAMETER_MM * SCALE) / 2;
const LINE_THICKNESS = LINE_THICKNESS_MM * SCALE;

const CANVAS_SIZE = shapeCanvas.width;
const CENTER = CANVAS_SIZE / 2;
const HALF_SIZE = (CANVAS_SIZE / 2) - 10;

// --- State ---
const points = [];
let dragIndex = -1;

// --- Fourier coefficients ---
const fourierCoeffs = Array.from({ length: N }, () => ({
    amplitude: 0,
    phase: 0
}));

// --- Initialize points on circle (math coords: center=0,0, radius=1) ---
for (let i = 0; i < N; i++) {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2;
    points.push({
        x: Math.cos(angle),
        y: Math.sin(angle)
    });
}

// --- Coordinate helpers ---
function getMousePos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function mathToCanvas(mx, my) {
    return {
        cx: CENTER + mx * HALF_SIZE,
        cy: CENTER - my * HALF_SIZE
    };
}

function pixelToMath(px, py) {
    return {
        x: (px - CENTER) / HALF_SIZE,
        y: -(py - CENTER) / HALF_SIZE
    };
}

function findNearestPoint(mx, my) {
    for (let i = 0; i < N; i++) {
        const { cx, cy } = mathToCanvas(points[i].x, points[i].y);
        const dx = cx - mx;
        const dy = cy - my;
        if (dx * dx + dy * dy <= CIRCLE_RADIUS * CIRCLE_RADIUS) {
            return i;
        }
    }
    return -1;
}

// --- By-definition DFT (centered: k from -N/2 to N/2-1) ---
function dft(signal)
{
  const n = signal.length;
  const halfN = n / 2;
  const result = new Array(n);
  // Output order: -N/2, -N/2+1, ..., -1, 0, 1, ..., N/2-1
  for (let idx = 0; idx < n; idx++)
  {
    const k = idx - halfN; // centered frequency index: -N/2 to N/2-1
    const kStd = (k + n) % n; // standard DFT index (0 to N-1)
    let sumRe = 0, sumIm = 0;
    for (let nIdx = 0; nIdx < n; nIdx++)
    {
      const angle = -2 * Math.PI * kStd * nIdx / n;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const termRe = signal[nIdx].re * cos - signal[nIdx].im * sin;
      const termIm = signal[nIdx].re * sin + signal[nIdx].im * cos;
      sumRe += termRe;
      sumIm += termIm;
    }
    result[idx] = { re: sumRe, im: sumIm };
  }
  return result;
}

// --- Compute DFT ---
function computeFFT()
{
  const n = points.length;
  // Points are already in math coordinates (center=0,0, radius=1)
  const complexZ = points.map(p => ({ re: p.x, im: p.y }));
  const spectrum = dft(complexZ);
  // spectrum[k] now corresponds to centered frequency index k - N/2 (range: -N/2 to N/2-1)
  for (let k = 0; k < n; k++)
  {
    const freq = k - n / 2; // centered frequency index
    const re = spectrum[k].re;
    const im = spectrum[k].im;
    fourierCoeffs[k].amplitude = Math.sqrt(re * re + im * im) / n;
    fourierCoeffs[k].phase = Math.atan2(im, re);
    fourierCoeffs[k].freq = freq;
  }
  console.log('FFT coefficients updated:', fourierCoeffs);
  draw();
}

// --- Fourier series evaluation (IDFT reconstruction) ---
function fourierPoint(t)
{
  let x = 0, y = 0;
  for (let k = 0; k < N; k++)
  {
    const freq = k - N / 2; // centered frequency index: -N/2 to N/2-1
    const angle = t * freq;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const X_re = fourierCoeffs[k].amplitude * Math.cos(fourierCoeffs[k].phase);
    const X_im = fourierCoeffs[k].amplitude * Math.sin(fourierCoeffs[k].phase);
    x += X_re * c - X_im * s;
    y += X_re * s + X_im * c;
  }
  return { x, y };
}

// --- Drawing ---
function draw() {
    shapeCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    fftCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Shape canvas
    shapeCtx.beginPath();
    shapeCtx.strokeStyle = '#000';
    shapeCtx.lineWidth = LINE_THICKNESS;
    for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        const { cx: x1, cy: y1 } = mathToCanvas(points[i].x, points[i].y);
        const { cx: x2, cy: y2 } = mathToCanvas(points[next].x, points[next].y);
        shapeCtx.moveTo(x1, y1);
        shapeCtx.lineTo(x2, y2);
    }
    shapeCtx.stroke();

    for (let i = 0; i < N; i++) {
        const { cx, cy } = mathToCanvas(points[i].x, points[i].y);
        shapeCtx.beginPath();
        shapeCtx.arc(cx, cy, CIRCLE_RADIUS, 0, 2 * Math.PI);
        shapeCtx.fillStyle = '#e33';
        shapeCtx.fill();
        shapeCtx.strokeStyle = '#000';
        shapeCtx.lineWidth = 1;
        shapeCtx.stroke();
    }

    // FFT canvas
    fftCtx.beginPath();
    fftCtx.strokeStyle = '#00f';
    fftCtx.lineWidth = 1.5;
    const steps = 500;
    for (let s = 0; s <= steps; s++) {
        const t = (s / steps) * 2 * Math.PI;
        const pt = fourierPoint(t);
        const { cx, cy } = mathToCanvas(pt.x, pt.y);
        if (s === 0) {
            fftCtx.moveTo(cx, cy);
        } else {
            fftCtx.lineTo(cx, cy);
        }
    }
    fftCtx.closePath();
    fftCtx.stroke();
}

// --- Mouse events ---
shapeCanvas.addEventListener('mousedown', (e) => {
    const pos = getMousePos(e, shapeCanvas);
    const idx = findNearestPoint(pos.x, pos.y);
    if (idx !== -1) {
        dragIndex = idx;
        shapeCanvas.style.cursor = 'grabbing';
    }
});

window.addEventListener('mousemove', (e) => {
    if (dragIndex === -1) {
        const pos = getMousePos(e, shapeCanvas);
        const idx = findNearestPoint(pos.x, pos.y);
        shapeCanvas.style.cursor = idx !== -1 ? 'grab' : 'default';
        return;
    }
    const pos = getMousePos(e, shapeCanvas);
    const math = pixelToMath(pos.x, pos.y);
    points[dragIndex].x = math.x;
    points[dragIndex].y = math.y;
    computeFFT();
});

window.addEventListener('mouseup', () => {
    dragIndex = -1;
    shapeCanvas.style.cursor = 'default';
});

// --- Buttons ---
const fftBtn = document.getElementById('fftBtn');
fftBtn.addEventListener('click', computeFFT);

const randomizeBtn = document.getElementById('randomizeBtn');
randomizeBtn.addEventListener('click', () => {
    for (let i = 0; i < N; i++) {
        fourierCoeffs[i].amplitude = Math.random() * 4 - 2;
        fourierCoeffs[i].phase = Math.random() * 2 * Math.PI;
    }
    console.log('Coefficients randomized:', fourierCoeffs);
    draw();
});

// --- Window API ---
window.getPointCoordinates = () => points.map(p => ({ x: p.x, y: p.y }));
window.getFourierCoefficients = () => fourierCoeffs.map(c => ({
    amplitude: c.amplitude,
    phase: c.phase
}));
window.mathToCanvas = mathToCanvas;

// Initial draw
draw();
