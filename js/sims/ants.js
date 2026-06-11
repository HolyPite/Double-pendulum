// =====================================================
// SIMULATION : Fourmis (stigmergie / phéromones)
//
// Rétroaction stigmergique :  ∂τ/∂t = Δτ + D∇²τ − ρτ
//   Δτ    = recrutement (dépôt des fourmis)
//   D∇²τ  = diffusion de la phéromone
//   ρτ    = évaporation
//
// Modèle à double phéromone par espèce :
//   - "maison" déposée par les fourmis en recherche (ramène au nid)
//   - "nourriture" déposée par les fourmis chargées (mène à la bouffe)
// Le dépôt décroît avec le temps écoulé depuis le nid/la nourriture
// → gradient pointant vers la source. Plusieurs espèces, nids et
// sources de nourriture en concurrence ; obstacles dessinables.
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const SCALE = 4;
let gw = 0, gh = 0;

const MAXSPEC = 3;
const SPEC_RGB = [[255, 90, 90], [80, 170, 255], [255, 210, 70]];
const SPEC_NAME = ['Rouges', 'Bleues', 'Jaunes'];

// Champs de grille
let obstacle = null;          // Uint8 : 1 = mur
let food = null;              // Float32 : portions de nourriture
let phFood = [], phHome = []; // Float32[] par espèce
let scratch = null;           // tampon diffusion
let hasNest = [false, false, false];

// Agents
const MAXA = 4500;
const ax = new Float32Array(MAXA);
const ay = new Float32Array(MAXA);
const aang = new Float32Array(MAXA);
const aspec = new Uint8Array(MAXA);
const astate = new Uint8Array(MAXA);  // 0 = recherche, 1 = retour (chargée)
const astr = new Float32Array(MAXA);  // force de dépôt (décroît)
let nAnts = 0;

const SEARCH = 0, RETURN = 1;

// Nids stockés en pixels (survivent au resize) ; nourriture/obstacles en grille
let nests = []; // {px, py, spec}
let score = [0, 0, 0];

const params = {
    species: 1,        // espèce active (placement)
    antsPerNest: 400,
    speed: 1.0,
    D: 0.14,           // diffusion (< 0.25 pour la stabilité)
    rho: 0.02,         // évaporation
    deposit: 0.7,      // recrutement
    sensDist: 8,
    sensAngle: 0.5,
    turn: 0.45,
    wander: 0.45,
    tool: 'food',      // 'nest' | 'food' | 'obstacle' | 'erase'
    brush: 4,
};

const STR_DECAY = 0.9925;     // décroissance du dépôt par pas
const PH_MAX = 4.0;
const FOOD_PER_CELL = 6;
const FOOD_ATTRACT = 6;       // les fourmis "sentent" la bouffe proche

const pointer = { down: false, erase: false, x: -1, y: -1, placed: false };

const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let img = null;

const idx = (x, y) => y * gw + x;

// --- GRILLE ---

function initGrid(w, h) {
    gw = Math.ceil(w / SCALE);
    gh = Math.ceil(h / SCALE);
    const sz = gw * gh;
    obstacle = new Uint8Array(sz);
    food = new Float32Array(sz);
    scratch = new Float32Array(sz);
    phFood = []; phHome = [];
    for (let s = 0; s < MAXSPEC; s++) {
        phFood.push(new Float32Array(sz));
        phHome.push(new Float32Array(sz));
    }
    off.width = gw; off.height = gh;
    img = offCtx.createImageData(gw, gh);
}

function recomputeActive() {
    hasNest = [false, false, false];
    for (const n of nests) hasNest[n.spec] = true;
}

function isSolid(px, py) {
    if (px < 1 || px >= gw - 1 || py < 1 || py >= gh - 1) return true;
    return obstacle[idx(px | 0, py | 0)] === 1;
}

// --- OBSTACLES PROCÉDURAUX ---

function fillRect(x0, y0, w, h) {
    for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++)
            if (x >= 1 && x < gw - 1 && y >= 1 && y < gh - 1) obstacle[idx(x, y)] = 1;
}

