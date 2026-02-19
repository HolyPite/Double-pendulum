# Documentation Technique (Features)

## Fonctionnalités Actuelles
- **Simulation Physique** : Intégration RK4 (Runge-Kutta 4) pour une précision élevée.
- **Support N-Bras** : Simulation de pendules simples, doubles, triples, etc.
- **Interaction** : Drag & Drop des masses avec la souris.
- **Paramètres Dynamiques** :
    - Gravité (g)
    - Résistance de l'air (friction)
    - Masses et Longueurs individuelles
- **Effets Visuels** :
    - Mode "Butterfly" (Clones perturbés pour visualiser le chaos).
    - Traces Avancées : Fading (disparition progressive), Épaisseur dynamique selon la vitesse.
    - **Thèmes Visuels** :
        - Défaut (gris foncé)
        - Néon Cyberpunk (fond noir, glow intense, mélange additif)
        - Rétro Phosphore (Monochrome vert)

## Architecture
- **Tech Stack** : Vanilla JS, HTML5 Canvas, CSS3.
- **Entrée** : `index.html` -> `script.js`.
- **Style** : `style.css`.
