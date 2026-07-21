# Phase 2a — Groupes (remplace planning partagé + ciblage individuel)

## Ce qui change

- **Fini le planning "tout le monde voit tout le monde"** et la liste
  d'employés cliquable. La visibilité passe désormais **par groupe**.
- **Demandes pour rejoindre un groupe** (pas d'invitation : c'est toi qui
  demandes à rejoindre, un membre du groupe accepte ou refuse).
- Une fois dans un groupe, le partage du planning entre membres est
  **automatique et obligatoire** — pas d'option pour le désactiver.
- **Chat par groupe**, façon WhatsApp/Instagram (bulles alignées à droite
  pour tes messages, à gauche pour les autres), en temps réel.
- Nouvel arrivant sans groupe : écran qui invite à en rejoindre un ou à en
  créer un (les messages directs 1-à-1 viendront dans la phase 2b).

## Installation

### 1. SQL (5 min)

Dans Supabase → **SQL Editor**, colle et exécute tout le contenu de
`sql/3_groupes.sql`. Il :
- crée les tables `groupes`, `groupe_membres`, `groupe_messages`
- crée les fonctions de sécurité (`est_membre_groupe`, `partage_groupe_avec`...)
- pose toutes les policies RLS nécessaires
- **remplace** l'ancienne policy "tous les approuvés voient le planning"
  par une policy "uniquement soi-même + les membres d'un groupe commun"

⚠️ Si ça renvoie une erreur sur `drop policy if exists "events_lecture_approuves"`,
c'est sans gravité (`if exists` gère déjà le cas où elle n'existe pas ou
porte un autre nom) — regarde juste le message précis si une autre ligne
échoue et copie-le-moi.

### 2. Realtime (1 min)

Database → Publications → active `groupes`, `groupe_membres` et
`groupe_messages` (comme tu l'as fait pour `profiles`/`events`/`messages`).

### 3. Déployer les fichiers

Remplace dans ton repo : `index.html`, `script.js`, `styles-auth.css`,
`sw.js` (cache passé en **v18**). `styles.css` et le reste ne bougent pas.

## Comment ça marche en pratique

```
Toi                                    Léa
───                                    ───
Onglet "Groupes" → + Créer un groupe
"Caisses matin" → tu es auto-membre
                                        Onglet "Groupes" → Découvrir
                                        → "Demander à rejoindre"
Badge rouge sur ta carte "Caisses
matin" → tu ouvres le groupe → tu
vois la demande de Léa → Accepter
                                        Entre dans le groupe automatiquement
                                        (temps réel, pas besoin de recharger)
Vous voyez maintenant vos plannings
mutuels dans l'onglet Planning du
groupe, et pouvez discuter dans
l'onglet Chat.
```

- **Un groupe = un espace** avec deux onglets : Chat (WhatsApp-style) et
  Planning (grille des membres, comme l'ancienne vue partagée mais limitée
  au groupe).
- Les demandes en attente pour un groupe apparaissent **en haut du chat**
  de ce groupe, visibles par tous les membres — n'importe quel membre peut
  accepter ou refuser (pas réservé au créateur).
- "Quitter le groupe" retire simplement ta ligne ; le groupe continue
  d'exister pour les autres.

## Ce qui n'est PAS encore fait (phase 2b, à venir)

- Les **messages directs 1-à-1** avec demande façon Instagram
- Le bouton "Partager mon planning avec [nom]" dans un DM (optionnel,
  contrairement au partage automatique des groupes)
- L'écran d'accueil vide ne propose pour l'instant que "rejoindre/créer un
  groupe" — la seconde option ("envoyer une demande de message") arrivera
  avec la phase 2b

## Test rapide en rentrant

1. Crée un groupe test, vérifie que tu apparais bien comme membre
2. Depuis un autre compte/téléphone : "Découvrir des groupes" → demande à
   rejoindre ton groupe test
3. Vérifie que le badge de demande apparaît **en direct** sur ta carte de
   groupe (sans recharger)
4. Accepte la demande → vérifie que l'autre compte entre dans le groupe
   automatiquement
5. Testez le chat des deux côtés (bulles alignées correctement ?)
6. Ajoutez chacun un créneau sur votre planning perso → vérifiez qu'il
   apparaît dans l'onglet Planning du groupe, chez les deux
