// =====================================================
// SIMULATION : Jeu de la Vie (et toute la famille B/S)
// Automate cellulaire de Conway avec règles éditables :
// B = nombres de voisins qui font naître, S = qui font survivre.
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const SCALE = 5;
let gw = 0, gh = 0;
let grid = null, next = null;   // Uint8 : 0 mort, 1 vivant
let age = null;                 // Uint16 : générations de vie consécutives
let generation = 0;

const params = {
    born:    [false, false, false, true, false, false, false, false, false], // B3
    survive: [false, false, true, true, false, false, false, false, false],  // S23
    speed: 1,        // générations par frame
    brush: 1,
    density: 0.15,   // pour la soupe aléatoire
};

const RULE_PRESETS = {
    life:     { b: [3], s: [2, 3], desc: 'Life (B3/S23)' },
    highlife: { b: [3, 6], s: [2, 3], desc: 'HighLife (B36/S23)' },
    daynight: { b: [3, 6, 7, 8], s: [3, 4, 6, 7, 8], desc: 'Day & Night' },
    seeds:    { b: [2], s: [], desc: 'Seeds (B2/S-)' },
    maze:     { b: [3], s: [1, 2, 3, 4, 5], desc: 'Labyrinthe (B3/S12345)' },
    coral:    { b: [3], s: [4, 5, 6, 7, 8], desc: 'Corail (B3/S45678)' },
    replicator: { b: [1, 3, 5, 7], s: [1, 3, 5, 7], desc: 'Réplicateur' },
};

const pointer = { down: false, erase: false, x: -1, y: -1 };

const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let img = null;

function initGrid(w, h) {
    const ngw = Math.ceil(w / SCALE), ngh = Math.ceil(h / SCALE);
    const ng = new Uint8Array(ngw * ngh);
    const na = new Uint16Array(ngw * ngh);
    if (grid) {
        const cw = Math.min(gw, ngw), ch = Math.min(gh, ngh);
        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                ng[y * ngw + x] = grid[y * gw + x];
                na[y * ngw + x] = age[y * gw + x];
            }
        }
    }
    grid = ng; age = na; gw = ngw; gh = ngh;
    next = new Uint8Array(gw * gh);
    off.width = gw; off.height = gh;
    img = offCtx.createImageData(gw, gh);
    if (generation === 0) randomSoup();
}

function randomSoup() {
    for (let i = 0; i < grid.length; i++) {
        grid[i] = Math.random() < params.density ? 1 : 0;
        age[i] = grid[i];
    }
    generation = 0;
}

function step() {
    generation++;
    for (let y = 0; y < gh; y++) {
        const ym = ((y - 1 + gh) % gh) * gw;
        const yp = ((y + 1) % gh) * gw;
        const y0 = y * gw;
        for (let x = 0; x < gw; x++) {
            const xm = (x - 1 + gw) % gw;
            const xp = (x + 1) % gw;
            const n = grid[ym + xm] + grid[ym + x] + grid[ym + xp]
                    + grid[y0 + xm]                + grid[y0 + xp]
                    + grid[yp + xm] + grid[yp + x] + grid[yp + xp];
            const i = y0 + x;
            const alive = grid[i] === 1 ? params.survive[n] : params.born[n];
            next[i] = alive ? 1 : 0;
            age[i] = alive ? Math.min(age[i] + 1, 60000) : 0;
        }
    }
    [grid, next] = [next, grid];
}

function paintAt(mx, my, erase) {
    const gx = (mx / SCALE) | 0;
    const gy = (my / SCALE) | 0;
    const r = params.brush;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const x = (gx + dx + gw) % gw;
            const y = (gy + dy + gh) % gh;
            grid[y * gw + x] = erase ? 0 : 1;
            age[y * gw + x] = erase ? 0 : 1;
        }
    }
}

// --- PANNEAU ---

function renderRuleButtons() {
    const make = (containerId, arr) => {
        const cont = document.getElementById(containerId);
        cont.innerHTML = '';
        for (let n = 0; n <= 8; n++) {
            const b = document.createElement('button');
            b.className = 'rule-btn' + (arr[n] ? ' active' : '');
            b.textContent = n;
            b.addEventListener('click', () => {
                arr[n] = !arr[n];
                b.classList.toggle('active', arr[n]);
            });
            cont.appendChild(b);
        }
    };
    make('gol_born', params.born);
    make('gol_survive', params.survive);
}

function applyRulePreset(key) {
    const p = RULE_PRESETS[key];
    for (let n = 0; n <= 8; n++) {
        params.born[n] = p.b.includes(n);
        params.survive[n] = p.s.includes(n);
    }
    renderRuleButtons();
}

function bindPanel() {
    const sel = document.getElementById('gol_preset');
    Object.keys(RULE_PRESETS).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = RULE_PRESETS[key].desc;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', e => applyRulePreset(e.target.value));

    renderRuleButtons();

    document.getElementById('gol_speed').addEventListener('input', e => {
        params.speed = +e.target.value;
        document.getElementById('gol_val_speed').textContent = e.target.value;
    });
    document.getElementById('gol_brush').addEventListener('input', e => {
        params.brush = +e.target.value;
        document.getElementById('gol_val_brush').textContent = e.target.value;
    });
    document.getElementById('gol_density').addEventListener('input', e => {
        params.density = +e.target.value / 100;
        document.getElementById('gol_val_density').textContent = e.target.value;
    });
    document.getElementById('gol_soup').addEventListener('click', randomSoup);
}

// =====================================================

Engine.register({
    id: 'gameoflife',
    name: 'Vie',
    icon: '🔲',
    hint: 'clic = dessiner · clic droit = gommer',
    help: [
        ['Glisser', 'Dessiner des cellules'],
        ['Clic droit', 'Gommer'],
        ['Règles (réglages)', 'Inventer son propre automate B/S'],
    ],
    init() {
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#05060a';
    },
    resize(w, h) {
        width = w; height = h;
        initGrid(w, h);
    },
    update() {
        if (pointer.down) paintAt(pointer.x, pointer.y, pointer.erase);
        if (Engine.paused) return;
        for (let s = 0; s < params.speed; s++) step();
    },
    draw() {
        const data = img.data;
        for (let i = 0; i < grid.length; i++) {
            const p = i * 4;
            if (grid[i]) {
                // Jeunes cellules chaudes → vieilles cellules froides
                const a = age[i];
                if (a < 3)       { data[p] = 255; data[p + 1] = 240; data[p + 2] = 180; }
                else if (a < 12) { data[p] = 120; data[p + 1] = 220; data[p + 2] = 255; }
                else             { data[p] = 50;  data[p + 1] = 120; data[p + 2] = 220; }
            } else {
                data[p] = 5; data[p + 1] = 6; data[p + 2] = 10;
            }
            data[p + 3] = 255;
        }
        offCtx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#05060a';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(off, 0, 0, gw * SCALE, gh * SCALE);

        // Compteur de générations
        ctx.font = '12px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(`Génération ${generation}`, 16, height - 16);

        if (pointer.x >= 0) {
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, Math.max(params.brush, 1) * SCALE, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },
    reset() { randomSoup(); },
    clear() {
        grid.fill(0);
        age.fill(0);
        generation = 0;
    },
    pointerDown(x, y, e) {
        pointer.down = true;
        pointer.erase = e && e.button === 2;
        pointer.x = x; pointer.y = y;
    },
    pointerMove(x, y) { pointer.x = x; pointer.y = y; },
    pointerUp() { pointer.down = false; },
});
})();
