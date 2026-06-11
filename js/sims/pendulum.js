// =====================================================
// SIMULATION : Pendule à N bras (chaos)
// =====================================================
(() => {
const canvas = Engine.canvas;
const ctx = Engine.ctx;

let width = 0, height = 0, cx = 0, cy = 0;

// --- AUDIO ---
let audioCtx = null;
let audioOscillators = []; // Un oscillateur par bras
let audioGains = [];       // Gain par bras
let masterGain = null;

function initAudio() {
    if (audioCtx) return; // déjà initialisé
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.15;
    masterGain.connect(audioCtx.destination);
}

function startAudio() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    stopAudio(); // nettoyer les anciens

    const n = settings.nArms;
    for (let i = 0; i < n; i++) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = i === 0 ? 'sine' : (i === 1 ? 'triangle' : 'sawtooth');
        osc.frequency.value = 110 + i * 55; // A2, D3, G3, C4...
        gain.gain.value = 0;

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();

        audioOscillators.push(osc);
        audioGains.push(gain);
    }
}

function stopAudio() {
    audioOscillators.forEach(o => { try { o.stop(); } catch {} });
    audioOscillators = [];
    audioGains = [];
}

function updateAudio() {
    if (!settings.audioEnabled || !audioCtx || audioOscillators.length === 0) return;
    // En mode multi, suivre le premier pendule visible plutôt que le master gelé
    const arms = settings.multiMode && multiPendulums[0] ? multiPendulums[0].arms : pendulums[0];
    const t = audioCtx.currentTime;

    arms.forEach((arm, i) => {
        if (!audioOscillators[i]) return;
        // Fréquence : base + vitesse angulaire → 80–600 Hz
        const speed = Math.abs(arm.v);
        const freq = 80 + Math.min(speed * 60, 520);
        audioOscillators[i].frequency.setTargetAtTime(freq, t, 0.05);

        // Volume : proportionnel à la vitesse, plafond à 0.4 par bras
        const vol = Math.min(speed * 0.08, 0.4);
        audioGains[i].gain.setTargetAtTime(vol, t, 0.08);
    });
}


// --- THEMES ---
const themes = {
    "default": { bg: '#1a1a1a', trail: 'speed', glow: 0, composite: 'source-over', desc: "Défaut", dark: true },
    "neon":    { bg: '#000000', trail: 'speed', glow: 20, composite: 'lighter', desc: "Néon Cyberpunk", dark: true },
    "retro":   { bg: '#001a1a', trail: 'solid', glow: 0, composite: 'source-over', desc: "Blueprint (Retro)", dark: true },
    "cosmos":  { bg: '#000005', trail: 'rainbow', glow: 8, composite: 'source-over', desc: "Cosmos", dark: true },
    "minimal": { bg: '#f0f0eb', trail: 'solid', glow: 0, composite: 'source-over', desc: "Minimal", dark: false }
};

// Étoiles du thème Cosmos (générées une fois)
let stars = [];

// --- CONFIGURATION ---
const settings = {
    nArms: 2,
    g: 0.8,
    resistance: 0.1, // % (0-100) -> sera converti en f_drag
    simSpeed: 5,
    trailLength: 500, // Infinity possible
    trailMode: 'speed', // 'solid', 'speed', 'rainbow', 'rainbow-cycle'
    butterfly: false,
    butterflyCount: 50,
    baseColor: '#3498db',
    theme: 'default',
    showHUD: true,
    attractorMode: false,
    showEnergyGraph: false,
    audioEnabled: false,
    multiMode: false,
    multiCount: 3
};

// Variables dérivées / Runtime
let f_drag = 0.999;
let dragging = -1;
let timeStep = 0; // Pour le mode arc-en-ciel temporel

// Historique drag pour calcul de vitesse angulaire au lâcher
let dragHistory = []; // [{angle, time}]

// Historique énergie pour le graphe
const ENERGY_HISTORY_LEN = 300;
let energyHistory = []; // [{ke, pe, total}]

// STATE
// pendulums[0] est le PRINCIPAL.
// pendulums[1...N] sont les CLONES (Butterfly).
// Chaque élément est un tableau d'objets "Arm" {r, m, a, v, color...}
let pendulums = [];

// Trace du pendule principal seulement (pour perf)
// Array of {x, y, v (vitesse), t (temps)}
let trail = [];

// Mode multi-pendules : tableau de pendules indépendants avec leurs propres traces et pivots
// Chaque entrée: { arms: [...], trail: [], color: '#hex', pivotX, pivotY }
let multiPendulums = [];
const MULTI_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];