function fillDisk(cx, cy, rad) {
    for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++)
            if (dx * dx + dy * dy <= rad * rad) {
                const x = cx + dx, y = cy + dy;
                if (x >= 1 && x < gw - 1 && y >= 1 && y < gh - 1) obstacle[idx(x, y)] = 1;
            }
}

// Dégage les nids et préserve la nourriture après une génération
function protectScene() {
    for (const n of nests) {
        const cx = (n.px / SCALE) | 0, cy = (n.py / SCALE) | 0;
        const rad = 8;
        for (let dy = -rad; dy <= rad; dy++)
            for (let dx = -rad; dx <= rad; dx++) {
                const x = cx + dx, y = cy + dy;
                if (x >= 0 && x < gw && y >= 0 && y < gh && dx * dx + dy * dy <= rad * rad)
                    obstacle[idx(x, y)] = 0;
            }
    }
    for (let i = 0; i < gw * gh; i++) if (food[i] > 0) obstacle[i] = 0;
}

// Labyrinthe par division récursive : murs à bords droits, un passage par mur
function genMaze() {
    obstacle.fill(0);
    const TH = 2;       // épaisseur des murs (cellules)
    const GAP = 4;      // demi-largeur des passages
    const MINROOM = 18; // arrêt de subdivision → pièces ouvertes

    function divide(x0, y0, x1, y1, depth) {
        const w = x1 - x0, h = y1 - y0;
        if (w < MINROOM || h < MINROOM || depth > 9) return;
        const horizontal = (w < h) ? true : (h < w) ? false : (Math.random() < 0.5);
        if (horizontal) {
            const wy = y0 + 4 + ((Math.random() * (h - 8)) | 0);
            const gx = x0 + GAP + 1 + ((Math.random() * (w - 2 * GAP - 2)) | 0);
            for (let x = x0; x < x1; x++) {
                if (Math.abs(x - gx) <= GAP) continue;
                for (let t = 0; t < TH; t++) obstacle[idx(x, wy + t)] = 1;
            }
            divide(x0, y0, x1, wy - 1, depth + 1);
            divide(x0, wy + TH + 1, x1, y1, depth + 1);
        } else {
            const wx = x0 + 4 + ((Math.random() * (w - 8)) | 0);
            const gy = y0 + GAP + 1 + ((Math.random() * (h - 2 * GAP - 2)) | 0);
            for (let y = y0; y < y1; y++) {
                if (Math.abs(y - gy) <= GAP) continue;
                for (let t = 0; t < TH; t++) obstacle[idx(wx + t, y)] = 1;
            }
            divide(x0, y0, wx - 1, y1, depth + 1);
            divide(wx + TH + 1, y0, x1, y1, depth + 1);
        }
    }
    divide(2, 2, gw - 2, gh - 2, 0);
    protectScene();
}

// Champ de piliers : mélange de rectangles et de disques
function genPillars() {
    obstacle.fill(0);
    const n = Math.max(10, (gw * gh / 2600) | 0);
    for (let k = 0; k < n; k++) {
        const cx = 2 + ((Math.random() * (gw - 4)) | 0);
        const cy = 2 + ((Math.random() * (gh - 4)) | 0);
        if (Math.random() < 0.5) {
            const w = 6 + ((Math.random() * 24) | 0);
            const h = 6 + ((Math.random() * 24) | 0);
            fillRect(cx - (w >> 1), cy - (h >> 1), w, h);
        } else {
            fillDisk(cx, cy, 4 + ((Math.random() * 14) | 0));
        }
    }
    protectScene();
}

// --- AGENTS ---

function rebuildAnts() {
    nAnts = 0;
    for (const nest of nests) {
        const ncx = nest.px / SCALE;
        const ncy = nest.py / SCALE;
        for (let k = 0; k < params.antsPerNest && nAnts < MAXA; k++) {
            const a = Math.random() * Math.PI * 2;
            ax[nAnts] = ncx + (Math.random() - 0.5) * 4;
            ay[nAnts] = ncy + (Math.random() - 0.5) * 4;
            aang[nAnts] = a;
            aspec[nAnts] = nest.spec;
            astate[nAnts] = SEARCH;
            astr[nAnts] = 1;
            nAnts++;
        }
    }
}

