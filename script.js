const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const resetBtn = document.getElementById('resetTrail');
const pauseBtn = document.getElementById('pauseBtn');

// Modal Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const dynamicSettingsDiv = document.getElementById('dynamic-settings');
const inpN = document.getElementById('inp_n');
const valN = document.getElementById('val_n');

let width, height, cx, cy;

// --- CONFIGURATION ---
let N = 2; // Nombre de bras
let g = 0.8;
let f_drag = 0.999;
let trail = [];
let maxTrail = 500; // Longueur de la trace (Infinity si infini)
let isPaused = false;
let dragging = -1; // Index du bras en cours de drag (-1 si aucun)
let simSpeed = 5; // Nombre d'étapes de calcul par image

// Structure de données pour chaque bras
// arms[i] contient : length (r), mass (m), angle (a), velocity (v), accel (acc), color (c)
let arms = [];
let c_tr = '#3498db'; // Couleur trace

// --- MATHS HELPERS ---

// Résolution de système linéaire Ax = B par élimination de Gauss
// A est une matrice NxN aplatie ou tableau 2D, B est un tableau de longueur N
function solveLinearSystem(A, B) {
    const n = B.length;
    // Copie pour ne pas modifier l'original
    const mat = A.map(row => [...row]);
    const res = [...B];

    for (let i = 0; i < n; i++) {
        // Pivot
        let maxEl = Math.abs(mat[i][i]);
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(mat[k][i]) > maxEl) {
                maxEl = Math.abs(mat[k][i]);
                maxRow = k;
            }
        }

        // Swap rows
        [mat[maxRow], mat[i]] = [mat[i], mat[maxRow]];
        [res[maxRow], res[i]] = [res[i], res[maxRow]];

        // Eliminate
        for (let k = i + 1; k < n; k++) {
            const c = -mat[k][i] / mat[i][i];
            for (let j = i; j < n; j++) {
                if (i === j) {
                    mat[k][j] = 0;
                } else {
                    mat[k][j] += c * mat[i][j];
                }
            }
            res[k] += c * res[i];
        }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
            sum += mat[i][j] * x[j];
        }
        x[i] = (res[i] - sum) / mat[i][i];
    }
    return x;
}

// --- INITIALISATION ---

function initArms(num) {
    N = num;
    arms = [];
    for (let i = 0; i < N; i++) {
        arms.push({
            r: 150 - (i * 10), // Un peu plus court à chaque fois
            m: 10,
            a: Math.PI / 2 + (i * 0.1), // Légère courbe
            v: 0,
            color: i === 0 ? '#e74c3c' : (i === N - 1 ? '#f1c40f' : '#ecf0f1') 
        });
    }
    trail = [];
    generateSettingsUI();
}

function generateSettingsUI() {
    dynamicSettingsDiv.innerHTML = '';

    // --- Physique Globale ---
    const physGroup = document.createElement('div');
    physGroup.className = 'setting-group';
    physGroup.innerHTML = `<h3>Physique Globale</h3>
        <label>Vitesse Simu: <span id="val_spd">${simSpeed}</span></label>
        <input type="range" id="inp_spd" min="1" max="20" step="1" value="${simSpeed}">
        
        <label>Gravité: <span id="val_g">${g}</span></label>
        <input type="range" id="inp_g" min="0" max="2" step="0.1" value="${g}">
        
        <label>Résistance: <span id="val_f">${Math.round((1 - f_drag)*1000)}</span>%</label>
        <input type="range" id="inp_f" min="0" max="100" step="1" value="${(1 - f_drag)*1000}">
        
        <label>Longueur Trace: <span id="val_trlen">${maxTrail === Infinity ? '∞' : maxTrail}</span></label>
        <input type="range" id="inp_trlen" min="0" max="1000" step="10" value="${maxTrail === Infinity ? 1000 : maxTrail}">

        <label>Couleur Trace</label>
        <input type="color" id="inp_ctr" value="${c_tr}">
    `;
    dynamicSettingsDiv.appendChild(physGroup);

    // Listeners Globaux
    physGroup.querySelector('#inp_spd').addEventListener('input', e => { simSpeed = +e.target.value; physGroup.querySelector('#val_spd').textContent = simSpeed; });
    physGroup.querySelector('#inp_g').addEventListener('input', e => { g = +e.target.value; physGroup.querySelector('#val_g').textContent = g; });
    physGroup.querySelector('#inp_f').addEventListener('input', e => { 
        f_drag = 1 - (e.target.value / 1000); 
        physGroup.querySelector('#val_f').textContent = e.target.value; 
    });
    
    // Listener Longueur Trace
    physGroup.querySelector('#inp_trlen').addEventListener('input', e => { 
        const v = +e.target.value;
        const display = physGroup.querySelector('#val_trlen');
        
        if (v >= 1000) {
            maxTrail = Infinity;
            display.textContent = '∞';
        } else {
            maxTrail = v;
            display.textContent = v;
            // Coupe instantanée si on réduit la taille
            if (trail.length > maxTrail) {
                trail.splice(0, trail.length - maxTrail);
            }
        }
    });

    physGroup.querySelector('#inp_ctr').addEventListener('input', e => { c_tr = e.target.value; });

    // --- Paramètres par Bras ---
    // Pour ne pas surcharger, on met juste Masse et Longueur par bras
    const armGroup = document.createElement('div');
    armGroup.className = 'setting-group';
    armGroup.innerHTML = `<h3>Détails des Bras</h3>`;
    
    arms.forEach((arm, i) => {
        const div = document.createElement('div');
        div.style.marginBottom = '15px';
        div.style.borderBottom = '1px dashed #444';
        div.style.paddingBottom = '10px';
        div.innerHTML = `
            <div style="font-weight:bold; color:#3498db; margin-bottom:5px;">Bras ${i + 1}</div>
            <label>Longueur: <span id="val_r${i}">${arm.r}</span></label>
            <input type="range" id="inp_r${i}" min="20" max="300" value="${arm.r}">
            <label>Masse: <span id="val_m${i}">${arm.m}</span></label>
            <input type="range" id="inp_m${i}" min="1" max="100" value="${arm.m}">
            <label>Couleur</label>
            <input type="color" id="inp_c${i}" value="${arm.color}">
        `;
        armGroup.appendChild(div);

        // Listeners différés (après insertion)
        setTimeout(() => {
            document.getElementById(`inp_r${i}`).addEventListener('input', e => { arm.r = +e.target.value; document.getElementById(`val_r${i}`).textContent = arm.r; });
            document.getElementById(`inp_m${i}`).addEventListener('input', e => { arm.m = +e.target.value; document.getElementById(`val_m${i}`).textContent = arm.m; });
            document.getElementById(`inp_c${i}`).addEventListener('input', e => { arm.color = e.target.value; });
        }, 0);
    });
    dynamicSettingsDiv.appendChild(armGroup);
}

