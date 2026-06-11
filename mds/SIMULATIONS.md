# Catalogue de Simulations — Idées & Roadmap

Chaque simulation doit être **interactive** (souris/clavier) et avoir des **règles modifiables** en direct via le panneau latéral. Difficulté : ●○○ facile · ●●○ moyen · ●●● ambitieux.

## ✅ Implémentées

| Sim | Interaction | Règles modifiables |
|---|---|---|
| 🌀 Pendule N-bras | drag des masses, lancer avec vitesse | gravité, friction, masses, longueurs, clones chaos |
| 💨 Fluide (Stam) | pousser le fluide + injecter de l'encre | viscosité, vorticité, dissipation, force |
| ⏳ Sable | dessiner des matériaux | matériau, pinceau, vitesse |
| 🐦 Boids | attirer / repousser la nuée | cohésion, alignement, séparation, vision, vitesse |

## 🧪 Particules & matière

- **Particle Life** ●●○ — particules de N couleurs avec matrice d'attraction/répulsion asymétrique. Des "créatures" émergent. Interaction : éditer la matrice en direct, randomiser, perturber à la souris. *Énorme potentiel, très peu de code.*
- **Tissu (cloth Verlet)** ●●○ — grille de points + contraintes. Interaction : tirer, déchirer (clic droit), épingler/libérer des coins, vent réglable.
- **Corps mous (soft bodies)** ●●○ — blobs masse-ressort qu'on lance et écrase. Règles : raideur, amortissement, pression interne.
- **Galaxie N-corps** ●●○ — gravité entre 1000+ étoiles (Barnes-Hut pour la perf). Interaction : lancer des amas à la souris, trous noirs placables, G réglable.
- **SPH (liquide à particules)** ●●● — vrai liquide qui éclabousse, complémentaire du fluide eulérien actuel.
- **Sable 2.0** ●○○ (extension) — nouveaux matériaux : acide, huile (flotte + brûle), lave, glace, plante qui pousse, poudre explosive, source/drain d'eau.

## 🔲 Automates cellulaires

- **Jeu de la Vie + éditeur de règles** ●○○ — le classique, mais avec les règles **B/S éditables** (ex. B3/S23 → HighLife, Seeds, Day&Night). Interaction : dessiner, tamponner des patterns connus (glider, canon).
- **Réaction-diffusion (Gray-Scott)** ●●○ — motifs de Turing organiques (taches, labyrinthes, coraux). Sliders feed/kill = morphing hypnotique en direct. *Visuellement spectaculaire.*
- **Feu de forêt** ●○○ — croissance/foudre/propagation, sliders de probabilité. Lien direct avec la percolation.
- **Épidémie (SIR)** ●○○ — sains/infectés/guéris, taux de transmission, immunité, "vaccination" au pinceau.
- **Fourmi de Langton & turmites** ●○○ — règles éditables, plusieurs fourmis.
- **Wireworld** ●●○ — dessiner des circuits électroniques qui fonctionnent (portes logiques !).
- **Cristaux (DLA)** ●○○ — agrégation par diffusion, croissance de flocons depuis des graines placées à la souris.

## 🐜 Agents & vie artificielle

- **Fourmis + phéromones** ●●○ — colonie qui trouve la nourriture posée à la souris, pistes qui s'évaporent. Règles : taux d'évaporation, nb de fourmis, obstacles.
- **Physarum (slime mold)** ●●○ — millions d'agents traçant des réseaux organiques. Sliders : angle/distance de détection, dépôt, évaporation. *Rendu incroyable pour le coût.*
- **Écosystème prédateur-proie** ●●○ — herbe/lapins/renards avec énergie et reproduction ; courbes de population en temps réel (réutiliser le graphe d'énergie du pendule).
- **Trafic routier** ●○○ — modèle Nagel-Schreckenberg, embouteillages fantômes, slider densité/vitesse max.
- **Foule / évacuation** ●●● — social forces, sorties qu'on déplace, panique.

## 🌊 Ondes & champs

- **Équation d'onde 2D** ●●○ — surface d'eau : cliquer = goutte, murs dessinables, fréquence/amortissement réglables → interférences, double fente réelle.
- **Champ électrique** ●●○ — charges +/- qu'on dépose et déplace, lignes de champ et particules test en direct.
- **Optique 2D (ray casting)** ●●○ — sources de lumière, miroirs, lentilles, prismes (dispersion arc-en-ciel), indice de réfraction réglable.

## 📐 Maths & fractales

- **Mandelbrot / Julia** ●●○ — zoom infini (progressif), seed de Julia = position de la souris. Palettes des thèmes existants.
- **Attracteur de Lorenz (3D projeté)** ●○○ — rotation à la souris, σ/ρ/β en sliders, plusieurs trajectoires couleur (même ADN que le mode papillon du pendule).
- **L-systèmes** ●●○ — plantes fractales, règles de réécriture éditables, angle/itérations en sliders, animation de croissance.
- **Harmonographe / spirographe** ●○○ — fréquences, phases, amortissement → figures de Lissajous. Très proche du rendu de traces déjà écrit.

## 🎯 Priorités suggérées (meilleur ratio effet/effort)

1. **Particle Life** — réutilise le canvas plein écran, émergent, addictif.
2. **Gray-Scott** — le plus beau résultat pour ~150 lignes.
3. **Jeu de la Vie + règles éditables** — rapide, pédagogique.
4. **Équation d'onde** — interaction immédiate très satisfaisante.
5. **Physarum** — le "wow" visuel.

## Conventions d'intégration

Chaque sim = 1 fichier dans `js/sims/`, enregistré via `Engine.register({...})` (voir interface dans CLAUDE.md). Panneau de réglages = `<div class="sim-panel" id="panel-<id>">` dans `index.html`. Boutons globaux fournis par le moteur : Pause, Reset, Effacer (si `clear()` défini), Réglages, aide `?`.