function nearestNest(spec, cx, cy) {
    let best = null, bd = Infinity;
    for (const n of nests) {
        if (n.spec !== spec) continue;
        const dx = n.px / SCALE - cx, dy = n.py / SCALE - cy;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = n; }
    }
    return best;
}

// Échantillonne la valeur "suivie" devant la fourmi
function sampleSearch(spec, x, y, ang, dist) {
    let sx = (x + Math.cos(ang) * dist) | 0;
    let sy = (y + Math.sin(ang) * dist) | 0;
    if (sx < 0 || sx >= gw || sy < 0 || sy >= gh) return -1;
    const i = idx(sx, sy);
    if (obstacle[i]) return -1;
    return phFood[spec][i] + food[i] * FOOD_ATTRACT;
}

function sampleReturn(spec, x, y, ang, dist) {
    let sx = (x + Math.cos(ang) * dist) | 0;
    let sy = (y + Math.sin(ang) * dist) | 0;
    if (sx < 0 || sx >= gw || sy < 0 || sy >= gh) return -1;
    const i = idx(sx, sy);
    if (obstacle[i]) return -1;
    return phHome[spec][i];
}

function angleTo(a, target) {
    let d = target - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

function updateAnts() {
    const sd = params.sensDist, sa = params.sensAngle;
    const turn = params.turn, speed = params.speed;
    const dep = params.deposit;

    for (let i = 0; i < nAnts; i++) {
        const spec = aspec[i];
        const x = ax[i], y = ay[i], a = aang[i];
        const search = astate[i] === SEARCH;

        // Capteurs : devant, devant-gauche, devant-droite
        let F, FL, FR;
        if (search) {
            F  = sampleSearch(spec, x, y, a, sd);
            FL = sampleSearch(spec, x, y, a - sa, sd);
            FR = sampleSearch(spec, x, y, a + sa, sd);
        } else {
            F  = sampleReturn(spec, x, y, a, sd);
            FL = sampleReturn(spec, x, y, a - sa, sd);
            FR = sampleReturn(spec, x, y, a + sa, sd);
        }

        let na = a;
        if (F >= FL && F >= FR) {
            // tout droit
        } else if (FL > FR) {
            na -= turn;
        } else {
            na += turn;
        }
        na += (Math.random() - 0.5) * params.wander;

        // Biais vers le nid quand la fourmi rentre (referme la boucle)
        if (!search) {
            const nest = nearestNest(spec, x, y);
            if (nest) {
                const desired = Math.atan2(nest.py / SCALE - y, nest.px / SCALE - x);
                na += angleTo(na, desired) * 0.18;
            }
        }

        // Avancer avec glissement le long des murs (évite les blocages
        // dans les coins/concavités : on annule la composante bloquée
        // plutôt que de rebondir au hasard).
        let vx = Math.cos(na) * speed;
        let vy = Math.sin(na) * speed;
        let nx = x + vx, ny = y + vy;

        if (isSolid(nx, ny)) {
            const blockX = isSolid(x + vx, y);
            const blockY = isSolid(x, y + vy);
            if (blockX && !blockY) vx = 0;        // glisse le long d'un mur vertical
            else if (blockY && !blockX) vy = 0;   // glisse le long d'un mur horizontal
            else { vx = -vx; vy = -vy; }          // coin fermé : demi-tour
            nx = x + vx; ny = y + vy;
            if (isSolid(nx, ny)) { nx = x; ny = y; vx = vy = 0; }
            na = (vx !== 0 || vy !== 0) ? Math.atan2(vy, vx) : na + Math.PI;
        }
        ax[i] = nx; ay[i] = ny; aang[i] = na;

        const ci = idx(nx | 0, ny | 0);

        // Dépôt (recrutement) — décroissant avec la distance à la source
        astr[i] *= STR_DECAY;
        const amount = dep * astr[i];
        if (search) {
            const v = phHome[spec][ci] + amount;
            phHome[spec][ci] = v > PH_MAX ? PH_MAX : v;
        } else {
            const v = phFood[spec][ci] + amount;
            phFood[spec][ci] = v > PH_MAX ? PH_MAX : v;
        }

        // Transitions d'état
        if (search) {
            if (food[ci] > 0) {
                food[ci] -= 1;
                astate[i] = RETURN;
                astr[i] = 1;
                aang[i] = na + Math.PI;
            }
        } else {
            const nest = nearestNest(spec, nx, ny);
            if (nest) {
                const dx = nest.px / SCALE - nx, dy = nest.py / SCALE - ny;
                if (dx * dx + dy * dy < 9) { // ~3 cellules
                    score[spec]++;
                    astate[i] = SEARCH;
                    astr[i] = 1;
                    aang[i] = na + Math.PI;
                }
            }
        }
    }
}

// --- DIFFUSION + ÉVAPORATION (le cœur de l'équation) ---

function diffuseField(f) {
    const D = params.D, keep = 1 - params.rho;
    for (let y = 1; y < gh - 1; y++) {
        const y0 = y * gw;
        for (let x = 1; x < gw - 1; x++) {
            const i = y0 + x;
            if (obstacle[i]) { scratch[i] = 0; continue; }
            const c = f[i];
            // Laplacien : un voisin-mur renvoie la valeur centrale (flux nul)
            const l = obstacle[i - 1]  ? c : f[i - 1];
            const r = obstacle[i + 1]  ? c : f[i + 1];
            const u = obstacle[i - gw] ? c : f[i - gw];
            const d = obstacle[i + gw] ? c : f[i + gw];
            const lap = l + r + u + d - 4 * c;
            scratch[i] = (c + D * lap) * keep;
        }
    }
    // Recopier l'intérieur ; bords laissés à 0
    for (let y = 1; y < gh - 1; y++) {
        const y0 = y * gw;
        for (let x = 1; x < gw - 1; x++) f[y0 + x] = scratch[y0 + x];
    }
}

function stepFields() {
    for (let s = 0; s < MAXSPEC; s++) {
        if (!hasNest[s]) continue;
        diffuseField(phFood[s]);
        diffuseField(phHome[s]);
    }
}

// --- OUTILS SOURIS ---

function applyTool(mx, my) {
    const gx = (mx / SCALE) | 0;
    const gy = (my / SCALE) | 0;
    if (gx < 0 || gx >= gw || gy < 0 || gy >= gh) return;
    const tool = pointer.erase ? 'erase' : params.tool;
    const r = params.brush;

    if (tool === 'nest') {
        if (pointer.placed) return;
        nests.push({ px: mx, py: my, spec: params.species });
        pointer.placed = true;
        recomputeActive();
        rebuildAnts();
        return;
    }

    // Obstacles et gomme : pinceau carré → bords droits (pas de blocage
    // des fourmis sur des bordures crénelées). Nourriture : pinceau rond.
    const square = (tool === 'obstacle' || tool === 'erase');
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (!square && dx * dx + dy * dy > r * r) continue;
            const x = gx + dx, y = gy + dy;
            if (x < 0 || x >= gw || y < 0 || y >= gh) continue;
            const i = idx(x, y);
            if (tool === 'food') {
                food[i] = FOOD_PER_CELL;
            } else if (tool === 'obstacle') {
                obstacle[i] = 1;
                food[i] = 0;
                phFood[0][i] = phFood[1][i] = phFood[2][i] = 0;
                phHome[0][i] = phHome[1][i] = phHome[2][i] = 0;
            } else if (tool === 'erase') {
                obstacle[i] = 0;
                food[i] = 0;
            }
        }
    }

    if (tool === 'erase') {
        // Supprimer aussi les nids proches
        const before = nests.length;
        nests = nests.filter(n =>
            Math.hypot(n.px / SCALE - gx, n.py / SCALE - gy) > r + 2);
        if (nests.length !== before) { recomputeActive(); rebuildAnts(); }
    }
}

