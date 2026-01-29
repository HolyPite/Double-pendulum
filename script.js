const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const resetBtn = document.getElementById('resetTrail');
const pauseBtn = document.getElementById('pauseBtn');

// Modal Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');

let width, height, cx, cy;

// Paramètres physiques initiaux
let r1 = 150; 
let r2 = 150; 
let m1 = 15;  
let m2 = 15;  
let a1 = Math.PI / 2; 
let a2 = Math.PI / 2; 
let a1_v = 0; 
let a2_v = 0; 
let g = 0.8;  
let f_drag = 0.999; // Facteur de friction (1 = aucune friction)

// Couleurs
let c_m1 = '#e74c3c';
let c_m2 = '#f1c40f';
let c_tr = '#3498db';

// Inputs Management
const inputs = {
    r1: { el: document.getElementById('inp_r1'), val: document.getElementById('val_r1'), set: v => r1 = +v },
    r2: { el: document.getElementById('inp_r2'), val: document.getElementById('val_r2'), set: v => r2 = +v },
    m1: { el: document.getElementById('inp_m1'), val: document.getElementById('val_m1'), set: v => m1 = +v },
    m2: { el: document.getElementById('inp_m2'), val: document.getElementById('val_m2'), set: v => m2 = +v },
    g:  { el: document.getElementById('inp_g'),  val: document.getElementById('val_g'),  set: v => g  = +v },
    f:  { el: document.getElementById('inp_f'),  val: document.getElementById('val_f'),  set: v => {
            // Conversion 0-100% resistance -> multiplicateur (ex: 10% res -> 0.999)
            // Plus simple: mapped to 0.9 (res max) -> 1.0 (res min)
            // Slider value 0 (no res) -> 1.0 multiplier
            // Slider value 100 (high res) -> 0.9 multiplier
            f_drag = 1 - (v / 1000); 
        }},
    c1: { el: document.getElementById('col_m1'), set: v => c_m1 = v },
    c2: { el: document.getElementById('col_m2'), set: v => c_m2 = v },
    ct: { el: document.getElementById('col_tr'), set: v => c_tr = v }
};

// Initialisation des listeners pour les inputs
Object.keys(inputs).forEach(k => {
    const item = inputs[k];
    item.el.addEventListener('input', (e) => {
        item.set(e.target.value);
        if(item.val) item.val.textContent = e.target.value;
    });
});

// Modal Logic
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// État de l'interaction
let dragging = null; // null, 1 ou 2
let isPaused = false;
let trail = [];
const maxTrail = 500;

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    cx = width / 2;
    cy = height / 3;
}

window.addEventListener('resize', resize);
resize();

resetBtn.addEventListener('click', () => {
    trail = [];
});

pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Reprendre' : 'Pause';
    pauseBtn.classList.toggle('paused', isPaused);
});

// Calcul des positions
function getPositions() {
    const x1 = cx + r1 * Math.sin(a1);
    const y1 = cy + r1 * Math.cos(a1);
    const x2 = x1 + r2 * Math.sin(a2);
    const y2 = y1 + r2 * Math.cos(a2);
    return { x1, y1, x2, y2 };
}

// Interaction souris
canvas.addEventListener('mousedown', (e) => {
    const { x1, y1, x2, y2 } = getPositions();
    const dist1 = Math.hypot(e.clientX - x1, e.clientY - y1);
    const dist2 = Math.hypot(e.clientX - x2, e.clientY - y2);

    // Ajuster la zone de clic en fonction de la masse (visuel)
    if (dist2 < m2 + 20) {
        dragging = 2;
    } else if (dist1 < m1 + 20) {
        dragging = 1;
    }
});

window.addEventListener('mouseup', () => {
    if (dragging) {
        // Reset vitesse si on vient de lâcher, ou on peut lancer...
        a1_v = 0;
        a2_v = 0;
        dragging = null;
    }
});

window.addEventListener('mousemove', (e) => {
    if (!dragging) return;

    const mx = e.clientX;
    const my = e.clientY;

    if (dragging === 1) {
        const dx = mx - cx;
        const dy = my - cy;
        a1 = Math.atan2(dx, dy);
    } else if (dragging === 2) {
        // Cinématique Inverse (Inverse Kinematics)
        let dx = mx - cx;
        let dy = my - cy;
        let d = Math.hypot(dx, dy);

        const maxLen = r1 + r2;
        if (d > maxLen) {
            const ratio = maxLen / d;
            dx *= ratio;
            dy *= ratio;
            d = maxLen;
        }

        const angleToTarget = Math.atan2(dx, dy);
        
        let cosAlpha = (r1 * r1 + d * d - r2 * r2) / (2 * r1 * d);
        if (cosAlpha > 1) cosAlpha = 1;
        if (cosAlpha < -1) cosAlpha = -1;
        
        const alpha = Math.acos(cosAlpha);

        a1 = angleToTarget - alpha;

        const newX1 = cx + r1 * Math.sin(a1);
        const newY1 = cy + r1 * Math.cos(a1);
        
        const dx2 = (cx + dx) - newX1;
        const dy2 = (cy + dy) - newY1;
        
        a2 = Math.atan2(dx2, dy2);
    }
    trail = []; 
});

function update() {
    if (!dragging && !isPaused) {
        // Équations du double pendule (Lagrangien)
        let num1 = -g * (2 * m1 + m2) * Math.sin(a1);
        let num2 = -m2 * g * Math.sin(a1 - 2 * a2);
        let num3 = -2 * Math.sin(a1 - a2) * m2;
        let num4 = a2_v * a2_v * r2 + a1_v * a1_v * r1 * Math.cos(a1 - a2);
        let den = r1 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2));
        let a1_a = (num1 + num2 + num3 * num4) / den;

        num1 = 2 * Math.sin(a1 - a2);
        num2 = (a1_v * a1_v * r1 * (m1 + m2));
        num3 = g * (m1 + m2) * Math.cos(a1);
        num4 = a2_v * a2_v * r2 * m2 * Math.cos(a1 - a2);
        den = r2 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2));
        let a2_a = (num1 * (num2 + num3 + num4)) / den;

        a1_v += a1_a;
        a2_v += a2_a;
        a1 += a1_v;
        a2 += a2_v;

        // Friction dynamique
        a1_v *= f_drag;
        a2_v *= f_drag;
    }

    if (!isPaused || dragging) {
        const { x2, y2 } = getPositions();
        trail.push({ x: x2, y: y2 });
        if (trail.length > maxTrail) trail.shift();
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);

    const { x1, y1, x2, y2 } = getPositions();

    // Dessin de la trace
    ctx.beginPath();
    ctx.strokeStyle = c_tr; // Couleur dynamique trace
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Bras 1
    ctx.beginPath();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // Bras 2
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Masse 1
    ctx.beginPath();
    ctx.fillStyle = c_m1; // Couleur dynamique masse 1
    ctx.arc(x1, y1, m1, 0, Math.PI * 2); // Rayon basé sur la masse
    ctx.fill();

    // Masse 2
    ctx.beginPath();
    ctx.fillStyle = c_m2; // Couleur dynamique masse 2
    ctx.arc(x2, y2, m2, 0, Math.PI * 2); // Rayon basé sur la masse
    ctx.fill();

    // Point d'attache
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
