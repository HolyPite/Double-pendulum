const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const resetBtn = document.getElementById('resetTrail');
const pauseBtn = document.getElementById('pauseBtn');

let width, height, cx, cy;

// Paramètres physiques
let r1 = 150; // Longueur bras 1
let r2 = 150; // Longueur bras 2
let m1 = 15;  // Masse 1
let m2 = 15;  // Masse 2
let a1 = Math.PI / 2; // Angle 1
let a2 = Math.PI / 2; // Angle 2
let a1_v = 0; // Vitesse angulaire 1
let a2_v = 0; // Vitesse angulaire 2
let g = 0.8;  // Gravité

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
    if (isPaused) {
        // Optionnel : on peut mettre les vitesses à zéro 
        // ou les garder pour quand on reprend.
        // Ici on les garde pour un effet plus naturel.
    }
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

    if (dist2 < 25) {
        dragging = 2;
    } else if (dist1 < 25) {
        dragging = 1;
    }
});

window.addEventListener('mouseup', () => {
    if (dragging) {
        a1_v = 0;
        a2_v = 0;
        dragging = null;
    }
});

window.addEventListener('mousemove', (e) => {
    if (!dragging) return;

    if (dragging === 1) {
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        a1 = Math.atan2(dx, dy);
    } else if (dragging === 2) {
        const { x1, y1 } = getPositions();
        const dx = e.clientX - x1;
        const dy = e.clientY - y1;
        a2 = Math.atan2(dx, dy);
    }
    trail = []; // Effacer la trace pendant qu'on bouge
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

        // Friction légère
        a1_v *= 0.999;
        a2_v *= 0.999;
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
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

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
    ctx.fillStyle = '#e74c3c';
    ctx.arc(x1, y1, m1, 0, Math.PI * 2);
    ctx.fill();

    // Masse 2
    ctx.beginPath();
    ctx.fillStyle = '#f1c40f';
    ctx.arc(x2, y2, m2, 0, Math.PI * 2);
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
