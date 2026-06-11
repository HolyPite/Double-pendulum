// =====================================================
// SIMULATION : Fluide (Navier-Stokes — "Stable Fluids", Jos Stam)
// Grille eulérienne N×N, encre RGB advectée, confinement de vorticité.
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const N = 128;                 // cellules intérieures
const SZ = (N + 2) * (N + 2);
const IX = (i, j) => i + (N + 2) * j;
const DT = 0.12;

// Champs : vitesses, scratch, encre RGB
let u = new Float32Array(SZ), v = new Float32Array(SZ);
let u0 = new Float32Array(SZ), v0 = new Float32Array(SZ);
let dr = new Float32Array(SZ), dg = new Float32Array(SZ), db = new Float32Array(SZ);
let tmp = new Float32Array(SZ);
let curl = new Float32Array(SZ);

const params = {
    force: 6,        // intensité de la poussée souris
    brush: 3,        // rayon d'injection (cellules)
    visc: 0,         // viscosité (slider ×1e-5)
    vort: 2,         // confinement de vorticité (tourbillons)
    diss: 0.995,     // persistance de l'encre par frame
    rainbow: true,
};

let hue = 0;
const pointer = { down: false, x: 0, y: 0, px: 0, py: 0 };

// Rendu : offscreen N×N étiré à l'écran
const off = document.createElement('canvas');
off.width = N; off.height = N;
const offCtx = off.getContext('2d');
const img = offCtx.createImageData(N, N);

// --- SOLVEUR ---

function set_bnd(b, x) {
    for (let i = 1; i <= N; i++) {
        x[IX(0, i)]     = b === 1 ? -x[IX(1, i)] : x[IX(1, i)];
        x[IX(N + 1, i)] = b === 1 ? -x[IX(N, i)] : x[IX(N, i)];
        x[IX(i, 0)]     = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
        x[IX(i, N + 1)] = b === 2 ? -x[IX(i, N)] : x[IX(i, N)];
    }
    x[IX(0, 0)]         = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
    x[IX(0, N + 1)]     = 0.5 * (x[IX(1, N + 1)] + x[IX(0, N)]);
    x[IX(N + 1, 0)]     = 0.5 * (x[IX(N, 0)] + x[IX(N + 1, 1)]);
    x[IX(N + 1, N + 1)] = 0.5 * (x[IX(N, N + 1)] + x[IX(N + 1, N)]);
}

function lin_solve(b, x, x0, a, c) {
    const invC = 1 / c;
    for (let iter = 0; iter < 4; iter++) {
        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                x[IX(i, j)] = (x0[IX(i, j)] + a * (x[IX(i - 1, j)] + x[IX(i + 1, j)] + x[IX(i, j - 1)] + x[IX(i, j + 1)])) * invC;
            }
        }
        set_bnd(b, x);
    }
}

function diffuse(b, x, x0, diff) {
    const a = DT * diff * N * N;
    lin_solve(b, x, x0, a, 1 + 4 * a);
}

function advect(b, d, d0, uu, vv) {
    const dt0 = DT * N;
    for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
            let x = i - dt0 * uu[IX(i, j)];
            let y = j - dt0 * vv[IX(i, j)];
            if (x < 0.5) x = 0.5; if (x > N + 0.5) x = N + 0.5;
            if (y < 0.5) y = 0.5; if (y > N + 0.5) y = N + 0.5;
            const i0 = x | 0, i1 = i0 + 1;
            const j0 = y | 0, j1 = j0 + 1;
            const s1 = x - i0, s0 = 1 - s1;
            const t1 = y - j0, t0 = 1 - t1;
            d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)])
                        + s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
        }
    }
    set_bnd(b, d);
}

function project(uu, vv, p, div) {
    const h = 1.0 / N;
    for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
            div[IX(i, j)] = -0.5 * h * (uu[IX(i + 1, j)] - uu[IX(i - 1, j)] + vv[IX(i, j + 1)] - vv[IX(i, j - 1)]);
            p[IX(i, j)] = 0;
        }
    }
    set_bnd(0, div); set_bnd(0, p);
    lin_solve(0, p, div, 1, 4);
    for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
            uu[IX(i, j)] -= 0.5 * (p[IX(i + 1, j)] - p[IX(i - 1, j)]) / h;
            vv[IX(i, j)] -= 0.5 * (p[IX(i, j + 1)] - p[IX(i, j - 1)]) / h;
        }
    }
    set_bnd(1, uu); set_bnd(2, vv);
}

// Confinement de vorticité : ré-injecte les petits tourbillons lissés par la grille
function vorticityConfinement() {
    if (params.vort <= 0) return;
    for (let j = 1; j <= N; j++) {
        for (let i = 1; i <= N; i++) {
            curl[IX(i, j)] = 0.5 * ((v[IX(i + 1, j)] - v[IX(i - 1, j)]) - (u[IX(i, j + 1)] - u[IX(i, j - 1)]));
        }
    }
    for (let j = 2; j < N; j++) {
        for (let i = 2; i < N; i++) {
            const gx = 0.5 * (Math.abs(curl[IX(i + 1, j)]) - Math.abs(curl[IX(i - 1, j)]));
            const gy = 0.5 * (Math.abs(curl[IX(i, j + 1)]) - Math.abs(curl[IX(i, j - 1)]));
            const len = Math.sqrt(gx * gx + gy * gy) + 1e-5;
            const w = curl[IX(i, j)];
            u[IX(i, j)] += DT * params.vort * (gy / len) * w;
            v[IX(i, j)] -= DT * params.vort * (gx / len) * w;
        }
    }
}

