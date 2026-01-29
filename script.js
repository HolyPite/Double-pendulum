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
// Structure globale
const settings = {
    nArms: 2,
    g: 0.8,
    resistance: 0.1, // % (0-100) -> sera converti en f_drag
    simSpeed: 5,
    trailLength: 500, // Infinity possible
    trailMode: 'speed', // 'solid', 'speed', 'rainbow', 'time'
    butterfly: false,
    butterflyCount: 50,
    baseColor: '#3498db'
};

// Variables dérivées / Runtime
let f_drag = 0.999;
let isPaused = false;
let dragging = -1; 
let timeStep = 0; // Pour le mode arc-en-ciel temporel

// STATE
// pendulums[0] est le PRINCIPAL.
// pendulums[1...N] sont les CLONES (Butterfly).
// Chaque élément est un tableau d'objets "Arm" {r, m, a, v, color...}
let pendulums = [];

// Trace du pendule principal seulement (pour perf)
// Array of {x, y, v (vitesse), t (temps)}
let trail = [];

// --- PRESETS (SCÉNARIOS) ---
const scenarios = {
    "default": { nArms: 2, g: 0.8, resistance: 0.1, m: 15, r: 150, desc: "Défaut" },
    "chaos": { nArms: 2, g: 1.5, resistance: 0, m: 15, r: 150, desc: "Chaos Pur (Sans friction)" },
    "triple": { nArms: 3, g: 0.8, resistance: 0.1, m: 15, r: 120, desc: "Triple Pendule" },
    "snake": { nArms: 5, g: 0.6, resistance: 0.5, m: 5, r: 60, desc: "Le Serpent (5 bras)" },
    "whip": { nArms: 4, g: 0.9, resistance: 0.2, m: [40, 30, 10, 2], r: [100, 100, 100, 100], desc: "Le Fouet (Masses décroissantes)" },
    "micro": { nArms: 2, g: 0.1, resistance: 0.0, m: 15, r: 80, desc: "Micro Gravité" }
};

// --- MATHS HELPERS (SOLVER) ---
function solveLinearSystem(A, B) {
    const n = B.length;
    const mat = A.map(row => [...row]);
    const res = [...B];
    for (let i = 0; i < n; i++) {
        let maxEl = Math.abs(mat[i][i]), maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(mat[k][i]) > maxEl) { maxEl = Math.abs(mat[k][i]); maxRow = k; }
        }
        [mat[maxRow], mat[i]] = [mat[i], mat[maxRow]];
        [res[maxRow], res[i]] = [res[i], res[maxRow]];
        for (let k = i + 1; k < n; k++) {
            const c = -mat[k][i] / mat[i][i];
            for (let j = i; j < n; j++) {
                if (i === j) mat[k][j] = 0;
                else mat[k][j] += c * mat[i][j];
            }
            res[k] += c * res[i];
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) sum += mat[i][j] * x[j];
        x[i] = (res[i] - sum) / mat[i][i];
    }
    return x;
}

// --- INITIALISATION ---

function initSimulation(customParams = null) {
    pendulums = [];
    trail = [];
    
    // Si des params personnalisés (masses tableaux, etc.)
    // On construit le pendule "Master"
    let masterArms = [];
    for (let i = 0; i < settings.nArms; i++) {
        // Gestion des cas où m ou r sont des tableaux (scénario Whip)
        let mVal = 15, rVal = 150;
        if (customParams) {
            if (Array.isArray(customParams.m)) mVal = customParams.m[i] || 10;
            else if (customParams.m) mVal = customParams.m;

            if (Array.isArray(customParams.r)) rVal = customParams.r[i] || 100;
            else if (customParams.r) rVal = customParams.r;
        } else {
            // Valeurs par défaut basées sur la longueur et i
             rVal = 150 - (i * 10);
        }

        masterArms.push({
            r: rVal,
            m: mVal,
            a: Math.PI / 2 + (i * 0.1), // Angle initial
            v: 0,
            color: i === 0 ? '#e74c3c' : (i === settings.nArms - 1 ? '#f1c40f' : '#ecf0f1')
        });
    }
    pendulums.push(masterArms);

    // Initialisation Butterfly (Clones)
    if (settings.butterfly) {
        initButterflyClones();
    }

    // Refresh UI si nécessaire (valeurs masses/longueurs peuvent avoir changé)
    generateSettingsUI();
}

