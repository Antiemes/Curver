const shapeCanvas = document.getElementById('shapeCanvas');
const shapeCtx = shapeCanvas.getContext('2d');
const fftCanvas = document.getElementById('fftCanvas');
const fftCtx = fftCanvas.getContext('2d');

// --- Configuration ---
const N = 32;                // number of points
const SCALE = 3.78;          // pixels per mm at 96 DPI
const CIRCLE_DIAMETER_MM = 3;
const LINE_THICKNESS_MM = 0.5;
const CIRCLE_RADIUS = (CIRCLE_DIAMETER_MM * SCALE) / 2;   // ≈ 5.67 px
const LINE_THICKNESS = LINE_THICKNESS_MM * SCALE;           // ≈ 1.89 px

const CANVAS_SIZE = shapeCanvas.width;   // 350
const CENTER = CANVAS_SIZE / 2;          // 175
const RADIUS = CANVAS_SIZE * 0.4;        // radius of the initial circle

// --- State ---
const points = [];   // {x, y}
let dragIndex = -1;  // index of point currently being dragged

// --- Fourier coefficients array (32 elements) ---
const fourierCoeffs = Array.from({ length: N }, () => ({
    amplitude: 0,
    phase: 0
}));

// --- Initialise points equally spaced on a circle ---
for (let i = 0; i < N; i++) {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2; // start at top
    points.push({
        x: CENTER + RADIUS * Math.cos(angle),
        y: CENTER + RADIUS * Math.sin(angle)
    });
}

// --- Coordinate helpers ---
function getMousePos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function findNearestPoint(mx, my) {
    for (let i = 0; i < N; i++) {
        const dx = points[i].x - mx;
        const dy = points[i].y - my;
        if (dx * dx + dy * dy <= CIRCLE_RADIUS * CIRCLE_RADIUS) {
            return i;
        }
    }
    return -1;
}

// --- By-definition DFT (textbook) ---
// X[k] = Σ x[n] * e^(-i * 2π * k * n / N)  for k = 0, ..., N-1
// Input: array of {re, im} complex numbers, length N (power of 2)
// Returns: new array of {re, im} complex FFT coefficients
function dft(signal) {
    const n = signal.length;
    const result = new Array(n);

    for (let k = 0; k < n; k++) {
        let sumRe = 0;
        let sumIm = 0;

        for (let nIdx = 0; nIdx < n; nIdx++) {
            const angle = -2 * Math.PI * k * nIdx / n;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // Multiply signal[n] by e^(-i*angle)
            const termRe = signal[nIdx].re * cos - signal[nIdx].im * sin;
            const termIm = signal[nIdx].re * sin + signal[nIdx].im * cos;

            sumRe += termRe;
            sumIm += termIm;
        }

        result[k] = { re: sumRe, im: sumIm };
    }

    return result;
}

// --- Compute DFT of the current point positions ---
function computeFFT() {
    const n = points.length;

    // Normalize coordinates to the [-1, 1] range used by mathToCanvas
    const margin = 10;
    const halfSize = (CANVAS_SIZE / 2) - margin;
    const xNorm = points.map(p => (p.x - CENTER) / halfSize);
    const yNorm = points.map(p => -(p.y - CENTER) / halfSize); // flip y

    // Combine into complex signal z = x + i*y
    const complexZ = xNorm.map((x, i) => ({ re: x, im: yNorm[i] }));

    // Run DFT (textbook by-definition)
    const spectrum = dft(complexZ);

    // Convert each DFT bin to amplitude and phase
    for (let k = 0; k < n; k++) {
        const re = spectrum[k].re;
        const im = spectrum[k].im;
        fourierCoeffs[k].amplitude = Math.sqrt(re * re + im * im) / n;
        fourierCoeffs[k].phase = Math.atan2(im, re);
    }

    console.log('FFT coefficients updated:', fourierCoeffs);
    draw();
}

// --- Fourier series evaluation ---
// Given t in [0, 2π], compute x, y from Fourier coefficients:
//   x = Σ amplitude_k * cos(t * k + phase_k)
//   y = Σ amplitude_k * sin(t * k + phase_k)
function fourierPoint(t) {
    let x = 0, y = 0;
    for (let k = 0; k < N; k++) {
        x += fourierCoeffs[k].amplitude * Math.cos(t * k + fourierCoeffs[k].phase);
        y += fourierCoeffs[k].amplitude * Math.sin(t * k + fourierCoeffs[k].phase);
    }
    return { x, y };
}

// Map mathematical coordinates (origin at center, range [-1,1])
// to canvas pixel coordinates
function mathToCanvas(mx, my) {
    const margin = 10;
    const halfSize = (CANVAS_SIZE / 2) - margin;
    return {
        cx: CENTER + mx * halfSize,
        cy: CENTER - my * halfSize   // flip y: canvas 0 is at top
    };
}

// --- Drawing ---
function draw() {
    // Clear both canvases
    shapeCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    fftCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // --- Draw connection lines on shape canvas ---
    shapeCtx.beginPath();
    shapeCtx.strokeStyle = '#000';
    shapeCtx.lineWidth = LINE_THICKNESS;
    for (let i = 0; i < N; i++) {
        const next = (i + 1) % N;
        shapeCtx.moveTo(points[i].x, points[i].y);
        shapeCtx.lineTo(points[next].x, points[next].y);
    }
    shapeCtx.stroke();

    // --- Draw points on shape canvas ---
    for (let i = 0; i < N; i++) {
        shapeCtx.beginPath();
        shapeCtx.arc(points[i].x, points[i].y, CIRCLE_RADIUS, 0, 2 * Math.PI);
        shapeCtx.fillStyle = '#e33';
        shapeCtx.fill();
        shapeCtx.strokeStyle = '#000';
        shapeCtx.lineWidth = 1;
        shapeCtx.stroke();
    }

    // --- Draw Fourier curve on FFT canvas ---
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

// --- Mouse events on shape canvas ---
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
        // Hover cursor change
        const pos = getMousePos(e, shapeCanvas);
        const idx = findNearestPoint(pos.x, pos.y);
        shapeCanvas.style.cursor = idx !== -1 ? 'grab' : 'default';
        return;
    }

    const pos = getMousePos(e, shapeCanvas);
    points[dragIndex].x = pos.x;
    points[dragIndex].y = pos.y;
    draw();
});

window.addEventListener('mouseup', () => {
    dragIndex = -1;
    shapeCanvas.style.cursor = 'default';
});

// --- Compute FFT button ---
const fftBtn = document.getElementById('fftBtn');
fftBtn.addEventListener('click', computeFFT);

// --- Randomize button ---
const randomizeBtn = document.getElementById('randomizeBtn');
randomizeBtn.addEventListener('click', () => {
    for (let i = 0; i < N; i++) {
        fourierCoeffs[i].amplitude = Math.random() * 4 - 2;       // [-2, 2]
        fourierCoeffs[i].phase = Math.random() * 2 * Math.PI;     // [0, 2π]
    }
    console.log('Coefficients randomized:', fourierCoeffs);
    draw();
});

// --- Expose points for external use ---
Object.defineProperty(window, 'getPointCoordinates', {
    value: () => points.map(p => ({ x: p.x, y: p.y })),
    configurable: true
});

// Initial draw
draw();