// --- PRESETS (SCÉNARIOS) ---
// resistance en % directement (même unité que le slider)
const scenarios = {
    "default": { nArms: 2, g: 0.8, resistance: 0.1, m: 15, r: 150, desc: "Défaut" },
    "chaos": { nArms: 2, g: 1.5, resistance: 0, m: 15, r: 150, desc: "Chaos Pur (Sans friction)" },
    "triple": { nArms: 3, g: 0.8, resistance: 0.1, m: 15, r: 120, desc: "Triple Pendule" },
    "snake": { nArms: 5, g: 0.6, resistance: 0.5, m: 5, r: 60, desc: "Le Serpent (5 bras)" },
    "whip": { nArms: 4, g: 0.9, resistance: 0.2, m: [40, 30, 10, 2], r: [100, 100, 100, 100], desc: "Le Fouet (Masses décroissantes)" },
    "micro": { nArms: 2, g: 0.1, resistance: 0.0, m: 15, r: 80, desc: "Micro Gravité" }
};
const scenarioKeys = Object.keys(scenarios);

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
        x[i] = Math.abs(mat[i][i]) < 1e-10 ? 0 : (res[i] - sum) / mat[i][i];
    }
    return x;
}

// --- INITIALISATION ---

function initSimulation(customParams = null) {
    pendulums = [];
    trail = [];

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

    // Le nombre de bras a pu changer → reconstruire les pendules multi
    if (settings.multiMode) initMultiPendulums();

    // Refresh UI (valeurs masses/longueurs peuvent avoir changé)
    generateSettingsUI();

    // Redémarrer l'audio si actif (nombre de bras peut avoir changé)
    if (settings.audioEnabled) startAudio();
}

function initButterflyClones() {
    // Supprime les anciens clones, garde le maitre (index 0)
    pendulums = [pendulums[0]];

    if (!settings.butterfly) return;

    const master = pendulums[0];
    for (let k = 0; k < settings.butterflyCount; k++) {
        let clone = master.map(arm => ({ ...arm }));
        // Perturbation infime
        clone.forEach(arm => {
            arm.a += (Math.random() - 0.5) * 0.001;
        });
        pendulums.push(clone);
    }
}

// --- MULTI-PENDULES ---

function initMultiPendulums() {
    multiPendulums = [];
    if (!settings.multiMode) return;

    const count = settings.multiCount;
    const margin = 120;
    const usableW = width - margin * 2;
    const cols = Math.min(count, 4);
    const rows = Math.ceil(count / cols);
    const cellW = usableW / cols;
    const cellH = (height * 0.7) / rows;

    for (let k = 0; k < count; k++) {
        const col = k % cols;
        const row = Math.floor(k / cols);
        const pivotX = margin + cellW * col + cellW / 2;
        const pivotY = margin * 0.5 + cellH * row + cellH * 0.25;

        const color = MULTI_COLORS[k % MULTI_COLORS.length];
        const maxLen = Math.min(cellW, cellH) * 0.32;

        const arms = [];
        for (let i = 0; i < settings.nArms; i++) {
            arms.push({
                r: maxLen - i * (maxLen * 0.1),
                m: 15 - i * 2,
                a: Math.PI / 2 + (k * 0.4) + (i * 0.15),
                v: 0,
                color
            });
        }
        multiPendulums.push({ arms, trail: [], pivotX, pivotY, color });
    }
}

function updateMultiPendulums() {
    if (!settings.multiMode || Engine.paused) return;
    for (const mp of multiPendulums) {
        updatePendulumArms(mp.arms, settings.simSpeed);

        // Trail
        const pos = getPositionsFromPivot(mp.arms, mp.pivotX, mp.pivotY);
        const tip = pos[pos.length - 1];
        let speed = 0;
        if (mp.trail.length > 0) {
            const last = mp.trail[mp.trail.length - 1];
            speed = Math.hypot(tip.x - last.x, tip.y - last.y);
        }
        mp.trail.push({ x: tip.x, y: tip.y, v: speed, t: timeStep });
        const maxLen = settings.trailLength === Infinity ? 300 : Math.min(settings.trailLength, 300);
        if (mp.trail.length > maxLen) mp.trail.shift();
    }
}

function getPositionsFromPivot(armsList, pivX, pivY) {
    let x = pivX, y = pivY;
    const positions = [];
    for (const arm of armsList) {
        x += arm.r * Math.sin(arm.a);
        y += arm.r * Math.cos(arm.a);
        positions.push({ x, y });
    }
    return positions;
}

// Version de updatePendulumRK4 qui prend un tableau de bras directement
function updatePendulumArms(arms, steps) {
    const n = arms.length;
    const dt = 0.2;
    for (let step = 0; step < steps; step++) {
        const state0 = arms.map(a => ({ a: a.a, v: a.v }));
        const k1 = computeDerivatives(state0, arms);
        const state1 = state0.map((s, i) => ({ a: s.a + k1[i].da * dt * 0.5, v: s.v + k1[i].dv * dt * 0.5 }));
        const k2 = computeDerivatives(state1, arms);
        const state2 = state0.map((s, i) => ({ a: s.a + k2[i].da * dt * 0.5, v: s.v + k2[i].dv * dt * 0.5 }));
        const k3 = computeDerivatives(state2, arms);
        const state3 = state0.map((s, i) => ({ a: s.a + k3[i].da * dt, v: s.v + k3[i].dv * dt }));
        const k4 = computeDerivatives(state3, arms);
        for (let i = 0; i < n; i++) {
            arms[i].a += (k1[i].da + 2*k2[i].da + 2*k3[i].da + k4[i].da) / 6 * dt;
            arms[i].v += (k1[i].dv + 2*k2[i].dv + 2*k3[i].dv + k4[i].dv) / 6 * dt;
            arms[i].v *= f_drag;
        }
    }
}

