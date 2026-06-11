// =====================================================
// SIMULATION : Particle Life
// N familles de particules, matrice d'attraction/répulsion
// asymétrique → comportements émergents ("créatures").
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const MAXN = 1500;
const px = new Float32Array(MAXN), py = new Float32Array(MAXN);
const vx = new Float32Array(MAXN), vy = new Float32Array(MAXN);
const ptype = new Uint8Array(MAXN);

const params = {
    types: 5,
    count: 600,
    rMax: 80,       // rayon d'interaction
    force: 1,
    friction: 0.85,
};

let K = [];         // matrice types×types, valeurs dans [-1, 1]
let colors = [];
const mouse = { x: 0, y: 0, down: false };

// Grille spatiale (linked lists) pour éviter le O(n²)
let head = null;
const nextIdx = new Int32Array(MAXN);
let gw = 0, gh = 0, cell = 1;

// --- RÈGLES ---

function buildColors() {
    colors = [];
    for (let i = 0; i < params.types; i++) {
        colors.push(`hsl(${Math.round(i * 360 / params.types)}, 80%, 60%)`);
    }
}

function randomValue() {
    return Math.round((Math.random() * 2 - 1) * 20) / 20;
}

function randomizeMatrix() {
    K = [];
    for (let i = 0; i < params.types; i++) {
        const row = [];
        for (let j = 0; j < params.types; j++) row.push(randomValue());
        K.push(row);
    }
    renderMatrix();
}

function zeroMatrix() {
    K = K.map(row => row.map(() => 0));
    renderMatrix();
}

function setTypes(n) {
    const old = K;
    params.types = n;
    K = [];
    for (let i = 0; i < n; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
            row.push(old[i] && old[i][j] !== undefined ? old[i][j] : randomValue());
        }
        K.push(row);
    }
    buildColors();
    for (let i = 0; i < MAXN; i++) ptype[i] = (Math.random() * n) | 0;
    renderMatrix();
}

function spawn() {
    for (let i = 0; i < MAXN; i++) {
        px[i] = Math.random() * (width || 800);
        py[i] = Math.random() * (height || 600);
        vx[i] = 0; vy[i] = 0;
        ptype[i] = (Math.random() * params.types) | 0;
    }
}

// --- ÉDITEUR DE MATRICE (panneau) ---
// Ligne = famille qui ressent, colonne = famille qui agit.
// Clic : +0.25 (boucle) · Clic droit : -0.25

function cellColor(v) {
    if (v > 0) return `rgba(46, 204, 113, ${0.15 + v * 0.75})`;
    if (v < 0) return `rgba(231, 76, 60, ${0.15 - v * 0.75})`;
    return 'rgba(255,255,255,0.06)';
}

function renderMatrix() {
    const cont = document.getElementById('pl_matrix');
    if (!cont) return;
    const n = params.types;
    cont.innerHTML = '';
    cont.style.gridTemplateColumns = `18px repeat(${n}, 1fr)`;

    const corner = document.createElement('div');
    cont.appendChild(corner);
    for (let j = 0; j < n; j++) {
        const sw = document.createElement('div');
        sw.className = 'pl-swatch';
        sw.style.background = colors[j];
        cont.appendChild(sw);
    }
    for (let i = 0; i < n; i++) {
        const sw = document.createElement('div');
        sw.className = 'pl-swatch';
        sw.style.background = colors[i];
        cont.appendChild(sw);
        for (let j = 0; j < n; j++) {
            const c = document.createElement('button');
            c.className = 'pl-cell';
            c.style.background = cellColor(K[i][j]);
            c.title = `${K[i][j].toFixed(2)} — clic +0.25, clic droit −0.25`;
            const bump = (delta) => {
                let v = Math.round((K[i][j] + delta) * 4) / 4;
                if (v > 1) v = -1;
                if (v < -1) v = 1;
                K[i][j] = v;
                c.style.background = cellColor(v);
                c.title = `${v.toFixed(2)} — clic +0.25, clic droit −0.25`;
            };
            c.addEventListener('click', () => bump(0.25));
            c.addEventListener('contextmenu', (e) => { e.preventDefault(); bump(-0.25); });
            cont.appendChild(c);
        }
    }
}

// --- SIMULATION ---