// --- SCÈNE DE DÉMO ---

function seedDemo() {
    nests = [];
    score = [0, 0, 0];
    if (obstacle) { obstacle.fill(0); food.fill(0); }
    for (let s = 0; s < MAXSPEC; s++) {
        if (phFood[s]) { phFood[s].fill(0); phHome[s].fill(0); }
    }

    nests.push({ px: width * 0.25, py: height * 0.5, spec: 0 });

    // Deux taches de nourriture à droite
    const place = (fx, fy, rad) => {
        const cx = (width * fx / SCALE) | 0, cy = (height * fy / SCALE) | 0;
        for (let dy = -rad; dy <= rad; dy++)
            for (let dx = -rad; dx <= rad; dx++)
                if (dx * dx + dy * dy <= rad * rad) {
                    const x = cx + dx, y = cy + dy;
                    if (x >= 0 && x < gw && y >= 0 && y < gh) food[idx(x, y)] = FOOD_PER_CELL;
                }
    };
    place(0.78, 0.32, 7);
    place(0.72, 0.72, 7);

    recomputeActive();
    rebuildAnts();
}

// --- PANNEAU ---

function renderSpeciesButtons() {
    const cont = document.getElementById('ant_species');
    cont.innerHTML = '';
    for (let s = 0; s < MAXSPEC; s++) {
        const b = document.createElement('button');
        b.className = 'mat-btn' + (s === params.species ? ' active' : '');
        b.dataset.spec = s;
        b.innerHTML = `<span class="swatch" style="background:rgb(${SPEC_RGB[s].join(',')})"></span>${SPEC_NAME[s]}`;
        b.addEventListener('click', () => {
            params.species = s;
            renderSpeciesButtons();
        });
        cont.appendChild(b);
    }
}

