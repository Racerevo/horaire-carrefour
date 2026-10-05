# Horaire Carrefour

Application web (PWA) de planning partagé pour une équipe d'employés : chacun consulte et modifie son emploi du temps hebdomadaire, partage ses horaires au sein de groupes, et échange via un chat intégré. Installable sur mobile avec notifications push.

## Aperçu

| Connexion | Emploi du temps personnel |
|---|---|
| ![Écran de connexion](Photo/connexion.png) | ![Emploi du temps personnel](Photo/PlaningPerso.png) |

| Vue partagée | Chat |
|---|---|
| ![Emploi du temps partagé](Photo/planingPartagée.png) | ![Chat](Photo/Chat.png) |

## Fonctionnalités

### Authentification
- **Inscription avec code équipe** : prénom + mot de passe + code fourni oralement par l'admin.
- **Validation admin obligatoire** : chaque compte est approuvé (ou refusé) avant tout accès.
- **Bascule automatique** : l'écran d'attente se met à jour tout seul dès que le compte est validé.

### Planning
- **Emploi du temps hebdomadaire** : navigation semaine par semaine, ajout et modification de créneaux personnels.
- **Import photo OCR** : prends en photo le ticket papier du planning — l'app le lit avec Tesseract.js, corrige les erreurs courantes et propose une vérification avant import.
- **Synchronisation en
