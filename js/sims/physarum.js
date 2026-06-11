// =====================================================
// SIMULATION : Physarum (slime mold — algorithme de Jeff Jones)
// Des milliers d'agents déposent une phéromone, la sentent
// devant eux et tournent vers la plus forte concentration.
// → réseaux organiques émergents.
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const SCALE = 3;
let gw = 0, gh = 0;
let trail = null, trail2 = null;

const MAXA = 30000;
const ax = new Float32Array(MAXA);
const ay = new Float32Array(MAXA);
const aa = new Float32Array(MAXA);

const params = {
    count: 12000,
    speed: 1.1,          // cellules / frame
    sensAngle: 25 * Math.PI / 180,
    sensDist: 9,         // cellules
    turn: 25 * Math.PI / 180,
    deposit: 1.2,
    decay: 0.92,         // après diffusion
};

const pointer = { down: false, x: -1, y: -1 };

const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
let img = null;

// Palette : noir → bleu-vert → cyan → blanc
const LUT = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
    const t = i / 255;
    LUT[i * 3]     = Math.pow(t, 2.2) * 235;
    LUT[i * 3 + 1] = Math.pow(t, 1.1) * 240;
    LUT[i * 3 + 2] = Math.pow(t, 1.4) * 255;
}

function initGrid(w, h) {
    gw = Math.ceil(w / SCALE);
    gh = Math.ceil(h / SCALE);
    trail = new Float32Array(gw * gh);
    trail2 = new Float32Array(gw * gh);
    off.width = gw; off.height = gh;
    img = offCtx.createImageData(gw, gh);
}

function spawn() {
    // Disque central : le réseau se déploie vers l'extérieur
    const cx = gw / 2, cy = gh / 2;
    const r = Math.min(gw, gh) * 0.3;
    for (let i = 0; i < MAXA; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r;
        ax[i] = cx + Math.cos(ang) * d;
        ay[i] = cy + Math.sin(ang) * d;
        aa[i] = Math.random() * Math.PI * 2;
    }
}

function sense(x, y, angle, dist) {
    let sx = (x + Math.cos(angle) * dist) | 0;
    let sy = (y + Math.sin(angle) * dist) | 0;
    if (sx < 0) sx += gw; else if (sx >= gw) sx -= gw;
    if (sy < 0) sy += gh; else if (sy >= gh) sy -= gh;
    return trail[sy * gw + sx];
}

function update() {
    if (pointer.down) {
        // Appât : grosse dose de phéromone sous la souris
        const gx = (pointer.x / SCALE) | 0;
        const gy = (pointer.y / SCALE) | 0;
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = (gx + dx + gw) % gw;
                const y = (gy + dy + gh) % gh;
                trail[y * gw + x] = Math.min(8, trail[y * gw + x] + 3);
            }
        }
    }

    if (Engine.paused) return;

    const n = params.count;
    const sa = params.sensAngle, sd = params.sensDist;
    const turn = params.turn, speed = params.speed, dep = params.deposit;

    // 1. Agents : sentir → tourner → avancer → déposer
    for (let i = 0; i < n; i++) {
        const x = ax[i], y = ay[i], a = aa[i];
        const F  = sense(x, y, a, sd);
        const FL = sense(x, y, a - sa, sd);
        const FR = sense(x, y, a + sa, sd);

        if (F > FL && F > FR) {
            // tout droit
        } else if (F < FL && F < FR) {
            aa[i] = a + (Math.random() < 0.5 ? -turn : turn);
        } else if (FL > FR) {
            aa[i] = a - turn;
        } else if (FR > FL) {
            aa[i] = a + turn;
        }

        let nx = x + Math.cos(aa[i]) * speed;
        let ny = y + Math.sin(aa[i]) * speed;
        if (nx < 0) nx += gw; else if (nx >= gw) nx -= gw;
        if (ny < 0) ny += gh; else if (ny >= gh) ny -= gh;
        ax[i] = nx; ay[i] = ny;

        const ci = (ny | 0) * gw + (nx | 0);
        trail[ci] = Math.min(8, trail[ci] + dep);
    }

    // 2. Diffusion (moyenne 3×3) + évaporation
    const decay = params.decay;
    for (let y = 0; y < gh; y++) {
        const ym = ((y - 1 + gh) % gh) * gw;
        const yp = ((y + 1) % gh) * gw;
        const y0 = y * gw;
        for (let x = 0; x < gw; x++) {
            const xm = (x - 1 + gw) % gw;
            const xp = (x + 1) % gw;
            const sum = trail[ym + xm] + trail[ym + x] + trail[ym + xp]
                      + trail[y0 + xm] + trail[y0 + x] + trail[y0 + xp]
                      + trail[yp + xm] + trail[yp + x] + trail[yp + xp];
            trail2[y0 + x] = (sum / 9) * decay;
        }
    }
    [trail, trail2] = [trail2, trail];
}

function draw() {
    const data = img.data;
    for (let i = 0; i < gw * gh; i++) {
        let t = trail[i] * 0.6;
        if (t > 1) t = 1;
        const c = (t * 255) | 0;
        const p = i * 4;
        data[p] = LUT[c * 3]; data[p + 1] = LUT[c * 3 + 1]; data[p + 2] = LUT[c * 3 + 2];
        data[p + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, gw * SCALE, gh * SCALE);
}

// --- PANNEAU ---

function bindPanel() {
    const bindRange = (id, valId, fn) => {
        document.getElementById(id).addEventListener('input', e => {
            document.getElementById(valId).textContent = e.target.value;
            fn(+e.target.value);
        });
    };
    bindRange('ph_count', 'ph_val_count', v => params.count = v);
    bindRange('ph_speed', 'ph_val_speed', v => params.speed = v);
    bindRange('ph_sangle', 'ph_val_sangle', v => params.sensAngle = v * Math.PI / 180);
    bindRange('ph_sdist', 'ph_val_sdist', v => params.sensDist = v);
    bindRange('ph_turn', 'ph_val_turn', v => params.turn = v * Math.PI / 180);
    bindRange('ph_deposit', 'ph_val_deposit', v => params.deposit = v);
    bindRange('ph_decay', 'ph_val_decay', v => params.decay = v / 100);
}

// =====================================================

Engine.register({
    id: 'physarum',
    name: 'Physarum',
    icon: '🍄',
    hint: 'maintenez le clic pour appâter',
    help: [
        ['Maintenir clic', 'Déposer un appât de phéromone'],
    ],
    init() {
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#000205';
    },
    resize(w, h) {
        const first = width === 0;
        width = w; height = h;
        initGrid(w, h);
        if (first) spawn();
        else for (let i = 0; i < MAXA; i++) {
            if (ax[i] >= gw) ax[i] = Math.random() * gw;
            if (ay[i] >= gh) ay[i] = Math.random() * gh;
        }
    },
    update,
    draw,
    reset() {
        trail.fill(0);
        spawn();
    },
    clear() {
        trail.fill(0);
    },
    pointerDown(x, y) { pointer.down = true; pointer.x = x; pointer.y = y; },
    pointerMove(x, y) { pointer.x = x; pointer.y = y; },
    pointerUp() { pointer.down = false; },
});
})();