function initButterflyClones() {
    // Supprime les anciens clones, garde le maitre (index 0)
    pendulums = [pendulums[0]];
    
    if (!settings.butterfly) return;

    const master = pendulums[0];
    for (let k = 0; k < settings.butterflyCount; k++) {
        // Clone profond
        let clone = master.map(arm => ({...arm})); // Copie propriétés
        
        // Perturbation infime
        // On perturbe seulement le premier angle ou tous ? Tous c'est plus drôle.
        clone.forEach(arm => {
            arm.a += (Math.random() - 0.5) * 0.001; 
        });

        pendulums.push(clone);
    }
}

// --- UI GENERATION ---

function generateSettingsUI() {
    dynamicSettingsDiv.innerHTML = '';

    // 1. SCENARIOS DROPDOWN
    const scenDiv = document.createElement('div');
    scenDiv.className = 'setting-group';
    scenDiv.style.borderBottom = "1px solid #444";
    scenDiv.innerHTML = `<h3>Scénarios</h3>`;
    const selScen = document.createElement('select');
    selScen.style.width = "100%";
    selScen.style.padding = "5px";
    selScen.style.background = "#223";
    selScen.style.color = "white";
    selScen.style.border = "none";
    
    Object.keys(scenarios).forEach(k => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = scenarios[k].desc;
        selScen.appendChild(opt);
    });
    
    // Bouton charger
    const btnLoad = document.createElement('button');
    btnLoad.textContent = "Charger Scénario";
    btnLoad.style.marginTop = "10px";
    btnLoad.style.width = "100%";
    
    btnLoad.onclick = () => {
        const s = scenarios[selScen.value];
        settings.nArms = s.nArms;
        settings.g = s.g;
        settings.resistance = s.resistance * 100; // stored as 0-1 approx
        f_drag = 1 - (s.resistance / 1000); // Recalculer f_drag
        
        inpN.value = s.nArms; valN.textContent = s.nArms; // Update global input
        
        initSimulation(s); // Restart with specific params
    };

    scenDiv.appendChild(selScen);
    scenDiv.appendChild(btnLoad);
    dynamicSettingsDiv.appendChild(scenDiv);


    // 2. EFFETS VISUELS (Butterfly & Rainbow)
    const fxGroup = document.createElement('div');
    fxGroup.className = 'setting-group';
    fxGroup.innerHTML = `<h3>Effets Visuels</h3>`;
    
    // Butterfly
    const bfDiv = document.createElement('div');
    bfDiv.style.marginBottom = "10px";
    bfDiv.innerHTML = `
        <label style="display:inline-flex; align-items:center;">
            <input type="checkbox" id="chk_bf" ${settings.butterfly ? 'checked' : ''} style="width:auto; margin-right:10px;"> 
            Mode Effet Papillon 🦋
        </label>
        <div id="bf_options" style="display:${settings.butterfly ? 'block' : 'none'}; margin-left:20px; margin-top:5px;">
             <label>Nombre de clones: <span id="val_bf_count">${settings.butterflyCount}</span></label>
             <input type="range" id="inp_bf_count" min="10" max="200" step="10" value="${settings.butterflyCount}">
        </div>
    `;
    fxGroup.appendChild(bfDiv);

    // Trail Mode
    const trDiv = document.createElement('div');
    trDiv.innerHTML = `
        <label>Style de Trace:</label>
        <select id="sel_trail" style="width:100%; padding:5px; background:#223; color:white; border:none; margin-bottom:10px;">
            <option value="solid" ${settings.trailMode === 'solid' ? 'selected' : ''}>Solide (Bleu)</option>
            <option value="speed" ${settings.trailMode === 'speed' ? 'selected' : ''}>Vitesse (Bleu -> Rouge)</option>
            <option value="rainbow" ${settings.trailMode === 'rainbow' ? 'selected' : ''}>Arc-en-ciel (Temps)</option>
            <option value="rainbow-cycle" ${settings.trailMode === 'rainbow-cycle' ? 'selected' : ''}>Arc-en-ciel (Cyclique)</option>
        </select>
        <label>Longueur Trace: <span id="val_trlen">${settings.trailLength === Infinity ? '∞' : settings.trailLength}</span></label>
        <input type="range" id="inp_trlen" min="0" max="1000" step="10" value="${settings.trailLength === Infinity ? 1000 : settings.trailLength}">
    `;
    fxGroup.appendChild(trDiv);
    dynamicSettingsDiv.appendChild(fxGroup);

    // Listeners FX
    const chkBf = fxGroup.querySelector('#chk_bf');
    const bfOpt = fxGroup.querySelector('#bf_options');
    chkBf.addEventListener('change', e => {
        settings.butterfly = e.target.checked;
        bfOpt.style.display = settings.butterfly ? 'block' : 'none';
        initButterflyClones();
    });
    fxGroup.querySelector('#inp_bf_count').addEventListener('input', e => {
        settings.butterflyCount = +e.target.value;
        fxGroup.querySelector('#val_bf_count').textContent = settings.butterflyCount;
        if(settings.butterfly) initButterflyClones();
    });
    fxGroup.querySelector('#sel_trail').addEventListener('change', e => settings.trailMode = e.target.value);
    fxGroup.querySelector('#inp_trlen').addEventListener('input', e => { 
        const v = +e.target.value;
        if (v >= 1000) { settings.trailLength = Infinity; fxGroup.querySelector('#val_trlen').textContent = '∞'; }
        else { 
            settings.trailLength = v; 
            fxGroup.querySelector('#val_trlen').textContent = v; 
            if(trail.length > v) trail.splice(0, trail.length - v);
        }
    });


    // 3. PHYSIQUE
    const physGroup = document.createElement('div');
    physGroup.className = 'setting-group';
    physGroup.innerHTML = `<h3>Physique</h3>
        <label>Vitesse Simu: <span id="val_spd">${settings.simSpeed}</span></label>
        <input type="range" id="inp_spd" min="1" max="20" step="1" value="${settings.simSpeed}">
        <label>Gravité: <span id="val_g">${settings.g}</span></label>
        <input type="range" id="inp_g" min="0" max="2" step="0.1" value="${settings.g}">
        <label>Résistance: <span id="val_f">${settings.resistance}</span>%</label>
        <input type="range" id="inp_f" min="0" max="100" step="1" value="${settings.resistance}">
    `;
    dynamicSettingsDiv.appendChild(physGroup);

    // Listeners Physique
    physGroup.querySelector('#inp_spd').addEventListener('input', e => { settings.simSpeed = +e.target.value; physGroup.querySelector('#val_spd').textContent = settings.simSpeed; });
    physGroup.querySelector('#inp_g').addEventListener('input', e => { settings.g = +e.target.value; physGroup.querySelector('#val_g').textContent = settings.g; });
    physGroup.querySelector('#inp_f').addEventListener('input', e => { 
        settings.resistance = +e.target.value;
        f_drag = 1 - (settings.resistance / 1000); 
        physGroup.querySelector('#val_f').textContent = settings.resistance; 
    });


    // 4. BRAS (Masse/Longueur du Master)
    const armGroup = document.createElement('div');
    armGroup.className = 'setting-group';
    armGroup.innerHTML = `<h3>Détails Bras (Maître)</h3>`;
    
    // On prend le pendule 0 comme ref
    pendulums[0].forEach((arm, i) => {
        const div = document.createElement('div');
        div.style.marginBottom = '10px';
        div.style.borderBottom = '1px dashed #444';
        div.innerHTML = `
            <div style="font-weight:bold; color:#3498db; margin-bottom:5px;">Bras ${i + 1}</div>
            <label>L: <span id="val_r${i}">${Math.round(arm.r)}</span> | M: <span id="val_m${i}">${Math.round(arm.m)}</span></label>
            <input type="range" id="inp_r${i}" min="20" max="300" value="${arm.r}" style="width:45%; display:inline-block">
            <input type="range" id="inp_m${i}" min="1" max="100" value="${arm.m}" style="width:45%; display:inline-block">
        `;
        armGroup.appendChild(div);

        setTimeout(() => {
            const updateLabel = () => document.getElementById(`val_r${i}`).parentNode.innerHTML = `L: <span id="val_r${i}">${Math.round(arm.r)}</span> | M: <span id="val_m${i}">${Math.round(arm.m)}</span>`;
            
            document.getElementById(`inp_r${i}`).addEventListener('input', e => { 
                const val = +e.target.value; 
                arm.r = val; 
                // Appliquer à tous les clones pour garder la cohérence physique
                pendulums.forEach(p => p[i].r = val);
                updateLabel();
            });
            document.getElementById(`inp_m${i}`).addEventListener('input', e => { 
                const val = +e.target.value; 
                arm.m = val;
                pendulums.forEach(p => p[i].m = val);
                updateLabel(); 
            });
        }, 0);
    });
    dynamicSettingsDiv.appendChild(armGroup);
}

