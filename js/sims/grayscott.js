// =====================================================
// SIMULATION : Réaction-Diffusion (modèle de Gray-Scott)
// Deux espèces chimiques U et V : U + 2V → 3V, U alimenté,
// V éliminé. Selon feed/kill : taches, labyrinthes, mitose...
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const SCALE = 5;            // pixels par cellule
let gw = 0, gh = 0;
let U = null, V = null, U2 = null, V2 = null;

const params = {
    feed: 0.0545,
    kill: 0.062,
    du: 1.0,        // diffusion U
    dv: 0.5,        // diffusion V
    steps: 6,       // itérations par frame
    brush: 4,
};

const PRESETS = {
    coral:    { feed: 0.0545, kill: 0.0620, desc: 'Corail' },
    mitosis:  { feed: 0.0367, kill: 0.0649, desc: 'Mitose' },
    maze:     { feed: 0.0290, kill: 0.0570, desc: 'Labyrinthe' },
    holes:    { feed: 0.0390, kill: 0.0580, desc: 'Trous' },
    waves:    { feed: 0.0180, kill: 0.0510, desc: 'Vagues instables' },
    solitons: { feed: 0.0300, kill: 0.0600, desc: 'Solitons' },
    worms:    { feed: 0.0780, kill: 0.0610, desc: 'Vers' },
};

const pointer = { down: false, x: -1, y: -1 };

// Rendu
const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let img = null;

// Palette précalculée (V faible → sombre, V fort → clair)
const LUT = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // dégradé nuit → violet → cyan → blanc
    LUT[i * 3]     = Math.min(255, Math.max(0, t < 0.5 ? t * 2 * 110 : 110 + (t - 0.5) * 2 * 145));
    LUT[i * 3 + 1] = Math.min(255, Math.max(0, t < 0.4 ? t * 30 : (t - 0.4) * 380));
    LUT[i * 3 + 2] = Math.min(255, 30 + t * 270);
}

function initGrid(w, h) {
    gw = Math.ceil(w / SCALE);
    gh = Math.ceil(h / SCALE);
    const sz = gw * gh;
    U = new Float32Array(sz); U2 = new Float32Array(sz);
    V = new Float32Array(sz); V2 = new Float32Array(sz);
    off.width = gw; off.height = gh;
    img = offCtx.createImageData(gw, gh);
    seed();
}

function seed() {
    U.fill(1); V.fill(0);
    // Quelques graines aléatoires
    for (let s = 0; s < 12; s++) {
        const cx = (Math.random() * gw) | 0;
        const cy = (Math.random() * gh) | 0;
        blob(cx, cy, 3 + Math.random() * 4);
    }
}

function blob(cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const x = (cx + dx + gw) % gw;
            const y = (cy + dy + gh) % gh;
            V[y * gw + x] = 1;
            U[y * gw + x] = 0.5;
        }
    }
}

function step() {
    const f = params.feed, k = params.kill;
    const du = params.du, dv = params.dv;

    for (let y = 0; y < gh; y++) {
        const ym = ((y - 1 + gh) % gh) * gw;
        const yp = ((y + 1) % gh) * gw;
        const y0 = y * gw;
        for (let x = 0; x < gw; x++) {
            const xm = (x - 1 + gw) % gw;
            const xp = (x + 1) % gw;
            const i = y0 + x;

            const u = U[i], v = V[i];
            // Laplacien 9 points (poids 0.2 orthogonaux, 0.05 diagonales)
            const lapU = (U[y0 + xm] + U[y0 + xp] + U[ym + x] + U[yp + x]) * 0.2
                       + (U[ym + xm] + U[ym + xp] + U[yp + xm] + U[yp + xp]) * 0.05
                       - u;
            const lapV = (V[y0 + xm] + V[y0 + xp] + V[ym + x] + V[yp + x]) * 0.2
                       + (V[ym + xm] + V[ym + xp] + V[yp + xm] + V[yp + xp]) * 0.05
                       - v;

            const uvv = u * v * v;
            U2[i] = u + (du * lapU - uvv + f * (1 - u));
            V2[i] = v + (dv * lapV + uvv - (k + f) * v);
        }
    }
    [U, U2] = [U2, U];
    [V, V2] = [V2, V];
}

// --- PANNEAU ---

function syncSliders() {
    document.getElementById('gs_feed').value = params.feed * 1000;
    document.getElementById('gs_val_feed').textContent = params.feed.toFixed(4);
    document.getElementById('gs_kill').value = params.kill * 1000;
    document.getElementById('gs_val_kill').textContent = params.kill.toFixed(4);
}

function bindPanel() {
    const sel = document.getElementById('gs_preset');
    Object.keys(PRESETS).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = PRESETS[key].desc;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', e => {
        const p = PRESETS[e.target.value];
        params.feed = p.feed;
        params.kill = p.kill;
        syncSliders();
    });

    document.getElementById('gs_feed').addEventListener('input', e => {
        params.feed = +e.target.value / 1000;
        document.getElementById('gs_val_feed').textContent = params.feed.toFixed(4);
    });
    document.getElementById('gs_kill').addEventListener('input', e => {
        params.kill = +e.target.value / 1000;
        document.getElementById('gs_val_kill').textContent = params.kill.toFixed(4);
    });
    document.getElementById('gs_steps').addEventListener('input', e => {
        params.steps = +e.target.value;
        document.getElementById('gs_val_steps').textContent = e.target.value;
    });
    document.getElementById('gs_brush').addEventListener('input', e => {
        params.brush = +e.target.value;
        document.getElementById('gs_val_brush').textContent = e.target.value;
    });
    document.getElementById('gs_reseed').addEventListener('click', seed);
}

// =====================================================

Engine.register({
    id: 'grayscott',
    name: 'Réaction',
    icon: '🦠',
    hint: 'dessinez, les motifs poussent',
    help: [
        ['Glisser', 'Déposer l\'espèce V (graine de motif)'],
    ],
    init() {
        bindPanel();
        syncSliders();
    },
    activate() {
        document.body.style.backgroundColor = '#02030c';
    },
    resize(w, h) {
        width = w; height = h;
        initGrid(w, h);
    },
    update() {
        if (pointer.down) {
            blob((pointer.x / SCALE) | 0, (pointer.y / SCALE) | 0, params.brush);
        }
        if (Engine.paused) return;
        for (let s = 0; s < params.steps; s++) step();
    },
    draw() {
        const data = img.data;
        for (let i = 0; i < gw * gh; i++) {
            // Le front U-V donne le meilleur contraste
            let t = (U[i] - V[i]);
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            const c = ((1 - t) * 255) | 0;
            const p = i * 4;
            data[p]     = LUT[c * 3];
            data[p + 1] = LUT[c * 3 + 1];
            data[p + 2] = LUT[c * 3 + 2];
            data[p + 3] = 255;
        }
        offCtx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(off, 0, 0, gw * SCALE, gh * SCALE);

        // Aperçu du pinceau
        if (pointer.x >= 0) {
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, params.brush * SCALE, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },
    reset() { seed(); },
    clear() { U.fill(1); V.fill(0); },
    pointerDown(x, y) { pointer.down = true; pointer.x = x; pointer.y = y; },
    pointerMove(x, y) { pointer.x = x; pointer.y = y; },
    pointerUp() { pointer.down = false; },
});
})();