function bindPanel() {
    document.querySelectorAll('#ant_tools .tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            params.tool = btn.dataset.tool;
            document.querySelectorAll('#ant_tools .tool-btn').forEach(b =>
                b.classList.toggle('active', b === btn));
        });
    });

    renderSpeciesButtons();

    const bindRange = (id, valId, fn) => {
        document.getElementById(id).addEventListener('input', e => {
            document.getElementById(valId).textContent = e.target.value;
            fn(+e.target.value);
        });
    };
    bindRange('ant_count', 'ant_val_count', v => { params.antsPerNest = v; rebuildAnts(); });
    bindRange('ant_speed', 'ant_val_speed', v => params.speed = v);
    bindRange('ant_brush', 'ant_val_brush', v => params.brush = v);
    bindRange('ant_d', 'ant_val_d', v => params.D = v / 100);
    bindRange('ant_rho', 'ant_val_rho', v => params.rho = v / 1000);
    bindRange('ant_dep', 'ant_val_dep', v => params.deposit = v / 100);
    bindRange('ant_sdist', 'ant_val_sdist', v => params.sensDist = v);

    document.getElementById('ant_clearobs').addEventListener('click', () => {
        obstacle.fill(0);
    });
    document.getElementById('ant_demo').addEventListener('click', seedDemo);
    document.getElementById('ant_maze').addEventListener('click', genMaze);
    document.getElementById('ant_pillars').addEventListener('click', genPillars);
}

// --- RENDU ---

