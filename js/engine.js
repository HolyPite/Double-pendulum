// =====================================================
// ENGINE — canvas partagé, boucle, registre de simulations
//
// Interface d'une simulation (tous les hooks sont optionnels
// sauf id, name, update, draw) :
// {
//   id: 'pendulum', name: 'Pendule', icon: '🌀',
//   hint: 'texte affiché dans la barre de contrôle',
//   help: [['T', 'Changer de thème'], ...],   // lignes ajoutées à l'aide
//   init()                  // une seule fois, à la 1re activation (bind du panneau)
//   activate() / deactivate()
//   resize(w, h)
//   update(dt)              // appelé chaque frame (consulter Engine.paused)
//   draw(ctx, w, h)
//   reset()                 // bouton ↺ / touche R
//   clear()                 // bouton ✕ / touche C (bouton masqué si absent)
//   pointerDown/Move/Up(x, y, e)
//   onKey(e)                // touches non gérées globalement
// }
// =====================================================

const Engine = (() => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let width = 0, height = 0;
    let paused = false;
    let fps = 60;
    let lastTime = performance.now();

    const sims = [];
    let active = null;

    // --- DOM ---
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const clearBtn = document.getElementById('clearBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const sidePanel = document.getElementById('sidePanel');
    const closeSidePanel = document.getElementById('closeSidePanel');
    const helpOverlay = document.getElementById('helpOverlay');
    const helpTable = document.getElementById('helpTable');
    const simSwitcher = document.getElementById('simSwitcher');
    const simTitle = document.getElementById('simTitle');
    const controlsHint = document.getElementById('controls-hint');
    const sidePanelTitle = document.getElementById('sidePanelTitle');

    function register(sim) { sims.push(sim); }

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        for (const s of sims) {
            if (s._inited && s.resize) s.resize(width, height);
        }
    }

    function setPaused(p) {
        paused = p;
        pauseBtn.textContent = paused ? '▶ Reprendre' : '⏸ Pause';
        pauseBtn.classList.toggle('paused', paused);
    }

    function buildHelp(sim) {
        const rows = [
            ['Espace', 'Pause / Reprendre'],
            ['R', 'Réinitialiser'],
        ];
        if (sim.clear) rows.push(['C', 'Effacer']);
        for (const r of (sim.help || [])) rows.push(r);
        rows.push(['F', 'Plein écran'], ['?', 'Cette aide'], ['Echap', 'Fermer']);
        helpTable.innerHTML = rows
            .map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`)
            .join('');
    }

    function switchTo(id) {
        const sim = sims.find(s => s.id === id);
        if (!sim || sim === active) return;

        if (active) {
            if (active.deactivate) active.deactivate();
            const oldPanel = document.getElementById('panel-' + active.id);
            if (oldPanel) oldPanel.classList.add('hidden');
        }

        active = sim;
        if (!sim._inited) {
            if (sim.init) sim.init();
            sim._inited = true;
            if (sim.resize) sim.resize(width, height);
        }

        // UI
        simTitle.textContent = sim.name;
        controlsHint.textContent = sim.hint || '[?] aide';
        sidePanelTitle.textContent = '⚙ ' + sim.name;
        clearBtn.style.display = sim.clear ? '' : 'none';
        document.querySelectorAll('.sim-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.sim === id));
        const panel = document.getElementById('panel-' + id);
        if (panel) panel.classList.remove('hidden');
        buildHelp(sim);

        setPaused(false);
        if (sim.activate) sim.activate();
    }

    // --- BOUTONS GLOBAUX ---
    function bindGlobalUI() {
        pauseBtn.addEventListener('click', () => setPaused(!paused));
        resetBtn.addEventListener('click', () => active && active.reset && active.reset());
        clearBtn.addEventListener('click', () => active && active.clear && active.clear());
        settingsBtn.addEventListener('click', () => sidePanel.classList.toggle('hidden'));
        closeSidePanel.addEventListener('click', () => sidePanel.classList.add('hidden'));
        helpOverlay.addEventListener('click', (e) => {
            if (e.target === helpOverlay) helpOverlay.classList.add('hidden');
        });
    }

    // --- CLAVIER GLOBAL ---
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (!active) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                setPaused(!paused);
                break;
            case 'KeyR':
                if (active.reset) active.reset();
                break;
            case 'KeyC':
                if (active.clear) active.clear();
                break;
            case 'KeyF':
                if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
                else document.exitFullscreen();
                break;
            case 'Escape':
                helpOverlay.classList.add('hidden');
                sidePanel.classList.add('hidden');
                break;
            case 'Slash':
            case 'F1':
                e.preventDefault();
                helpOverlay.classList.toggle('hidden');
                break;
            default:
                if (e.shiftKey && e.key === '?') {
                    helpOverlay.classList.toggle('hidden');
                } else if (active.onKey) {
                    active.onKey(e);
                }
        }
    });

    // --- SOURIS (transmise à la sim active) ---
    // Pas de menu contextuel : le clic droit est un outil (gomme, etc.)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
        if (active && active.pointerDown) active.pointerDown(e.clientX, e.clientY, e);
    });
    window.addEventListener('mousemove', (e) => {
        if (active && active.pointerMove) active.pointerMove(e.clientX, e.clientY, e);
    });
    window.addEventListener('mouseup', (e) => {
        if (active && active.pointerUp) active.pointerUp(e.clientX, e.clientY, e);
    });

    // --- TACTILE → événements souris synthétiques ---
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: t.clientX, clientY: t.clientY }));
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
    }, { passive: false });
    window.addEventListener('touchend', (e) => {
        e.preventDefault();
        window.dispatchEvent(new MouseEvent('mouseup', {}));
    }, { passive: false });

    // --- BOUCLE ---
    function loop() {
        const now = performance.now();
        const dt = now - lastTime;
        lastTime = now;
        fps = fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1;

        if (active) {
            active.update(dt);
            active.draw(ctx, width, height);
        }
        requestAnimationFrame(loop);
    }

    function start(defaultId) {
        // Onglets de simulations
        for (const s of sims) {
            const b = document.createElement('button');
            b.className = 'sim-tab';
            b.dataset.sim = s.id;
            b.textContent = (s.icon ? s.icon + ' ' : '') + s.name;
            b.addEventListener('click', () => switchTo(s.id));
            simSwitcher.appendChild(b);
        }
        window.addEventListener('resize', resize);
        resize();
        bindGlobalUI();
        switchTo(defaultId);
        requestAnimationFrame(loop);
    }

    return {
        register, start, switchTo, setPaused,
        canvas, ctx,
        get width() { return width; },
        get height() { return height; },
        get paused() { return paused; },
        get fps() { return fps; },
    };
})();