inpN.addEventListener('input', (e) => {
    settings.nArms = +e.target.value;
    valN.textContent = settings.nArms;
    initSimulation();
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

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.add('hidden'); });


// Calcul Positions (pour un pendule donné)
function getPendulumPositions(armsList) {
    let x = cx;
    let y = cy;
    const positions = [];
    for (let i = 0; i < armsList.length; i++) {
        x += armsList[i].r * Math.sin(armsList[i].a);
        y += armsList[i].r * Math.cos(armsList[i].a);
        positions.push({ x, y });
    }
    return positions;
}

// --- INTERACTION ---
// On interagit SEULEMENT avec le pendule 0
canvas.addEventListener('mousedown', (e) => {
    const positions = getPendulumPositions(pendulums[0]);
    const mx = e.clientX;
    const my = e.clientY;

    for (let i = settings.nArms - 1; i >= 0; i--) {
        const dist = Math.hypot(mx - positions[i].x, my - positions[i].y);
        const radius = Math.sqrt(pendulums[0][i].m) * 3 + 15; 
        if (dist < radius) {
            dragging = i;
            return;
        }
    }
});

window.addEventListener('mouseup', () => {
    if (dragging !== -1) {
        // Reset vitesse MASTER
        pendulums[0].forEach(a => a.v = 0);
        
        // Si Butterfly : Reset des clones sur le master + bruit
        if (settings.butterfly) {
            initButterflyClones(); 
            // On s'assure que les clones prennent la nouvelle position
            for(let k=1; k<pendulums.length; k++) {
                pendulums[k].forEach((arm, idx) => {
                    arm.a = pendulums[0][idx].a + (Math.random() - 0.5) * 0.001;
                    arm.v = 0;
                });
            }
        }
        dragging = -1;
    }
});

