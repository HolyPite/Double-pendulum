# Catalogue de Simulations — Idées & Roadmap

Chaque simulation doit être **interactive** (souris/clavier) et avoir des **règles modifiables** en direct via le panneau latéral. Difficulté : ●○○ facile · ●●○ moyen · ●●● ambitieux.

## ✅ Implémentées

| Sim | Interaction | Règles modifiables |
|---|---|---|
| 🌀 Pendule N-bras | drag des masses, lancer avec vitesse | gravité, friction, masses, longueurs, clones chaos |
| 💨 Fluide (Stam) | pousser le fluide + injecter de l'encre | viscosité, vorticité, dissipation, force |
| ⏳ Sable | dessiner des matériaux | matériau, pinceau, vitesse |
| 🐦 Boids | attirer / repousser la nuée | cohésion, alignement, séparation, vision, vitesse |
| 🧬 Particle Life | disperser, éditer la matrice | matrice d'attraction N×N, familles, rayon, friction |
| 🦠 Réaction (Gray-Scott) | dessiner des graines de motif | feed, kill, presets (mitose, corail, labyrinthe...) |
| 🔲 Vie (Conway B/S) | dessiner / gommer des cellules | règles B/S librement éditables, 7 presets, densité |
| 🌊 Ondes | gouttes, murs, sources oscillantes | vitesse, amortissement, fréquence, double fente |
| 🍄 Physarum | appâter à la phéromone | capteurs (angle/distance), virage, dépôt, évaporation |

## 🧪 Particules & matière

- **Tissu (cloth Verlet)** ●●○ — grille de points + contraintes. Interaction : tirer, déchirer (clic droit), épingler/libérer des coins, vent réglable.
- **Corps mous (soft bodies)** ●●○ — blobs masse-ressort qu'on lance et écrase. Règles : raideur, amortissement, pression interne.
- **Galaxie N-corps** ●●○ — gravité entre 1000+ étoiles (Barnes-Hut pour la perf). Interaction : lancer des amas à la souris, trous noirs placables, G réglable.
- **SPH (liquide à particules)** ●●● — vrai liquide qui éclabousse, complémentaire du fluide eulérien actuel.
- **Sable 2.0** ●○○ (extension) — nouveaux matériaux : acide, huile (flotte + brûle), lave, glace, plante qui pousse, poudre explosive, source/drain d'eau.

## 🔲 Automates cellulaires

- **Feu de forêt** ●○○ — croissance/foudre/propagation, sliders de probabilité. Lien direct avec la percolation.
- **Épidémie (SIR)** ●○○ — sains/infectés/guéris, taux de transmission, immunité, "vaccination" au pinceau.
- **Fourmi de Langton & turmites** ●○○ — règles éditables, plusieurs fourmis.
- **Wireworld** ●●○ — dessiner des circuits électroniques qui fonctionnent (portes logiques !).
- **Cristaux (DLA)** ●○○ — agrégation par diffusion, croissance de flocons depuis des graines placées à la souris.

## 🐜 Agents & vie artificielle

- **Fourmis + phéromones** ●●○ — colonie qui trouve la nourriture posée à la souris, pistes qui s'évaporent (cousin du Physarum, avec nid + nourriture).
- **Écosystème prédateur-proie** ●●○ — herbe/lapins/renards avec énergie et reproduction ; courbes de population en temps réel (réutiliser le graphe d'énergie du pendule).
- **Trafic routier** ●○○ — modèle Nagel-Schreckenberg, embouteillages fantômes, slider densité/vitesse max.
- **Foule / évacuation** ●●● — social forces, sorties qu'on déplace, panique.

## 🌊 Ondes & champs

- **Champ électrique** ●●○ — charges +/- qu'on dépose et déplace, lignes de champ et particules test en direct.
- **Optique 2D (ray casting)** ●●○ — sources de lumière, miroirs, lentilles, prismes (dispersion arc-en-ciel), indice de réfraction réglable.

## 📐 Maths & fractales

- **Mandelbrot / Julia** ●●○ — zoom infini (progressif), seed de Julia = position de la souris. Palettes des thèmes existants.
- **Attracteur de Lorenz (3D projeté)** ●○○ — rotation à la souris, σ/ρ/β en sliders, plusieurs trajectoires couleur (même ADN que le mode papillon du pendule).
- **L-systèmes** ●●○ — plantes fractales, règles de réécriture éditables, angle/itérations en sliders, animation de croissance.
- **Harmonographe / spirographe** ●○○ — fréquences, phases, amortissement → figures de Lissajous. Très proche du rendu de traces déjà écrit.

## 🎯 Prochaines priorités suggérées (meilleur ratio effet/effort)

1. **Tissu (Verlet)** — interaction physique directe très satisfaisante (tirer, déchirer).
2. **Galaxie N-corps** — lancer des amas d'étoiles à la souris, spectaculaire.
3. **Mandelbrot / Julia interactif** — la fractale culte, Julia animée par la souris.
4. **Champ électrique** — pédagogique et joli, charges déplaçables.
5. **Fourmi de Langton** — 30 lignes de logique, comportement fascinant.

## Conventions d'intégration

Chaque sim = 1 fichier dans `js/sims/`, enregistré via `Engine.register({...})` (voir interface dans le header de `js/engine.js`). Panneau de réglages = `<div class="sim-panel" id="panel-<id>">` dans `index.html`, IDs préfixés par un code court (`pl_`, `gs_`, `gol_`, `wv_`, `ph_`...). Boutons globaux fournis par le moteur : Pause, Reset, Effacer (si `clear()` défini), Réglages, aide `?`, clic droit réservé aux outils (contextmenu désactivé).
