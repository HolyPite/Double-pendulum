// =====================================================
// SIMULATION : Ondes (équation d'onde 2D)
// u(t+1) = 2u - u(t-1) + c²·∇²u, amortie.
// Gouttes, murs dessinables, sources oscillantes,
// preset "double fente" pour les interférences.
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const SCALE = 3;
let gw = 0, gh = 0;
let u = null, uPrev = null, uNext = null;
let walls = null;          // Uint8 : 1 = mur
let sources = [];          // [{x, y}] en cellules
let t = 0;

const params = {
    c2: 0.25,        // vitesse² (stabilité : < 0.5)
    damping: 0.998,
    freq: 0.12,      // pulsation des sources
    amp: 1.2,
    tool: 'drop',    // 'drop' | 'wall' | 'erase' | 'source'
    brush: 3,
};

const pointer = { down: false, erase: false, x: -1, y: -1 };

const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let img = null;

// Palette : creux bleu nuit → repos sombre → crête cyan/blanc
const LUT = new Uint8Array(512 * 3);
for (let i = 0; i < 512; i++) {
    const v = (i - 256) / 256; // -1 .. 1
    let r, g, b;
    if (v < 0) {
        r = 4; g = 18 + (-v) * 10; b = 38 + (-v) * 110;
    } else {
        r = 4 + v * 160; g = 18 + v * 200; b = 38 + v * 217;
    }
    LUT[i * 3] = r; LUT[i * 3 + 1] = g; LUT[i * 3 + 2] = b;
}

function initGrid(w, h) {
    gw = Math.ceil(w / SCALE);
    gh = Math.ceil(h / SCALE);
    const sz = gw * gh;
    u = new Float32Array(sz);
    uPrev = new Float32Array(sz);
    uNext = new Float32Array(sz);
    walls = new Uint8Array(sz);
    sources = [];
    t = 0;
    off.width = gw; off.height = gh;
    img = offCtx.createImageData(gw, gh);
}

function step() {
    t++;
    const c2 = params.c2, damp = params.damping;

    // Sources oscillantes
    const s = Math.sin(t * params.freq) * params.amp;
    for (const src of sources) {
        const i = src.y * gw + src.x;
        if (!walls[i]) u[i] = s;
    }

    for (let y = 1; y < gh - 1; y++) {
        const y0 = y * gw;
        for (let x = 1; x < gw - 1; x++) {
            const i = y0 + x;
            if (walls[i]) { uNext[i] = 0; continue; }
            const lap = u[i - 1] + u[i + 1] + u[i - gw] + u[i + gw] - 4 * u[i];
            uNext[i] = (2 * u[i] - uPrev[i] + c2 * lap) * damp;
        }
    }
    // Bords absorbants simples (copie atténuée du voisin intérieur)
    for (let x = 0; x < gw; x++) {
        uNext[x] = uNext[gw + x] * 0.6;
        uNext[(gh - 1) * gw + x] = uNext[(gh - 2) * gw + x] * 0.6;
    }
    for (let y = 0; y < gh; y++) {
        uNext[y * gw] = uNext[y * gw + 1] * 0.6;
        uNext[y * gw + gw - 1] = uNext[y * gw + gw - 2] * 0.6;
    }

    [uPrev, u, uNext] = [u, uNext, uPrev];
}

// --- OUTILS SOURIS ---

function drop(gx, gy, r) {
    for (let dy = -r * 2; dy <= r * 2; dy++) {
        for (let dx = -r * 2; dx <= r * 2; dx++) {
            const x = gx + dx, y = gy + dy;
            if (x < 1 || x >= gw - 1 || y < 1 || y >= gh - 1) continue;
            const d2 = dx * dx + dy * dy;
            const g = Math.exp(-d2 / (r * r * 2)) * params.amp * 2;
            const i = y * gw + x;
            if (!walls[i]) u[i] += g;
        }
    }
}

function applyTool(mx, my) {
    const gx = (mx / SCALE) | 0;
    const gy = (my / SCALE) | 0;
    if (gx < 1 || gx >= gw - 1 || gy < 1 || gy >= gh - 1) return;
    const tool = pointer.erase ? 'erase' : params.tool;

    if (tool === 'drop') {
        drop(gx, gy, params.brush);
    } else if (tool === 'wall' || tool === 'erase') {
        const r = params.brush;
        const v = tool === 'wall' ? 1 : 0;
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const x = gx + dx, y = gy + dy;
                if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
                const i = y * gw + x;
                walls[i] = v;
                if (v) { u[i] = 0; uPrev[i] = 0; }
            }
        }
        if (tool === 'erase') {
            sources = sources.filter(s => Math.hypot(s.x - gx, s.y - gy) > r + 2);
        }
    } else if (tool === 'source') {
        if (sources.length < 8 && !pointer.sourcePlaced) {
            sources.push({ x: gx, y: gy });
            pointer.sourcePlaced = true; // une source par clic
        }
    }
}

