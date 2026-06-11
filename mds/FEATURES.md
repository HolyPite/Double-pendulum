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

## Architecture
- **Tech Stack** : Vanilla JS, HTML5 Canvas, CSS3 — zéro dépendance, fonctionne en `file://`.
- **Entrée** : `index.html` → `js/engine.js` → `js/sims/*.js` → `Engine.start('pendulum')`.
- **Contrat d'une simulation** : voir le commentaire d'en-tête de `js/engine.js` et CLAUDE.md.
- **Roadmap des prochaines simulations** : voir `SIMULATIONS.md`.