function draw() {
    const data = img.data;
    const sz = gw * gh;
    for (let i = 0; i < sz; i++) {
        const p = i * 4;
        if (obstacle[i]) {
            data[p] = 90; data[p + 1] = 95; data[p + 2] = 105; data[p + 3] = 255;
            continue;
        }
        let r = 6, g = 7, b = 12;
        for (let s = 0; s < MAXSPEC; s++) {
            if (!hasNest[s]) continue;
            const col = SPEC_RGB[s];
            const pf = phFood[s][i];
            if (pf > 0.002) {
                const t = pf > PH_MAX ? 1 : pf / PH_MAX;
                const k = Math.sqrt(t);          // piste vers la nourriture : vive
                r += col[0] * k; g += col[1] * k; b += col[2] * k;
            }
            const ph = phHome[s][i];
            if (ph > 0.002) {
                const t = ph > PH_MAX ? 1 : ph / PH_MAX;
                const k = t * 0.28;              // piste maison : discrète
                r += col[0] * k; g += col[1] * k; b += col[2] * k;
            }
        }
        const fd = food[i];
        if (fd > 0) {
            const k = Math.min(1, fd / FOOD_PER_CELL);
            r += 30 * k; g += 200 * k; b += 80 * k;
        }
        data[p]     = r > 255 ? 255 : r;
        data[p + 1] = g > 255 ? 255 : g;
        data[p + 2] = b > 255 ? 255 : b;
        data[p + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, gw * SCALE, gh * SCALE);

    // Fourmis (un tracé par espèce ; les chargées sont plus claires)
    for (let s = 0; s < MAXSPEC; s++) {
        if (!hasNest[s]) continue;
        const col = SPEC_RGB[s];
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        ctx.beginPath();
        for (let i = 0; i < nAnts; i++) {
            if (aspec[i] !== s || astate[i] !== SEARCH) continue;
            const px = ax[i] * SCALE, py = ay[i] * SCALE;
            ctx.moveTo(px + 1.4, py);
            ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        }
        ctx.fill();
        // chargées
        ctx.fillStyle = '#eafff0';
        ctx.beginPath();
        for (let i = 0; i < nAnts; i++) {
            if (aspec[i] !== s || astate[i] !== RETURN) continue;
            const px = ax[i] * SCALE, py = ay[i] * SCALE;
            ctx.moveTo(px + 1.8, py);
            ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    // Nids
    for (const n of nests) {
        const col = SPEC_RGB[n.spec];
        ctx.beginPath();
        ctx.arc(n.px, n.py, 9, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},0.25)`;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(n.px, n.py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }

    // Tableau des scores (récoltes par espèce)
    let active = [];
    for (let s = 0; s < MAXSPEC; s++) if (hasNest[s]) active.push(s);
    if (active.length) {
        ctx.font = '13px monospace';
        let yy = height - 14 - (active.length - 1) * 18;
        for (const s of active) {
            const col = SPEC_RGB[s];
            ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
            ctx.fillText(`● ${SPEC_NAME[s]} : ${score[s]}`, 16, yy);
            yy += 18;
        }
    }

    // Aperçu pinceau (carré pour obstacle/gomme, rond pour la nourriture)
    if (pointer.x >= 0 && params.tool !== 'nest') {
        const rPx = params.brush * SCALE;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        if (params.tool === 'obstacle' || params.tool === 'erase' || pointer.erase) {
            ctx.strokeRect(pointer.x - rPx, pointer.y - rPx, rPx * 2, rPx * 2);
        } else {
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, rPx, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

// =====================================================

Engine.register({
    id: 'ants',
    name: 'Fourmis',
    icon: '🐜',
    hint: 'placez nids, nourriture, obstacles',
    help: [
        ['Glisser', 'Outil actif (nid, nourriture, obstacle...)'],
        ['Clic droit', 'Gommer (obstacles, nourriture, nids)'],
    ],
    init() {
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#06070c';
        if (nests.length === 0) seedDemo();
    },
    resize(w, h) {
        width = w; height = h;
        initGrid(w, h); // les champs de grille repartent à zéro (taille physique)
        recomputeActive();
        rebuildAnts();
    },
    update() {
        if (pointer.down) applyTool(pointer.x, pointer.y);
        if (Engine.paused) return;
        updateAnts();
        stepFields();
    },
    draw,
    reset() {
        score = [0, 0, 0];
        for (let s = 0; s < MAXSPEC; s++) { phFood[s].fill(0); phHome[s].fill(0); }
        rebuildAnts();
    },
    clear() {
        for (let s = 0; s < MAXSPEC; s++) { phFood[s].fill(0); phHome[s].fill(0); }
    },
    pointerDown(x, y, e) {
        pointer.down = true;
        pointer.erase = e && e.button === 2;
        pointer.placed = false;
        pointer.x = x; pointer.y = y;
        applyTool(x, y);
    },
    pointerMove(x, y) { pointer.x = x; pointer.y = y; },
    pointerUp() { pointer.down = false; pointer.erase = false; },
});
})();