// Mur vertical à deux fentes + source à gauche
function buildDoubleSlit() {
    u.fill(0); uPrev.fill(0);
    walls.fill(0);
    sources = [];

    const wallX = (gw * 0.42) | 0;
    const slitHalf = Math.max(2, (gh * 0.02) | 0);
    const gap = (gh * 0.12) | 0;
    const c1 = (gh / 2 - gap) | 0;
    const c2 = (gh / 2 + gap) | 0;

    for (let y = 0; y < gh; y++) {
        if (Math.abs(y - c1) <= slitHalf || Math.abs(y - c2) <= slitHalf) continue;
        walls[y * gw + wallX] = 1;
        walls[y * gw + wallX + 1] = 1;
    }
    sources.push({ x: (gw * 0.15) | 0, y: (gh / 2) | 0 });
}

// --- PANNEAU ---

function bindPanel() {
    document.querySelectorAll('#wv_tools .tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            params.tool = btn.dataset.tool;
            document.querySelectorAll('#wv_tools .tool-btn').forEach(b =>
                b.classList.toggle('active', b === btn));
        });
    });

    const bindRange = (id, valId, fn) => {
        document.getElementById(id).addEventListener('input', e => {
            document.getElementById(valId).textContent = e.target.value;
            fn(+e.target.value);
        });
    };
    bindRange('wv_speed', 'wv_val_speed', v => params.c2 = v / 100);
    bindRange('wv_damp', 'wv_val_damp', v => params.damping = v / 1000);
    bindRange('wv_freq', 'wv_val_freq', v => params.freq = v / 100);
    bindRange('wv_brush', 'wv_val_brush', v => params.brush = v);

    document.getElementById('wv_doubleslit').addEventListener('click', buildDoubleSlit);
    document.getElementById('wv_clearsources').addEventListener('click', () => sources = []);
}

// =====================================================

Engine.register({
    id: 'waves',
    name: 'Ondes',
    icon: '🌊',
    hint: 'cliquez pour faire des vagues',
    help: [
        ['Glisser', 'Outil actif (goutte, mur, source...)'],
        ['Clic droit', 'Gommer murs et sources'],
    ],
    init() {
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#020a16';
    },
    resize(w, h) {
        width = w; height = h;
        initGrid(w, h); // les champs d'ondes ne survivent pas au resize (taille physique)
    },
    update() {
        if (pointer.down) applyTool(pointer.x, pointer.y);
        if (Engine.paused) return;
        step();
        step(); // 2 pas par frame : propagation plus vive
    },
    draw() {
        const data = img.data;
        for (let i = 0; i < gw * gh; i++) {
            const p = i * 4;
            if (walls[i]) {
                data[p] = 150; data[p + 1] = 155; data[p + 2] = 160;
            } else {
                let v = u[i];
                if (v > 1) v = 1; else if (v < -1) v = -1;
                const c = ((v + 1) * 255.5) | 0;
                data[p] = LUT[c * 3]; data[p + 1] = LUT[c * 3 + 1]; data[p + 2] = LUT[c * 3 + 2];
            }
            data[p + 3] = 255;
        }
        offCtx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(off, 0, 0, gw * SCALE, gh * SCALE);

        // Marqueurs de sources
        for (const s of sources) {
            ctx.beginPath();
            ctx.arc(s.x * SCALE, s.y * SCALE, 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,220,80,0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        if (pointer.x >= 0 && params.tool !== 'source') {
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, params.brush * SCALE, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },
    reset() { initGrid(width, height); },
    clear() { u.fill(0); uPrev.fill(0); },
    pointerDown(x, y, e) {
        pointer.down = true;
        pointer.erase = e && e.button === 2;
        pointer.sourcePlaced = false;
        pointer.x = x; pointer.y = y;
    },
    pointerMove(x, y) { pointer.x = x; pointer.y = y; },
    pointerUp() { pointer.down = false; pointer.erase = false; },
});
})();