// Event Listener pour changer N
inpN.addEventListener('input', (e) => {
    const val = +e.target.value;
    valN.textContent = val;
    initArms(val);
});

// --- ENGINE ---

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

resetBtn.addEventListener('click', () => trail = []);
pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? 'Reprendre' : 'Pause';
    pauseBtn.classList.toggle('paused', isPaused);
});

// Modal Logic
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); });

function getPositions() {
    let x = cx;
    let y = cy;
    const positions = [];
    for (let i = 0; i < N; i++) {
        x += arms[i].r * Math.sin(arms[i].a);
        y += arms[i].r * Math.cos(arms[i].a);
        positions.push({ x, y });
    }
    return positions;
}

// --- INTERACTION ---
canvas.addEventListener('mousedown', (e) => {
    const positions = getPositions();
    const mx = e.clientX;
    const my = e.clientY;

    // Check collision inverse (du bout vers la base pour prioriser le bout)
    for (let i = N - 1; i >= 0; i--) {
        const dist = Math.hypot(mx - positions[i].x, my - positions[i].y);
        // Rayon de clic approx
        const radius = Math.sqrt(arms[i].m) * 3 + 10; 
        if (dist < radius) {
            dragging = i;
            return;
        }
    }
});

window.addEventListener('mouseup', () => {
    if (dragging !== -1) {
        // Reset velocities
        for(let a of arms) a.v = 0;
        dragging = -1;
    }
});

window.addEventListener('mousemove', (e) => {
    if (dragging === -1) return;

    const mx = e.clientX;
    const my = e.clientY;

    // Logique simplifiée de drag: "Inverse Kinematics" simple (FABRIK light)
    // Pour l'instant, on fait simple : on pointe le bras sélectionné vers la souris
    // Et on résout géométriquement vers l'arrière
    
    if (dragging === N - 1) {
        // Drag du bout (IK) - version simplifiée géométrique ("Pulling the rope")
        // On modifie les angles pour atteindre la cible si possible
        // Note: Une vraie IK pour N-pendules est complexe.
        // Hack visuel simple : On oriente le dernier bras vers la souris, 
        // puis on remonte.
        
        // Approche simple : On bouge juste l'angle du bras précédent pour aligner
        // Pour N > 2 c'est dur.
        // Fallback: Si on drag le bout, on fait une FABRIK très basique sur 1 itération
        
        let targetX = mx;
        let targetY = my;
        
        // On parcourt de la fin vers le début (sauf la base fixe)
        // C'est dur de mapper ça directement aux angles sans casser la physique future.
        // Solution robuste : "Geometric Pull"
        // On calcule la pos du parent du noeud draggué
        let prevX = cx, prevY = cy;
        if (dragging > 0) {
            const pos = getPositions();
            prevX = pos[dragging-1].x;
            prevY = pos[dragging-1].y;
        }
        
        const dx = mx - prevX;
        const dy = my - prevY;
        arms[dragging].a = Math.atan2(dx, dy);
    } else {
        // Drag d'un noeud intermédiaire
        // On calcule l'angle par rapport au noeud précédent
        let prevX = cx, prevY = cy;
        if (dragging > 0) {
            const pos = getPositions();
            prevX = pos[dragging-1].x;
            prevY = pos[dragging-1].y;
        }
        const dx = mx - prevX;
        const dy = my - prevY;
        arms[dragging].a = Math.atan2(dx, dy);
    }
    
    trail = [];
});

