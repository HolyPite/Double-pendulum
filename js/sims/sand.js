// =====================================================
// SIMULATION : Sable (automate cellulaire "falling sand")
// Grille de cellules, chaque matériau a ses règles locales.
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const CELL = 4;                // taille d'une cellule en pixels
let gw = 0, gh = 0;
let grid = null;               // Uint8Array gw*gh
let noiseMap = null;           // variation de teinte par cellule (statique)
let frame = 0;

// Matériaux
const E = 0, WALL = 1, SAND = 2, WATER = 3, WOOD = 4, FIRE = 5, STEAM = 6;

const MATERIALS = [
    { id: SAND,  name: 'Sable',  color: '#d4a847' },
    { id: WATER, name: 'Eau',    color: '#3b76d6' },
    { id: WALL,  name: 'Mur',    color: '#7f8c8d' },
    { id: WOOD,  name: 'Bois',   color: '#8a5a2b' },
    { id: FIRE,  name: 'Feu',    color: '#ff6a00' },
    { id: STEAM, name: 'Vapeur', color: '#aab4be' },
    { id: E,     name: 'Gomme',  color: '#15151c' },
];

// Couleurs RGB de base par matériau
const COLORS = {
    [E]:     [13, 13, 18],
    [WALL]:  [127, 140, 141],
    [SAND]:  [212, 168, 71],
    [WATER]: [59, 118, 214],
    [WOOD]:  [138, 90, 43],
    [FIRE]:  [255, 106, 0],
    [STEAM]: [160, 170, 180],
};

const params = { mat: SAND, brush: 4, speed: 2 };
const pointer = { down: false, x: -1, y: -1, px: -1, py: -1 };

// Rendu : offscreen à la résolution de la grille, étiré sans lissage
const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let img = null;

const idx = (x, y) => y * gw + x;

// --- GRILLE ---

function initGrid(w, h) {
    const ngw = Math.ceil(w / CELL), ngh = Math.ceil(h / CELL);
    const ng = new Uint8Array(ngw * ngh);
    // Conserver le contenu existant lors d'un redimensionnement
    if (grid) {
        const cw = Math.min(gw, ngw), ch = Math.min(gh, ngh);
        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) ng[y * ngw + x] = grid[y * gw + x];
        }
    }
    grid = ng; gw = ngw; gh = ngh;

    noiseMap = new Uint8Array(gw * gh);
    for (let k = 0; k < noiseMap.length; k++) noiseMap[k] = Math.random() * 255;

    off.width = gw; off.height = gh;
    img = offCtx.createImageData(gw, gh);
}

// --- RÈGLES PAR MATÉRIAU ---

function updateSand(x, y) {
    const i = idx(x, y);
    if (y + 1 >= gh) return;
    const below = idx(x, y + 1);
    const b = grid[below];
    if (b === E) { grid[below] = SAND; grid[i] = E; return; }
    if (b === WATER) { grid[below] = SAND; grid[i] = WATER; return; } // coule dans l'eau
    const first = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [first, -first]) {
        const nx = x + dx;
        if (nx < 0 || nx >= gw) continue;
        const d = idx(nx, y + 1);
        if (grid[d] === E) { grid[d] = SAND; grid[i] = E; return; }
    }
}

function updateWater(x, y) {
    const i = idx(x, y);
    if (y + 1 < gh) {
        const below = idx(x, y + 1);
        if (grid[below] === E) { grid[below] = WATER; grid[i] = E; return; }
        const first = Math.random() < 0.5 ? -1 : 1;
        for (const dx of [first, -first]) {
            const nx = x + dx;
            if (nx < 0 || nx >= gw) continue;
            const d = idx(nx, y + 1);
            if (grid[d] === E) { grid[d] = WATER; grid[i] = E; return; }
        }
    }
    // Écoulement horizontal
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [dir, -dir]) {
        const nx = x + dx;
        if (nx < 0 || nx >= gw) continue;
        const s = idx(nx, y);
        if (grid[s] === E) { grid[s] = WATER; grid[i] = E; return; }
    }
}

function updateFire(x, y) {
    const i = idx(x, y);
    // Eau adjacente → vapeur
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
        if (grid[idx(nx, ny)] === WATER) {
            grid[idx(nx, ny)] = STEAM;
            grid[i] = E;
            return;
        }
    }
    // Enflammer le bois voisin
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue;
            if (grid[idx(nx, ny)] === WOOD && Math.random() < 0.04) grid[idx(nx, ny)] = FIRE;
        }
    }
    // Fumée au-dessus
    if (y > 0 && grid[idx(x, y - 1)] === E && Math.random() < 0.04) grid[idx(x, y - 1)] = STEAM;
    // Extinction
    if (Math.random() < 0.03) grid[i] = Math.random() < 0.4 ? STEAM : E;
}

function updateSteam(x, y) {
    const i = idx(x, y);
    if (Math.random() < 0.015) { grid[i] = E; return; }
    if (y - 1 >= 0) {
        const first = Math.random() < 0.5 ? -1 : 1;
        for (const dx of [0, first, -first]) {
            const nx = x + dx;
            if (nx < 0 || nx >= gw) continue;
            const up = idx(nx, y - 1);
            if (grid[up] === E) { grid[up] = STEAM; grid[i] = E; return; }
        }
    }
    // Dérive latérale sous un plafond
    if (Math.random() < 0.3) {
        const dx = Math.random() < 0.5 ? -1 : 1;
        const nx = x + dx;
        if (nx >= 0 && nx < gw && grid[idx(nx, y)] === E) { grid[idx(nx, y)] = STEAM; grid[i] = E; }
    }
}