window.addEventListener('mousemove', (e) => {
    if (dragging === -1) return;
    const mx = e.clientX;
    const my = e.clientY;
    
    // Drag logique simple (Geometrique) sur le Master
    let prevX = cx, prevY = cy;
    if (dragging > 0) {
        const pos = getPendulumPositions(pendulums[0]);
        prevX = pos[dragging-1].x;
        prevY = pos[dragging-1].y;
    }
    const dx = mx - prevX;
    const dy = my - prevY;
    pendulums[0][dragging].a = Math.atan2(dx, dy);

    // Effacer trace
    trail = []; 
});


// --- PHYSICS CORE (RK4) ---

function computeDerivatives(armState, pendulumInstance) {
    // armState = [{a, v}, {a, v}...]
    const n = armState.length;
    const M = Array(n).fill(0).map(() => Array(n).fill(0));
    const F = Array(n).fill(0);

    // On utilise les masses et longueurs de l'instance (constantes)
    // Mais les angles de armState
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            let massSum = 0;
            for (let k = Math.max(i, j); k < n; k++) massSum += pendulumInstance[k].m;
            M[i][j] = massSum * pendulumInstance[i].r * pendulumInstance[j].r * Math.cos(armState[i].a - armState[j].a);
        }
        let gravityTerm = 0, massSumG = 0;
        for (let k = i; k < n; k++) massSumG += pendulumInstance[k].m;
        gravityTerm = -massSumG * settings.g * pendulumInstance[i].r * Math.sin(armState[i].a);

        let coriolisTerm = 0;
        for (let j = 0; j < n; j++) {
            let massSumC = 0;
            for (let k = Math.max(i, j); k < n; k++) massSumC += pendulumInstance[k].m;
            coriolisTerm -= massSumC * pendulumInstance[i].r * pendulumInstance[j].r * (armState[j].v * armState[j].v) * Math.sin(armState[i].a - armState[j].a);
        }
        F[i] = gravityTerm + coriolisTerm;
    }

    const accel = solveLinearSystem(M, F);
    return armState.map((_, i) => ({ da: armState[i].v, dv: accel[i] }));
}

function updatePendulumRK4(pIndex) {
    const arms = pendulums[pIndex];
    const n = arms.length;
    const dt = 0.2; 

    for (let step = 0; step < settings.simSpeed; step++) {
        const state0 = arms.map(a => ({ a: a.a, v: a.v }));
        
        const k1 = computeDerivatives(state0, arms);
        
        const state1 = state0.map((s, i) => ({ a: s.a + k1[i].da * dt * 0.5, v: s.v + k1[i].dv * dt * 0.5 }));
        const k2 = computeDerivatives(state1, arms);
        
        const state2 = state0.map((s, i) => ({ a: s.a + k2[i].da * dt * 0.5, v: s.v + k2[i].dv * dt * 0.5 }));
        const k3 = computeDerivatives(state2, arms);
        
        const state3 = state0.map((s, i) => ({ a: s.a + k3[i].da * dt, v: s.v + k3[i].dv * dt }));
        const k4 = computeDerivatives(state3, arms);

        for (let i = 0; i < n; i++) {
            const da = (k1[i].da + 2 * k2[i].da + 2 * k3[i].da + k4[i].da) / 6;
            const dv = (k1[i].dv + 2 * k2[i].dv + 2 * k3[i].dv + k4[i].dv) / 6;
            arms[i].a += da * dt;
            arms[i].v += dv * dt;
            arms[i].v *= f_drag;
        }
    }
}