function update() {
    if (Engine.paused) return;

    const n = params.count;
    const rMax = params.rMax;
    const rMin = rMax * 0.22;
    const r2 = rMax * rMax;
    const halfW = width / 2, halfH = height / 2;

    // Reconstruire la grille spatiale
    cell = rMax;
    gw = Math.max(1, Math.ceil(width / cell));
    gh = Math.max(1, Math.ceil(height / cell));
    if (!head || head.length !== gw * gh) head = new Int32Array(gw * gh);
    head.fill(-1);
    for (let i = 0; i < n; i++) {
        const cxI = Math.min(gw - 1, Math.max(0, (px[i] / cell) | 0));
        const cyI = Math.min(gh - 1, Math.max(0, (py[i] / cell) | 0));
        const ci = cyI * gw + cxI;
        nextIdx[i] = head[ci];
        head[ci] = i;
    }

    const fScale = params.force * 0.6;

    for (let i = 0; i < n; i++) {
        let fx = 0, fy = 0;
        const ti = ptype[i];
        const Ki = K[ti];
        const cxI = Math.min(gw - 1, Math.max(0, (px[i] / cell) | 0));
        const cyI = Math.min(gh - 1, Math.max(0, (py[i] / cell) | 0));

        for (let oy = -1; oy <= 1; oy++) {
            let gy = cyI + oy;
            if (gy < 0) gy += gh; else if (gy >= gh) gy -= gh;
            for (let ox = -1; ox <= 1; ox++) {
                let gx = cxI + ox;
                if (gx < 0) gx += gw; else if (gx >= gw) gx -= gw;

                for (let j = head[gy * gw + gx]; j !== -1; j = nextIdx[j]) {
                    if (j === i) continue;
                    // Distance torique
                    let dx = px[j] - px[i];
                    if (dx > halfW) dx -= width; else if (dx < -halfW) dx += width;
                    let dy = py[j] - py[i];
                    if (dy > halfH) dy -= height; else if (dy < -halfH) dy += height;
                    const d2 = dx * dx + dy * dy;
                    if (d2 > r2 || d2 < 1e-6) continue;
                    const d = Math.sqrt(d2);

                    let f;
                    if (d < rMin) f = d / rMin - 1; // répulsion universelle de contact
                    else f = Ki[ptype[j]] * (1 - Math.abs(2 * d - rMin - rMax) / (rMax - rMin));

                    fx += (dx / d) * f;
                    fy += (dy / d) * f;
                }
            }
        }

        // Souris : disperser (maintenir le clic)
        if (mouse.down) {
            let dx = px[i] - mouse.x, dy = py[i] - mouse.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && d < 150) {
                const s = 3 * (1 - d / 150);
                fx += (dx / d) * s;
                fy += (dy / d) * s;
            }
        }

        vx[i] = (vx[i] + fx * fScale) * params.friction;
        vy[i] = (vy[i] + fy * fScale) * params.friction;
        px[i] += vx[i];
        py[i] += vy[i];
        if (px[i] < 0) px[i] += width; else if (px[i] >= width) px[i] -= width;
        if (py[i] < 0) py[i] += height; else if (py[i] >= height) py[i] -= height;
    }
}

function draw() {
    ctx.fillStyle = '#06070d';
    ctx.fillRect(0, 0, width, height);

    const n = params.count;
    // Batch par famille (un seul fill par couleur)
    for (let t = 0; t < params.types; t++) {
        ctx.fillStyle = colors[t];
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            if (ptype[i] !== t) continue;
            ctx.moveTo(px[i] + 2.2, py[i]);
            ctx.arc(px[i], py[i], 2.2, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    if (mouse.down) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(240,90,90,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// --- PANNEAU ---

function bindPanel() {
    const bindRange = (id, valId, fn) => {
        document.getElementById(id).addEventListener('input', e => {
            document.getElementById(valId).textContent = e.target.value;
            fn(+e.target.value);
        });
    };
    bindRange('pl_types', 'pl_val_types', v => setTypes(v));
    bindRange('pl_count', 'pl_val_count', v => params.count = v);
    bindRange('pl_radius', 'pl_val_radius', v => params.rMax = v);
    bindRange('pl_force', 'pl_val_force', v => params.force = v);
    bindRange('pl_friction', 'pl_val_friction', v => params.friction = v);
    document.getElementById('pl_randomize').addEventListener('click', randomizeMatrix);
    document.getElementById('pl_zero').addEventListener('click', zeroMatrix);
}

// =====================================================

Engine.register({
    id: 'plife',
    name: 'Particules',
    icon: '🧬',
    hint: 'éditez la matrice dans ⚙ Réglages',
    help: [
        ['Maintenir clic', 'Disperser les particules'],
        ['Matrice (réglages)', 'Clic +0.25 · clic droit −0.25'],
    ],
    init() {
        buildColors();
        randomizeMatrix();
        spawn();
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#06070d';
    },
    resize(w, h) {
        const first = width === 0;
        width = w; height = h;
        if (first) spawn();
        else for (let i = 0; i < MAXN; i++) {
            if (px[i] >= w) px[i] = Math.random() * w;
            if (py[i] >= h) py[i] = Math.random() * h;
        }
    },
    update,
    draw,
    reset() {
        randomizeMatrix();
        spawn();
    },
    pointerDown(x, y) { mouse.down = true; mouse.x = x; mouse.y = y; },
    pointerMove(x, y) { mouse.x = x; mouse.y = y; },
    pointerUp() { mouse.down = false; },
});
})();