function step() {
    const visc = params.visc * 1e-5;

    // Vitesses
    vorticityConfinement();
    diffuse(1, u0, u, visc);
    diffuse(2, v0, v, visc);
    project(u0, v0, u, v);
    advect(1, u, u0, u0, v0);
    advect(2, v, v0, u0, v0);
    project(u, v, u0, v0);

    // Légère perte d'énergie pour éviter l'emballement
    for (let k = 0; k < SZ; k++) { u[k] *= 0.999; v[k] *= 0.999; }

    // Encre (advection + dissipation, pas de diffusion : moins cher et plus net)
    tmp.set(dr); advect(0, dr, tmp, u, v);
    tmp.set(dg); advect(0, dg, tmp, u, v);
    tmp.set(db); advect(0, db, tmp, u, v);
    for (let k = 0; k < SZ; k++) {
        dr[k] *= params.diss; dg[k] *= params.diss; db[k] *= params.diss;
    }
}

// --- INJECTION SOURIS ---

function hsl2rgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function inject(mx, my, dx, dy) {
    const gx = Math.max(1, Math.min(N, Math.round(mx / width * N)));
    const gy = Math.max(1, Math.min(N, Math.round(my / height * N)));

    const du = Math.max(-4, Math.min(4, dx * params.force * 0.015));
    const dv = Math.max(-4, Math.min(4, dy * params.force * 0.015));
    const [cr, cg, cb] = hsl2rgb(hue, 0.95, 0.6);

    const r = params.brush;
    for (let oj = -r; oj <= r; oj++) {
        for (let oi = -r; oi <= r; oi++) {
            const d2 = oi * oi + oj * oj;
            if (d2 > r * r) continue;
            const i = gx + oi, j = gy + oj;
            if (i < 1 || i > N || j < 1 || j > N) continue;
            const fall = 1 - Math.sqrt(d2) / (r + 1);
            const k = IX(i, j);
            u[k] += du * fall;
            v[k] += dv * fall;
            dr[k] = Math.min(255, dr[k] + cr * 0.35 * fall);
            dg[k] = Math.min(255, dg[k] + cg * 0.35 * fall);
            db[k] = Math.min(255, db[k] + cb * 0.35 * fall);
        }
    }
}

// --- PANNEAU ---

function bindPanel() {
    const bindRange = (id, valId, fn) => {
        const el = document.getElementById(id);
        el.addEventListener('input', e => {
            document.getElementById(valId).textContent = e.target.value;
            fn(+e.target.value);
        });
    };
    bindRange('fl_force', 'fl_val_force', v => params.force = v);
    bindRange('fl_brush', 'fl_val_brush', v => params.brush = v);
    bindRange('fl_visc', 'fl_val_visc', v => params.visc = v);
    bindRange('fl_vort', 'fl_val_vort', v => params.vort = v);
    bindRange('fl_diss', 'fl_val_diss', v => params.diss = v / 100);
    document.getElementById('fl_rainbow').addEventListener('change', e => params.rainbow = e.target.checked);
}

// =====================================================

Engine.register({
    id: 'fluid',
    name: 'Fluide',
    icon: '💨',
    hint: 'glissez pour pousser le fluide',
    help: [
        ['Glisser', 'Injecter de l\'encre et pousser le fluide'],
    ],
    init() {
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#000';
    },
    resize(w, h) {
        width = w; height = h;
    },
    update() {
        if (params.rainbow) hue = (hue + 0.8) % 360;
        if (Engine.paused) return;
        if (pointer.down) inject(pointer.x, pointer.y, pointer.x - pointer.px, pointer.y - pointer.py);
        pointer.px = pointer.x; pointer.py = pointer.y;
        step();
    },
    draw() {
        const data = img.data;
        for (let j = 1; j <= N; j++) {
            for (let i = 1; i <= N; i++) {
                const k = IX(i, j);
                const p = ((j - 1) * N + (i - 1)) * 4;
                data[p]     = dr[k] > 255 ? 255 : dr[k];
                data[p + 1] = dg[k] > 255 ? 255 : dg[k];
                data[p + 2] = db[k] > 255 ? 255 : db[k];
                data[p + 3] = 255;
            }
        }
        offCtx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(off, 0, 0, width, height);
    },
    reset() {
        u.fill(0); v.fill(0); u0.fill(0); v0.fill(0);
        dr.fill(0); dg.fill(0); db.fill(0);
    },
    clear() {
        dr.fill(0); dg.fill(0); db.fill(0);
    },
    pointerDown(x, y) {
        pointer.down = true;
        pointer.x = pointer.px = x;
        pointer.y = pointer.py = y;
        inject(x, y, 0, 0);
    },
    pointerMove(x, y) {
        pointer.x = x; pointer.y = y;
        if (!pointer.down) { pointer.px = x; pointer.py = y; }
    },
    pointerUp() {
        pointer.down = false;
    },
});
})();
