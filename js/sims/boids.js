// =====================================================
// SIMULATION : Boids (nuées — Craig Reynolds)
// 3 règles locales : cohésion, alignement, séparation.
// =====================================================
(() => {
const ctx = Engine.ctx;

let width = 0, height = 0;

const params = {
    count: 150,
    vision: 60,      // rayon de perception
    sepDist: 24,     // distance de séparation
    maxSpeed: 3.5,
    coh: 0.5,        // poids cohésion
    ali: 0.6,        // poids alignement
    sep: 1.4,        // poids séparation
    mouse: 'attract', // 'attract' | 'repel' | 'none'
    trails: true,
};

let boids = [];
const mouse = { x: 0, y: 0, down: false };
let needsClear = true; // premier draw après activation → fond opaque

function makeBoid() {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 2;
    return {
        x: Math.random() * (width || 800),
        y: Math.random() * (height || 600),
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
    };
}

function setCount(n) {
    params.count = n;
    while (boids.length < n) boids.push(makeBoid());
    if (boids.length > n) boids.length = n;
}

function update() {
    if (Engine.paused) return;

    const vis2 = params.vision * params.vision;
    const sep2 = params.sepDist * params.sepDist;

    for (const b of boids) {
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;

        for (const o of boids) {
            if (o === b) continue;
            const dx = o.x - b.x, dy = o.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > vis2) continue;
            n++;
            cx += o.x; cy += o.y;
            ax += o.vx; ay += o.vy;
            if (d2 < sep2 && d2 > 0.01) {
                const d = Math.sqrt(d2);
                const push = (1 - d / params.sepDist);
                sx -= (dx / d) * push;
                sy -= (dy / d) * push;
            }
        }

        let fx = 0, fy = 0;
        if (n > 0) {
            fx += (cx / n - b.x) * 0.005 * params.coh;
            fy += (cy / n - b.y) * 0.005 * params.coh;
            fx += (ax / n - b.vx) * 0.05 * params.ali;
            fy += (ay / n - b.vy) * 0.05 * params.ali;
        }
        fx += sx * 0.15 * params.sep;
        fy += sy * 0.15 * params.sep;

        // Force de la souris (maintenir le clic)
        if (mouse.down && params.mouse !== 'none') {
            const dx = mouse.x - b.x, dy = mouse.y - b.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && d < 280) {
                const s = (params.mouse === 'attract' ? 1 : -1) * 0.35 * (1 - d / 280);
                fx += (dx / d) * s;
                fy += (dy / d) * s;
            }
        }

        b.vx += fx;
        b.vy += fy;

        // Bornes de vitesse (min pour ne jamais s'arrêter)
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > params.maxSpeed) {
            b.vx = b.vx / sp * params.maxSpeed;
            b.vy = b.vy / sp * params.maxSpeed;
        } else if (sp > 0.01 && sp < 1.2) {
            b.vx = b.vx / sp * 1.2;
            b.vy = b.vy / sp * 1.2;
        }

        // Monde torique
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < 0) b.x += width;
        if (b.x >= width) b.x -= width;
        if (b.y < 0) b.y += height;
        if (b.y >= height) b.y -= height;
    }
}

function draw() {
    if (needsClear || !params.trails) {
        ctx.fillStyle = '#080a10';
        ctx.fillRect(0, 0, width, height);
        needsClear = false;
    } else {
        ctx.fillStyle = 'rgba(8, 10, 16, 0.14)';
        ctx.fillRect(0, 0, width, height);
    }

    for (const b of boids) {
        const angle = Math.atan2(b.vy, b.vx);
        const hue = ((angle * 180 / Math.PI) + 360) % 360;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const s = 5;

        ctx.beginPath();
        ctx.moveTo(b.x + ca * s * 1.6, b.y + sa * s * 1.6);                 // nez
        ctx.lineTo(b.x - ca * s + sa * s * 0.7, b.y - sa * s - ca * s * 0.7); // aile gauche
        ctx.lineTo(b.x - ca * s - sa * s * 0.7, b.y - sa * s + ca * s * 0.7); // aile droite
        ctx.closePath();
        ctx.fillStyle = `hsl(${hue}, 75%, 62%)`;
        ctx.fill();
    }

    // Halo autour de la souris pendant l'action
    if (mouse.down && params.mouse !== 'none') {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 24, 0, Math.PI * 2);
        ctx.strokeStyle = params.mouse === 'attract' ? 'rgba(100,220,140,0.5)' : 'rgba(240,90,90,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function bindPanel() {
    const bindRange = (id, valId, fn) => {
        document.getElementById(id).addEventListener('input', e => {
            document.getElementById(valId).textContent = e.target.value;
            fn(+e.target.value);
        });
    };
    bindRange('bd_count', 'bd_val_count', v => setCount(v));
    bindRange('bd_vision', 'bd_val_vision', v => params.vision = v);
    bindRange('bd_coh', 'bd_val_coh', v => params.coh = v);
    bindRange('bd_ali', 'bd_val_ali', v => params.ali = v);
    bindRange('bd_sep', 'bd_val_sep', v => params.sep = v);
    bindRange('bd_speed', 'bd_val_speed', v => params.maxSpeed = v);
    document.getElementById('bd_mouse').addEventListener('change', e => params.mouse = e.target.value);
    document.getElementById('bd_trails').addEventListener('change', e => {
        params.trails = e.target.checked;
        needsClear = true;
    });
}

// =====================================================

Engine.register({
    id: 'boids',
    name: 'Boids',
    icon: '🐦',
    hint: 'maintenez le clic pour attirer',
    help: [
        ['Maintenir clic', 'Attirer / repousser la nuée'],
    ],
    init() {
        bindPanel();
    },
    activate() {
        document.body.style.backgroundColor = '#080a10';
        needsClear = true;
    },
    resize(w, h) {
        width = w; height = h;
        if (boids.length === 0) setCount(params.count);
        needsClear = true;
    },
    update,
    draw,
    reset() {
        boids = [];
        setCount(params.count);
        needsClear = true;
    },
    pointerDown(x, y) { mouse.down = true; mouse.x = x; mouse.y = y; },
    pointerMove(x, y) { mouse.x = x; mouse.y = y; },
    pointerUp() { mouse.down = false; },
});
})();