function drawMultiPendulums() {
    if (!settings.multiMode) return;
    const currentTheme = themes[settings.theme];

    for (const mp of multiPendulums) {
        const pos = getPositionsFromPivot(mp.arms, mp.pivotX, mp.pivotY);

        // Trace (couleur du pendule, alpha croissant vers la tête)
        if (mp.trail.length > 1) {
            ctx.strokeStyle = mp.color;
            ctx.lineWidth = 1.5;
            for (let i = 1; i < mp.trail.length; i++) {
                const p1 = mp.trail[i - 1];
                const p2 = mp.trail[i];
                ctx.globalAlpha = (i / mp.trail.length) * 0.7;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // Tiges et masses
        let px = mp.pivotX, py = mp.pivotY;
        if (settings.theme === 'neon') { ctx.shadowBlur = 12; ctx.shadowColor = mp.color; }

        for (let i = 0; i < pos.length; i++) {
            const p = pos[i];
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = currentTheme.dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 2;
            ctx.globalCompositeOperation = currentTheme.composite;
            ctx.stroke();

            const r = Math.sqrt(mp.arms[i].m) * 1.8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = mp.color;
            ctx.fill();

            px = p.x; py = p.y;
        }

        // Pivot
        ctx.beginPath();
        ctx.arc(mp.pivotX, mp.pivotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = currentTheme.dark ? '#fff' : '#333';
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }
}

// --- UI ---

function syncUIToSettings() {
    // Onglet Physique
    const inpSpd = document.getElementById('inp_spd');
    if (inpSpd) { inpSpd.value = settings.simSpeed; document.getElementById('val_spd').textContent = settings.simSpeed; }
    const inpG = document.getElementById('inp_g');
    if (inpG) { inpG.value = settings.g; document.getElementById('val_g').textContent = settings.g; }
    const inpF = document.getElementById('inp_f');
    if (inpF) { inpF.value = settings.resistance; document.getElementById('val_f').textContent = settings.resistance; }
    // Onglet Visuel
    const selTheme = document.getElementById('sel_theme');
    if (selTheme) selTheme.value = settings.theme;
    const selTrail = document.getElementById('sel_trail');
    if (selTrail) selTrail.value = settings.trailMode;
    const inpTrlen = document.getElementById('inp_trlen');
    if (inpTrlen) {
        inpTrlen.value = settings.trailLength === Infinity ? 1000 : settings.trailLength;
        document.getElementById('val_trlen').textContent = settings.trailLength === Infinity ? '∞' : settings.trailLength;
    }
    const chkBf = document.getElementById('chk_bf');
    if (chkBf) chkBf.checked = settings.butterfly;
    const inpBfCount = document.getElementById('inp_bf_count');
    if (inpBfCount) { inpBfCount.value = settings.butterflyCount; document.getElementById('val_bf_count').textContent = settings.butterflyCount; }
    const bfOpt = document.getElementById('bf_options');
    if (bfOpt) bfOpt.classList.toggle('visible', settings.butterfly);
    // Onglet Structure
    const inpN = document.getElementById('inp_n');
    if (inpN) { inpN.value = settings.nArms; document.getElementById('val_n').textContent = settings.nArms; }
    const chkHud = document.getElementById('chk_hud');
    if (chkHud) chkHud.checked = settings.showHUD;
    const chkEg = document.getElementById('chk_energy_graph');
    if (chkEg) chkEg.checked = settings.showEnergyGraph;
}

function rebuildArmDetails() {
    const container = document.getElementById('arm-details');
    if (!container) return;
    container.innerHTML = '';
    pendulums[0].forEach((arm, i) => {
        const row = document.createElement('div');
        row.className = 'arm-row';
        row.innerHTML = `
            <div class="arm-row-title">Bras ${i + 1}</div>
            <div class="arm-dual">
                <div>
                    <label>Longueur: <span id="val_r${i}">${Math.round(arm.r)}</span></label>
                    <input type="range" id="inp_r${i}" min="20" max="300" value="${arm.r}">
                </div>
                <div>
                    <label>Masse: <span id="val_m${i}">${Math.round(arm.m)}</span></label>
                    <input type="range" id="inp_m${i}" min="1" max="100" value="${arm.m}">
                </div>
            </div>
        `;
        container.appendChild(row);

        row.querySelector(`#inp_r${i}`).addEventListener('input', e => {
            const val = +e.target.value;
            arm.r = val;
            pendulums.forEach(p => p[i].r = val);
            row.querySelector(`#val_r${i}`).textContent = Math.round(val);
        });
        row.querySelector(`#inp_m${i}`).addEventListener('input', e => {
            const val = +e.target.value;
            arm.m = val;
            pendulums.forEach(p => p[i].m = val);
            row.querySelector(`#val_m${i}`).textContent = Math.round(val);
        });
    });
}

function generateSettingsUI() {
    // Populate theme selector
    const selTheme = document.getElementById('sel_theme');
    if (selTheme && selTheme.options.length === 0) {
        Object.keys(themes).forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = themes[k].desc;
            selTheme.appendChild(opt);
        });
    }

    // Populate scenario selector
    const selScen = document.getElementById('sel_scenario');
    if (selScen && selScen.options.length === 0) {
        Object.keys(scenarios).forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = scenarios[k].desc;
            selScen.appendChild(opt);
        });
    }

    syncUIToSettings();
    rebuildArmDetails();
    renderCustomPresets();
}