// --- UPDATE LOOP ---

// --- INTEGRATION RK4 ---

// Calcule les dérivées (vitesses et accélérations) pour un état donné
function computeDerivatives(currentState) {
    // currentState est un tableau d'objets {a, v}
    // On doit reconstruire M et F basé sur ces angles et vitesses temporaires
    
    const n = currentState.length;
    const M = Array(n).fill(0).map(() => Array(n).fill(0));
    const F = Array(n).fill(0);

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            let massSum = 0;
            for (let k = Math.max(i, j); k < n; k++) massSum += arms[k].m;
            M[i][j] = massSum * arms[i].r * arms[j].r * Math.cos(currentState[i].a - currentState[j].a);
        }

        let gravityTerm = 0;
        let massSumG = 0;
        for (let k = i; k < n; k++) massSumG += arms[k].m;
        gravityTerm = -massSumG * g * arms[i].r * Math.sin(currentState[i].a);

        let coriolisTerm = 0;
        for (let j = 0; j < n; j++) {
            let massSumC = 0;
            for (let k = Math.max(i, j); k < n; k++) massSumC += arms[k].m;
            coriolisTerm -= massSumC * arms[i].r * arms[j].r * (currentState[j].v * currentState[j].v) * Math.sin(currentState[i].a - currentState[j].a);
        }
        F[i] = gravityTerm + coriolisTerm;
    }

    const accel = solveLinearSystem(M, F);
    
    // Retourne { da (vitesse), dv (accélération) }
    return currentState.map((state, i) => ({
        da: state.v,
        dv: accel[i]
    }));
}

function update() {
    if (dragging === -1 && !isPaused) {
        // Runge-Kutta 4 avec sub-stepping pour la stabilité et la vitesse
        // On divise le pas de temps pour avoir une simulation fluide
        const dt = 0.2; // Petit pas de temps pour la stabilité physique

        for (let step = 0; step < simSpeed; step++) {
            // État actuel
            const state0 = arms.map(a => ({ a: a.a, v: a.v }));

            // k1
            const k1 = computeDerivatives(state0);

            // k2
            const state1 = state0.map((s, i) => ({
                a: s.a + k1[i].da * dt * 0.5,
                v: s.v + k1[i].dv * dt * 0.5
            }));
            const k2 = computeDerivatives(state1);

            // k3
            const state2 = state0.map((s, i) => ({
                a: s.a + k2[i].da * dt * 0.5,
                v: s.v + k2[i].dv * dt * 0.5
            }));
            const k3 = computeDerivatives(state2);

            // k4
            const state3 = state0.map((s, i) => ({
                a: s.a + k3[i].da * dt,
                v: s.v + k3[i].dv * dt
            }));
            const k4 = computeDerivatives(state3);

            // Mise à jour finale
            for (let i = 0; i < N; i++) {
                const da = (k1[i].da + 2 * k2[i].da + 2 * k3[i].da + k4[i].da) / 6;
                const dv = (k1[i].dv + 2 * k2[i].dv + 2 * k3[i].dv + k4[i].dv) / 6;

                arms[i].a += da * dt;
                arms[i].v += dv * dt;
                
                // Friction appliquée à chaque sous-étape
                // Si f_drag est proche de 1 (ex: 0.999), l'appliquer N fois revient à f_drag^N
                // C'est correct physiquement.
                arms[i].v *= f_drag; 
            }
        }
    }

    if (!isPaused || dragging !== -1) {
        const pos = getPositions();
        trail.push({ x: pos[N-1].x, y: pos[N-1].y });
        if (trail.length > maxTrail) trail.shift();
    }
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    const positions = getPositions();

    // Trace
    if (trail.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = c_tr;
        ctx.lineWidth = 2;
        // Dégradé d'opacité optionnel ? Non, simple pour l'instant
        ctx.globalAlpha = 0.6;
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
            ctx.lineTo(trail[i].x, trail[i].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }

    // Pendules
    let prevX = cx;
    let prevY = cy;

    for (let i = 0; i < N; i++) {
        const p = positions[i];
        
        // Tige
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Masse
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.sqrt(arms[i].m) * 2, 0, Math.PI * 2); // Taille selon masse
        ctx.fillStyle = arms[i].color;
        ctx.fill();

        prevX = p.x;
        prevY = p.y;
    }
    
    // Pivot central
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Start
initArms(2); // Démarrage avec 2 bras par défaut
loop();