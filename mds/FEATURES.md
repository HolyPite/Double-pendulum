# Documentation Technique (Features)

## Vue d'ensemble

Le site est devenu un **laboratoire de simulations** : un moteur commun (`js/engine.js`) gère le canvas, la boucle, la pause, les raccourcis et le panneau latéral ; chaque simulation est un module indépendant dans `js/sims/` sélectionnable via les onglets en haut de l'écran.

## Simulations actuelles

### 🌀 Pendule N-bras
- **Physique** : intégration RK4, équations de Lagrange généralisées (1 à 5 bras).
- **Interaction** : drag & drop des masses avec vitesse au lâcher.
- **Paramètres** : gravité, résistance de l'air, masses et longueurs individuelles, vitesse de simulation.
- **Effets** : mode Papillon (clones perturbés), traces avancées (vitesse/arc-en-ciel), mode Attracteur, multi-pendules indépendants (2-8), sonification Web Audio, graphe d'énergie temps réel, export PNG, presets localStorage.
- **Thèmes** : Défaut, Néon Cyberpunk, Blueprint Rétro, Cosmos, Minimal.

### 💨 Fluide
- **Physique** : Navier-Stokes incompressible ("Stable Fluids" de Jos Stam), grille 128², confinement de vorticité.
- **Interaction** : glisser pour pousser le fluide et injecter de l'encre (couleur cyclique arc-en-ciel).
- **Paramètres** : force, taille du jet, viscosité, tourbillons, persistance de l'encre.

### ⏳ Sable
- **Physique** : automate cellulaire "falling sand" (cellules de 4px).
- **Matériaux** : sable, eau, mur, bois, feu, vapeur, gomme — chacun avec ses règles locales (le sable coule dans l'eau, le feu enflamme le bois et vaporise l'eau, la vapeur monte et se dissipe...).
- **Interaction** : dessin au pinceau (taille réglable), fonctionne aussi en pause.

### 🐦 Boids
- **Modèle** : nuées de Craig Reynolds (cohésion, alignement, séparation).
- **Interaction** : maintenir le clic pour attirer ou repousser la nuée.
- **Paramètres** : population (10-500), vision, vitesse max, poids des 3 règles, traînées.

### 🧬 Particules (Particle Life)
- **Modèle** : N familles de particules, matrice d'attraction/répulsion asymétrique → "créatures" émergentes.
- **Interaction** : matrice éditable cellule par cellule (clic +0.25 / clic droit −0.25), randomiser, disperser à la souris.
- **Perf** : grille spatiale (linked lists), monde torique, jusqu'à 1500 particules.

### 🦠 Réaction (Gray-Scott)
- **Modèle** : réaction-diffusion U+2V→3V, laplacien 9 points, monde torique.
- **Interaction** : dessiner des graines de motif au pinceau.
- **Paramètres** : feed/kill fins, 7 presets (corail, mitose, labyrinthe, trous, vagues, solitons, vers).

### 🔲 Vie (Conway généralisé)
- **Modèle** : automate B/S avec règles librement éditables (boutons 0-8) + 7 presets (Life, HighLife, Day&Night, Seeds, Labyrinthe, Corail, Réplicateur).
- **Interaction** : dessiner (clic), gommer (clic droit), soupe aléatoire à densité réglable.
- **Visuel** : coloration par âge des cellules, compteur de générations.

### 🌊 Ondes
- **Modèle** : équation d'onde 2D discrétisée, amortissement, bords absorbants.
- **Interaction** : 4 outils — goutte, mur dessinable, source oscillante (max 8), gomme.
- **Expériences** : preset double fente (interférences).

### 🍄 Physarum
- **Modèle** : slime mold de Jeff Jones — agents à 3 capteurs de phéromone, dépôt + diffusion + évaporation.
- **Interaction** : appâter la colonie à la souris.
- **Paramètres** : 2000-30000 agents, angle/distance des capteurs, virage, dépôt, persistance.

## Architecture
- **Tech Stack** : Vanilla JS, HTML5 Canvas, CSS3 — zéro dépendance, fonctionne en `file://`.
- **Entrée** : `index.html` → `js/engine.js` → `js/sims/*.js` → `Engine.start('pendulum')`.
- **Contrat d'une simulation** : voir le commentaire d'en-tête de `js/engine.js` et CLAUDE.md.
- **Roadmap des prochaines simulations** : voir `SIMULATIONS.md`.