function update() {
    if (dragging === -1 && !isPaused) {
        timeStep++;
        
        // Update Master
        updatePendulumRK4(0);

        // Update Clones (Butterfly)
        if (settings.butterfly) {
            // Optimization: If > 50 clones, maybe reduce simSpeed for them? 
            // For now, full simulation.
            for (let k = 1; k < pendulums.length; k++) {
                updatePendulumRK4(k);
            }
        }
    }

    // Gestion de la trace (Uniquement Master)
    if (!isPaused || dragging !== -1) {
        const pos = getPendulumPositions(pendulums[0]);
        const tip = pos[pos.length - 1];
        
        // Calcul vitesse du bout (approx)
        let speed = 0;
        if (trail.length > 0) {
            const last = trail[trail.length - 1];
            speed = Math.hypot(tip.x - last.x, tip.y - last.y);
        }

        trail.push({ 
            x: tip.x, 
            y: tip.y, 
            v: speed,
            t: timeStep 
        });

        if (settings.trailLength !== Infinity && trail.length > settings.trailLength) {
            trail.shift();
        }
    }
}

function draw() {
    // Effet de trainée légère sur le fond si on voulait (non fait ici)
    ctx.clearRect(0, 0, width, height);

    // 1. DESSINER LA TRACE (MASTER)
    if (trail.length > 1) {
        ctx.lineWidth = 2;
        
        if (settings.trailMode === 'solid') {
            ctx.beginPath();
            ctx.strokeStyle = settings.baseColor;
            ctx.moveTo(trail[0].x, trail[0].y);
            for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
            ctx.stroke();
        } 
        else {
            // Modes Rainbow / Speed : On doit dessiner segment par segment ou grouper
            // Pour perf, on dessine segment par segment (Canvas supporte bien ~1000 calls)
            for (let i = 1; i < trail.length; i++) {
                const p1 = trail[i-1];
                const p2 = trail[i];
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                
                // COULEUR
                let hue = 200; // default blue
                let sat = '100%';
                let light = '50%';

                if (settings.trailMode === 'speed') {
                    // Vitesse map : 0 -> 240 (Bleu), Max -> 0 (Rouge)
                    // Vitesse typique ~0 à 20
                    const vNorm = Math.min(p2.v * 5, 240);
                    hue = 240 - vNorm;
                } else if (settings.trailMode === 'rainbow') {
                    // Basé sur le temps de création
                    hue = (p2.t * 2) % 360;
                } else if (settings.trailMode === 'rainbow-cycle') {
                    // Basé sur la position dans la trace (effet serpent qui avance)
                    hue = (i * 2 + timeStep) % 360;
                }

                ctx.strokeStyle = `hsl(${hue}, ${sat}, ${light})`;
                ctx.stroke();
            }
        }
    }

    // 2. DESSINER LES CLONES (BUTTERFLY)
    // Transparents et fins
    if (settings.butterfly) {
        ctx.globalAlpha = 0.15; // Très transparent
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#aaa';
        
        for (let k = 1; k < pendulums.length; k++) {
            const pos = getPendulumPositions(pendulums[k]);
            let px = cx, py = cy;
            
            ctx.beginPath();
            for (let pt of pos) {
                ctx.moveTo(px, py);
                ctx.lineTo(pt.x, pt.y);
                px = pt.x; py = pt.y;
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }

    // 3. DESSINER LE MASTER
    const posMaster = getPendulumPositions(pendulums[0]);
    let px = cx, py = cy;
    for (let i = 0; i < posMaster.length; i++) {
        const p = posMaster[i];
        
        // Tige
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Masse
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.sqrt(pendulums[0][i].m) * 2, 0, Math.PI * 2);
        ctx.fillStyle = pendulums[0][i].color;
        ctx.fill();

        px = p.x; py = p.y;
    }

    // Pivot
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
initSimulation();
loop();