function applyTheme(themeKey) {
    settings.theme = themeKey;
    document.body.style.backgroundColor = themes[themeKey].bg;
    const sel = document.getElementById('sel_theme');
    if (sel) sel.value = themeKey;
}

function applyScenario(key) {
    const s = scenarios[key];
    if (!s) return;
    settings.nArms = s.nArms;
    settings.g = s.g;
    settings.resistance = s.resistance;
    f_drag = 1 - (settings.resistance / 1000);
    initSimulation(s);
    syncUIToSettings();
}

function bindPanel() {
    const panel = document.getElementById('panel-pendulum');

    // Onglets internes du panneau
    panel.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            panel.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
            tab.classList.add('active');
            panel.querySelector('#tab-' + tab.dataset.tab).classList.remove('hidden');
        });
    });

    // Structure
    document.getElementById('inp_n').addEventListener('input', (e) => {
        settings.nArms = +e.target.value;
        document.getElementById('val_n').textContent = settings.nArms;
        initSimulation();
    });
    document.getElementById('btn_load_scenario').addEventListener('click', () => {
        applyScenario(document.getElementById('sel_scenario').value);
    });

    // Visuel
    document.getElementById('sel_theme').addEventListener('change', e => applyTheme(e.target.value));
    document.getElementById('sel_trail').addEventListener('change', e => settings.trailMode = e.target.value);
    document.getElementById('inp_trlen').addEventListener('input', e => {
        const v = +e.target.value;
        settings.trailLength = v >= 1000 ? Infinity : v;
        document.getElementById('val_trlen').textContent = settings.trailLength === Infinity ? '∞' : v;
        if (settings.trailLength !== Infinity && trail.length > v) trail.splice(0, trail.length - v);
    });
    document.getElementById('chk_bf').addEventListener('change', e => {
        settings.butterfly = e.target.checked;
        document.getElementById('bf_options').classList.toggle('visible', settings.butterfly);
        initButterflyClones();
    });
    document.getElementById('inp_bf_count').addEventListener('input', e => {
        settings.butterflyCount = +e.target.value;
        document.getElementById('val_bf_count').textContent = settings.butterflyCount;
        if (settings.butterfly) initButterflyClones();
    });
    document.getElementById('chk_hud').addEventListener('change', e => settings.showHUD = e.target.checked);
    document.getElementById('chk_energy_graph').addEventListener('change', e => {
        settings.showEnergyGraph = e.target.checked;
        if (!settings.showEnergyGraph) energyHistory = [];
    });

    // Physique
    document.getElementById('inp_spd').addEventListener('input', e => {
        settings.simSpeed = +e.target.value;
        document.getElementById('val_spd').textContent = settings.simSpeed;
    });
    document.getElementById('inp_g').addEventListener('input', e => {
        settings.g = +e.target.value;
        document.getElementById('val_g').textContent = settings.g;
    });
    document.getElementById('inp_f').addEventListener('input', e => {
        settings.resistance = +e.target.value;
        f_drag = 1 - (settings.resistance / 1000);
        document.getElementById('val_f').textContent = settings.resistance;
    });

    // Avancé — Audio
    document.getElementById('chk_audio').addEventListener('change', e => {
        settings.audioEnabled = e.target.checked;
        if (settings.audioEnabled) {
            startAudio();
            document.getElementById('audio_options').classList.add('visible');
        } else {
            stopAudio();
            document.getElementById('audio_options').classList.remove('visible');
        }
    });
    document.getElementById('inp_audio_vol').addEventListener('input', e => {
        const vol = +e.target.value / 100;
        document.getElementById('val_audio_vol').textContent = e.target.value;
        if (masterGain) masterGain.gain.setTargetAtTime(vol * 0.3, audioCtx.currentTime, 0.05);
    });

    // Avancé — Multi-pendules
    document.getElementById('chk_multi').addEventListener('change', e => {
        settings.multiMode = e.target.checked;
        document.getElementById('multi_options').classList.toggle('visible', settings.multiMode);
        if (settings.multiMode) initMultiPendulums();
        else multiPendulums = [];
    });
    document.getElementById('inp_multi_count').addEventListener('input', e => {
        settings.multiCount = +e.target.value;
        document.getElementById('val_multi_count').textContent = settings.multiCount;
        if (settings.multiMode) initMultiPendulums();
    });

    // Avancé — Attracteur
    document.getElementById('chk_attractor').addEventListener('change', e => {
        settings.attractorMode = e.target.checked;
        if (settings.attractorMode) trail = [];
    });

    // Avancé — Export PNG
    document.getElementById('btn_export_png').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `pendule_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // Avancé — Presets
    document.getElementById('btn_save_preset').addEventListener('click', () => {
        const name = document.getElementById('inp_preset_name').value.trim();
        if (!name) return;
        const saved = getCustomPresets();
        saved.push({
            name,
            nArms: settings.nArms,
            g: settings.g,
            resistance: settings.resistance,
            simSpeed: settings.simSpeed,
            trailMode: settings.trailMode,
            trailLength: settings.trailLength,
            theme: settings.theme,
            arms: pendulums[0].map(a => ({ r: a.r, m: a.m }))
        });
        localStorage.setItem('dp_presets', JSON.stringify(saved));
        document.getElementById('inp_preset_name').value = '';
        renderCustomPresets();
    });
}

// --- Presets custom (localStorage) ---

function getCustomPresets() {
    try { return JSON.parse(localStorage.getItem('dp_presets') || '[]'); } catch { return []; }
}

function loadCustomPreset(preset) {
    settings.nArms = preset.nArms;
    settings.g = preset.g;
    settings.resistance = preset.resistance;
    settings.simSpeed = preset.simSpeed;
    settings.trailMode = preset.trailMode;
    settings.trailLength = preset.trailLength;
    f_drag = 1 - (settings.resistance / 1000);
    applyTheme(preset.theme);
    initSimulation({ nArms: preset.nArms, m: preset.arms.map(a => a.m), r: preset.arms.map(a => a.r) });
}

function renderCustomPresets() {
    const container = document.getElementById('custom_presets');
    if (!container) return;
    const presets = getCustomPresets();
    container.innerHTML = '';
    if (presets.length === 0) {
        container.innerHTML = '<p class="hint">Aucun preset sauvegardé.</p>';
        return;
    }
    presets.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'preset-item';
        div.innerHTML = `<span>${p.name}</span><span>
            <button title="Charger">▶</button>
            <button title="Supprimer">✕</button>
        </span>`;
        div.querySelectorAll('button')[0].addEventListener('click', () => loadCustomPreset(p));
        div.querySelectorAll('button')[1].addEventListener('click', () => {
            const saved = getCustomPresets();
            saved.splice(idx, 1);
            localStorage.setItem('dp_presets', JSON.stringify(saved));
            renderCustomPresets();
        });
        container.appendChild(div);
    });
}

// --- DÉCOR ---

function generateStars() {
    stars = [];
    for (let i = 0; i < 220; i++) {
        stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.4 + 0.3,
            a: Math.random() * 0.6 + 0.2
        });
    }
}

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

// --- PHYSICS CORE (RK4) ---

function computeDerivatives(armState, pendulumInstance) {
    const n = armState.length;
    const M = Array(n).fill(0).map(() => Array(n).fill(0));
    const F = Array(n).fill(0);

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

function updatePendulumRK4(pIndex, simSteps) {
    const steps = simSteps !== undefined ? simSteps : settings.simSpeed;
    updatePendulumArms(pendulums[pIndex], steps);
}

// --- ÉNERGIE ---

function computeEnergy() {
    const arms = pendulums[0];
    const n = arms.length;
    let ke = 0, pe = 0;

    let px = 0, py = 0; // relatif au pivot (y positif = bas)
    for (let i = 0; i < n; i++) {
        const a = arms[i];
        const dx = a.r * Math.sin(a.a);
        const dy = a.r * Math.cos(a.a);
        px += dx; py += dy;

        // Vitesse cartésienne (contribution du bras i et de tous ceux avant)
        let vxi = 0, vyi = 0;
        for (let j = 0; j <= i; j++) {
            vxi += arms[j].r * arms[j].v * Math.cos(arms[j].a);
            vyi -= arms[j].r * arms[j].v * Math.sin(arms[j].a);
        }
        ke += 0.5 * a.m * (vxi * vxi + vyi * vyi);
        // Énergie potentielle : hauteur = -py (car y canvas vers le bas)
        pe += a.m * settings.g * (-py);
    }
    return { ke, pe, total: ke + pe };
}

// --- RENDU ---

function drawMass(x, y, radius, color, theme) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (theme === 'retro') {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.12)';
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    } else if (theme === 'neon') {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = color;
        ctx.shadowBlur = 28;
        ctx.fill();
        ctx.shadowBlur = 0;
    } else if (theme === 'cosmos') {
        const grad = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.05, x, y, radius);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.4, color);
        grad.addColorStop(1, 'rgba(0,0,20,0.8)');
        ctx.fillStyle = grad;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
    } else if (theme === 'minimal') {
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
    } else {
        const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.05, x, y, radius);
        grad.addColorStop(0, 'rgba(255,255,255,0.5)');
        grad.addColorStop(0.5, color);
        grad.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = grad;
        ctx.fill();
    }
}

// energy peut être null (mode multi) → FPS seul
function drawHUD(energy) {
    if (!settings.showHUD) return;
    const t = themes[settings.theme];
    const isDark = t.dark;
    const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(30,30,30,0.85)';
    const bgColor = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)';

    const x = width - 175;
    const y = 18;
    const lh = 18;
    const lines = energy ? 5 : 2;

    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 14, 168, lines * lh - 2, 6);
    ctx.fill();

    ctx.font = '12px monospace';
    ctx.fillStyle = textColor;
    ctx.fillText(`FPS: ${Math.round(Engine.fps)}`, x, y);
    if (energy) {
        ctx.fillStyle = isDark ? '#ff6b6b' : '#cc3333';
        ctx.fillText(`KE: ${energy.ke.toFixed(0)}`, x, y + lh);
        ctx.fillStyle = isDark ? '#74b9ff' : '#1a5ccc';
        ctx.fillText(`PE: ${energy.pe.toFixed(0)}`, x, y + lh * 2);
        ctx.fillStyle = isDark ? '#55efc4' : '#006644';
        ctx.fillText(`Total: ${energy.total.toFixed(0)}`, x, y + lh * 3);
    }
    ctx.fillStyle = textColor;
    ctx.fillText(`[H] masquer HUD`, x, y + lh * (lines - 1));
    ctx.restore();
}

function drawEnergyGraph() {
    if (energyHistory.length < 2) return;

    const gw = Math.min(340, width * 0.35);
    const gh = 90;
    const gx = width - gw - 12;
    const gy = height - gh - 12;
    const pad = 6;

    const isDark = themes[settings.theme].dark;
    const bg = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)';
    const textColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(30,30,30,0.85)';

    ctx.save();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 6);
    ctx.fill();

    let maxVal = 1;
    for (const e of energyHistory) {
        maxVal = Math.max(maxVal, Math.abs(e.ke), Math.abs(e.pe), Math.abs(e.total));
    }

    const plotW = gw - pad * 2;
    const titleY = gy + pad + 10;
    const baseY = gy + gh - pad;

    ctx.font = '10px monospace';
    ctx.fillStyle = textColor;
    ctx.fillText('Énergie', gx + pad, titleY);

    ctx.fillStyle = '#ff6b6b'; ctx.fillText('■KE', gx + 55, titleY);
    ctx.fillStyle = '#74b9ff'; ctx.fillText('■PE', gx + 85, titleY);
    ctx.fillStyle = '#55efc4'; ctx.fillText('■Tot', gx + 113, titleY);

    const plotY0 = titleY + 4;
    const plotYH = baseY - plotY0;

    function drawCurve(key, color) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        energyHistory.forEach((e, i) => {
            const x = gx + pad + (i / (ENERGY_HISTORY_LEN - 1)) * plotW;
            const norm = Math.max(0, Math.min(1, (e[key] - (-maxVal)) / (2 * maxVal)));
            const y = plotY0 + plotYH * (1 - norm);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Ligne zéro
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const zeroY = plotY0 + plotYH * 0.5;
    ctx.moveTo(gx + pad, zeroY);
    ctx.lineTo(gx + pad + plotW, zeroY);
    ctx.stroke();

    drawCurve('ke', '#ff6b6b');
    drawCurve('pe', '#74b9ff');
    drawCurve('total', '#55efc4');

    ctx.restore();
}

function drawGrid() {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
    const step = 50;

    ctx.beginPath();
    for (let x = 0; x < width; x += step) {
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let y = 0; y < height; y += step) {
        ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Axes centraux
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
    ctx.moveTo(0, cy); ctx.lineTo(width, cy);
    ctx.stroke();
}

// =====================================================
// HOOKS DE LA SIMULATION
// =====================================================

function update() {
    if (dragging === -1 && !Engine.paused) {
        timeStep++;

        if (!settings.multiMode) {
            // Update Master
            updatePendulumRK4(0);

            // Update Clones (Butterfly) — vitesse réduite selon les FPS et le nombre de clones
            if (settings.butterfly) {
                const fps = Engine.fps;
                const maxCloneSpeed = fps < 40 ? 1 : (fps < 55 ? 2 : Math.min(settings.simSpeed, 3));
                for (let k = 1; k < pendulums.length; k++) {
                    updatePendulumRK4(k, maxCloneSpeed);
                }
            }
        }
    }

    // Gestion de la trace (Uniquement Master, hors mode multi)
    if (!settings.multiMode && (!Engine.paused || dragging !== -1)) {
        const pos = getPendulumPositions(pendulums[0]);
        const tip = pos[pos.length - 1];

        let speed = 0;
        if (trail.length > 0) {
            const last = trail[trail.length - 1];
            speed = Math.hypot(tip.x - last.x, tip.y - last.y);
        }

        trail.push({ x: tip.x, y: tip.y, v: speed, t: timeStep });

        if (settings.trailLength !== Infinity && trail.length > settings.trailLength) {
            trail.shift();
        }
    }

    // Historique énergie
    if (!Engine.paused && dragging === -1 && settings.showEnergyGraph && !settings.multiMode) {
        const e = computeEnergy();
        energyHistory.push(e);
        if (energyHistory.length > ENERGY_HISTORY_LEN) energyHistory.shift();
    }

    updateMultiPendulums();
    updateAudio();
}

function draw() {
    const currentTheme = themes[settings.theme];

    // Clear (ou assombrissement progressif en mode Attracteur)
    if (settings.attractorMode) {
        ctx.fillStyle = 'rgba(0,0,0,0.018)';
        ctx.fillRect(0, 0, width, height);
    } else {
        ctx.fillStyle = currentTheme.bg;
        ctx.fillRect(0, 0, width, height);
    }

    // Étoiles pour le thème Cosmos
    if (settings.theme === 'cosmos') {
        ctx.save();
        for (const s of stars) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${s.a})`;
            ctx.fill();
        }
        ctx.restore();
    }

    // Grille pour le mode Retro
    if (settings.theme === 'retro') {
        drawGrid();
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = currentTheme.composite;

    // Mode multi : rendu dédié + HUD réduit, pas de master
    if (settings.multiMode) {
        drawMultiPendulums();
        ctx.globalCompositeOperation = 'source-over';
        drawHUD(null);
        return;
    }

    // 1. DESSINER LA TRACE (MASTER)
    if (trail.length > 1) {
        if (settings.trailMode === 'solid') {
            ctx.lineWidth = settings.theme === 'minimal' ? 1.5 : 2;
            ctx.beginPath();
            let trailColor;
            if (settings.theme === 'retro') trailColor = '#00ffff';
            else if (settings.theme === 'minimal') trailColor = 'rgba(40,40,40,0.7)';
            else trailColor = settings.baseColor;
            ctx.strokeStyle = trailColor;
            ctx.moveTo(trail[0].x, trail[0].y);
            for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
            ctx.stroke();
        } else {
            for (let i = 1; i < trail.length; i++) {
                const p1 = trail[i - 1];
                const p2 = trail[i];
                const ageRatio = i / trail.length;

                let hue = 200, sat = '100%', light = '50%';
                let alpha = ageRatio;
                let lw = 2;

                if (settings.trailMode === 'speed') {
                    const vNorm = Math.min(p2.v * 5, 240);
                    hue = 240 - vNorm;
                    if (settings.theme === 'neon' || settings.theme === 'cosmos') {
                        light = '65%';
                        lw = 1.5 + (p2.v * 0.6);
                    }
                } else if (settings.trailMode === 'rainbow') {
                    hue = (p2.t * 2) % 360;
                    if (settings.theme === 'cosmos') light = '60%';
                } else if (settings.trailMode === 'rainbow-cycle') {
                    hue = (i * 2 + timeStep) % 360;
                }

                ctx.lineWidth = lw;
                ctx.strokeStyle = `hsla(${hue}, ${sat}, ${light}, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }

    // 2. DESSINER LES CLONES (BUTTERFLY)
    if (settings.butterfly) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over'; // clones toujours en source-over
        ctx.globalAlpha = settings.theme === 'cosmos' ? 0.12 : 0.15;
        ctx.lineWidth = 1;
        ctx.strokeStyle = settings.theme === 'retro' ? '#004444'
            : settings.theme === 'minimal' ? '#aaa'
            : settings.theme === 'cosmos' ? '#8888ff'
            : '#aaa';
        ctx.shadowBlur = 0;

        for (let k = 1; k < pendulums.length; k++) {
            const pos = getPendulumPositions(pendulums[k]);
            let lpx = cx, lpy = cy;
            ctx.beginPath();
            for (const pt of pos) {
                ctx.moveTo(lpx, lpy);
                ctx.lineTo(pt.x, pt.y);
                lpx = pt.x; lpy = pt.y;
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    // Reset composite avant dessin pendule
    ctx.globalCompositeOperation = currentTheme.composite;

    // 3. DESSINER LE MASTER
    const posMaster = getPendulumPositions(pendulums[0]);
    let px = cx, py = cy;

    for (let i = 0; i < posMaster.length; i++) {
        const p = posMaster[i];
        const arm = pendulums[0][i];
        const radius = Math.sqrt(arm.m) * 2;

        // Tige
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(p.x, p.y);
        if (settings.theme === 'retro') {
            ctx.strokeStyle = '#00ffff';
        } else if (settings.theme === 'minimal') {
            ctx.strokeStyle = '#333';
        } else if (settings.theme === 'cosmos') {
            ctx.strokeStyle = 'rgba(180,180,255,0.6)';
            ctx.shadowColor = 'rgba(100,100,255,0.4)';
            ctx.shadowBlur = 6;
        } else {
            ctx.strokeStyle = '#fff';
        }
        if (settings.theme === 'neon') {
            ctx.shadowBlur = currentTheme.glow;
            ctx.shadowColor = arm.color;
        }
        ctx.lineWidth = settings.theme === 'minimal' ? 2 : 3;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Masse
        drawMass(p.x, p.y, radius, arm.color, settings.theme);

        px = p.x; py = p.y;
    }

    // Pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    if (settings.theme === 'retro') ctx.fillStyle = '#00ffff';
    else if (settings.theme === 'minimal') ctx.fillStyle = '#333';
    else if (settings.theme === 'cosmos') { ctx.fillStyle = '#8888ff'; ctx.shadowColor = '#8888ff'; ctx.shadowBlur = 10; }
    else ctx.fillStyle = '#fff';
    ctx.fill();

    // Reset context
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

    // HUD + Graphe énergie
    const energy = computeEnergy();
    drawHUD(energy);
    if (settings.showEnergyGraph) drawEnergyGraph();
}

// --- INTERACTION (master uniquement, hors mode multi) ---

function pointerDown(mx, my) {
    if (settings.multiMode) return;
    const positions = getPendulumPositions(pendulums[0]);

    for (let i = settings.nArms - 1; i >= 0; i--) {
        const dist = Math.hypot(mx - positions[i].x, my - positions[i].y);
        const radius = Math.sqrt(pendulums[0][i].m) * 3 + 15;
        if (dist < radius) {
            dragging = i;
            return;
        }
    }
}

function pointerMove(mx, my) {
    if (dragging === -1) return;

    let prevX = cx, prevY = cy;
    if (dragging > 0) {
        const pos = getPendulumPositions(pendulums[0]);
        prevX = pos[dragging - 1].x;
        prevY = pos[dragging - 1].y;
    }
    const dx = mx - prevX;
    const dy = my - prevY;
    const newAngle = Math.atan2(dx, dy);
    pendulums[0][dragging].a = newAngle;

    // Historique pour calcul vitesse au lâcher
    dragHistory.push({ angle: newAngle, time: performance.now() });
    if (dragHistory.length > 8) dragHistory.shift();

    // Synchroniser les clones sur le master pendant le drag
    for (let k = 1; k < pendulums.length; k++) {
        pendulums[k][dragging].a = newAngle;
    }

    trail = [];
}

function pointerUp() {
    if (dragging === -1) return;

    // Calculer vitesse angulaire à partir de l'historique de drag
    let angularVel = 0;
    if (dragHistory.length >= 2) {
        const oldest = dragHistory[0];
        const newest = dragHistory[dragHistory.length - 1];
        const dt = (newest.time - oldest.time) / 1000; // en secondes
        if (dt > 0.001) {
            // Différence d'angle avec gestion du saut ±π
            let dAngle = newest.angle - oldest.angle;
            while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
            while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
            angularVel = (dAngle / dt) * 0.016; // 0.016 ≈ 60fps frame time
        }
    }
    dragHistory = [];

    // Appliquer vitesse au bras dragué, reset les autres
    pendulums[0].forEach((a, idx) => {
        a.v = idx === dragging ? Math.max(-15, Math.min(15, angularVel)) : 0;
    });

    // Si Butterfly : Reset des clones sur le master + bruit
    if (settings.butterfly) {
        initButterflyClones();
        for (let k = 1; k < pendulums.length; k++) {
            pendulums[k].forEach((arm, idx) => {
                arm.a = pendulums[0][idx].a + (Math.random() - 0.5) * 0.001;
                arm.v = 0;
            });
        }
    }
    dragging = -1;
}

function onKey(e) {
    switch (e.code) {
        case 'KeyT': {
            const themeList = Object.keys(themes);
            const idx = themeList.indexOf(settings.theme);
            applyTheme(themeList[(idx + 1) % themeList.length]);
            break;
        }
        case 'KeyH':
            settings.showHUD = !settings.showHUD;
            syncUIToSettings();
            break;
        default:
            if (e.key >= '1' && e.key <= '6') {
                const idx = parseInt(e.key) - 1;
                if (idx < scenarioKeys.length) applyScenario(scenarioKeys[idx]);
            }
    }
}

Engine.register({
    id: 'pendulum',
    name: 'Pendule',
    icon: '🌀',
    hint: 'glissez les masses · [?] aide',
    help: [
        ['T', 'Changer de thème'],
        ['H', 'Afficher / Masquer HUD'],
        ['1 – 6', 'Charger un scénario'],
    ],
    init() {
        bindPanel();
        initSimulation();
    },
    activate() {
        document.body.style.backgroundColor = themes[settings.theme].bg;
        if (settings.audioEnabled) startAudio();
    },
    deactivate() {
        stopAudio();
    },
    resize(w, h) {
        width = w; height = h;
        cx = w / 2;
        cy = h / 3;
        generateStars();
        if (settings.multiMode) initMultiPendulums();
    },
    update,
    draw,
    reset() { initSimulation(); },
    clear() {
        trail = [];
        multiPendulums.forEach(mp => mp.trail = []);
    },
    pointerDown, pointerMove, pointerUp,
    onKey,
});
})();