function stepOnce() {
    frame++;
    const ltr = (frame & 1) === 0; // alterner le sens de balayage (symétrie)

    // Passe descendante (balayage bas → haut : une cellule tombée n'est pas retraitée)
    for (let y = gh - 1; y >= 0; y--) {
        for (let k = 0; k < gw; k++) {
            const x = ltr ? k : gw - 1 - k;
            const m = grid[idx(x, y)];
            if (m === SAND) updateSand(x, y);
            else if (m === WATER) updateWater(x, y);
            else if (m === FIRE) updateFire(x, y);
        }
    }
    // Passe montante (haut → bas : une cellule montée n'est pas retraitée)
    for (let y = 0; y < gh; y++) {
        for (let k = 0; k < gw; k++) {
            const x = ltr ? k : gw - 1 - k;
            if (grid[idx(x, y)] === STEAM) updateSteam(x, y);
        }
    }
}

// --- PINCEAU ---

function paintAt(mx, my) {
    const gx = Math.floor(mx / CELL);
    const gy = Math.floor(my / CELL);
    const r = params.brush;
    const mat = params.mat;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const x = gx + dx, y = gy + dy;
            if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
            // Gomme et mur écrasent tout ; les autres ne remplacent que le vide
            if (mat === E || mat === WALL || grid[idx(x, y)] === E) grid[idx(x, y)] = mat;
        }
    }
}

function paintLine(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (CELL * 1.5)));
    for (let s = 0; s <= steps; s++) {
        paintAt(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps);
    }
}

// --- PANNEAU ---

function selectMaterial(matId) {
    params.mat = matId;
    document.querySelectorAll('#sd_materials .mat-btn').forEach(b =>
        b.classList.toggle('active', +b.dataset.mat === matId));
}

function bindPanel() {
    const container = document.getElementById('sd_materials');
    MATERIALS.forEach((m, i) => {
        const b = document.createElement('button');
        b.className = 'mat-btn' + (m.id === params.mat ? ' active' : '');
        b.dataset.mat = m.id;
        b.innerHTML = `<span class="swatch" style="background:${m.color}"></span>${i + 1}. ${m.name}`;
        b.addEventListener('click', () => selectMaterial(m.id));
        container.appendChild(b);
    });

    document.getElementById('sd_brush').addEventListener('input', e => {
        params.brush = +e.target.value;
        document.getElementById('sd_val_brush').textContent = e.target.value;
    });
    document.getElementById('sd_speed').addEventListener('input', e => {
        params.speed = +e.target.value;
        document.getElementById('sd_val_speed').textContent = e.target.value;
    });
}

// =====================================================

Engine.register({
    id: 'sand',
    name: 'Sable',
    icon: '⏳',
    hint: 'dessinez avec la souris',
    help: [
        ['1 – 7', 'Choisir un matériau'],
        ['Glisser', 'Dessiner'],
    ],
    init() {
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#0d0d12';
    },
    resize(w, h) {
        width = w; height = h;
        initGrid(w, h);
    },
    update() {
        // Le pinceau marche même en pause (pratique pour construire)
        if (pointer.down) paintAt(pointer.x, pointer.y);
        if (Engine.paused) return;
        for (let s = 0; s < params.speed; s++) stepOnce();
    },
    draw() {
        const data = img.data;
        for (let k = 0; k < grid.length; k++) {
            const m = grid[k];
            const c = COLORS[m];
            const p = k * 4;
            if (m === E || m === WALL) {
                data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2];
            } else if (m === FIRE) {
                // Scintillement
                const f = Math.random();
                data[p] = 220 + f * 35;
                data[p + 1] = 60 + f * 120;
                data[p + 2] = f * 40;
            } else {
                // Variation statique de luminosité par cellule
                const f = 0.82 + (noiseMap[k] / 255) * 0.3;
                data[p] = Math.min(255, c[0] * f);
                data[p + 1] = Math.min(255, c[1] * f);
                data[p + 2] = Math.min(255, c[2] * f);
            }
            data[p + 3] = 255;
        }
        offCtx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#0d0d12';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(off, 0, 0, gw * CELL, gh * CELL);

        // Aperçu du pinceau
        if (pointer.x >= 0) {
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, params.brush * CELL, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },
    reset() { grid.fill(E); },
    clear() { grid.fill(E); },
    pointerDown(x, y) {
        pointer.down = true;
        pointer.x = pointer.px = x;
        pointer.y = pointer.py = y;
        paintAt(x, y);
    },
    pointerMove(x, y) {
        if (pointer.down) paintLine(pointer.x, pointer.y, x, y);
        pointer.px = pointer.x; pointer.py = pointer.y;
        pointer.x = x; pointer.y = y;
    },
    pointerUp() {
        pointer.down = false;
    },
    onKey(e) {
        if (e.key >= '1' && e.key <= '7') {
            const m = MATERIALS[parseInt(e.key) - 1];
            if (m) selectMaterial(m.id);
        }
    },
});
})();
