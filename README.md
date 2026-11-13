# Vocab CNAM

Site gratuit et open source pour apprendre le vocabulaire d'anglais des séances du CNAM en jouant : cartes à retourner, choix multiple, paires, écriture et dictée, avec la prononciation anglaise et française.

**Site : https://dalbrechtmartin.github.io/vocab-cnam/**

## Fonctionnement

- **Listes pré-enregistrées** : dans [`docs/data/listes.json`](docs/data/listes.json), une entrée par séance (date de la séance, date pour laquelle l'apprendre, année A1/A2/A3, prof, promo, mots).
- **Listes partagées** : créées sur le site (fichier Word ou Excel déposé, tableau collé ou saisie) et publiées sur l'API ([`api/`](api/)). Seul le navigateur qui a publié une liste peut la modifier ou la supprimer (clé d'édition gardée dans le navigateur).
- **Sans serveur** : si l'API ne répond pas, le site garde les listes pré-enregistrées, les listes de l'appareil et le partage par lien.
- **Progression** : méthode des boîtes de Leitner, stockée dans le navigateur.

## Lancer en local

Site (aucune installation, aucun build) :

```bash
python -m http.server 8000 -d docs
```

API (Node.js 24 ou plus, aucune dépendance) :

```bash
cp api/.env.example api/.env
node --env-file=api/.env api/serveur.js
```

Pour que le site local utilise l'API locale, mettre `http://localhost:8080` dans [`docs/js/config.js`](docs/js/config.js) et dans la `Content-Security-Policy` de [`docs/index.html`](docs/index.html) (sans le commiter).

## Ajouter une liste pré-enregistrée

Ajouter un objet dans `docs/data/listes.json` (identifiant unique, dates au format `AAAA-MM-JJ`), puis ouvrir une pull request.

## Déploiement

- **Site** : GitHub Pages, branche `main`, dossier `/docs`.
- **API** : Dokploy sur le VPS, application construite depuis `api/Dockerfile`, port 8080, domaine `vocab-cnam.danaedev.fr`, volume persistant monté sur `/data` (base SQLite).
- Variables d'environnement de l'API : voir [`api/.env.example`](api/.env.example). `CLE_ADMIN` permet de modérer (modifier ou supprimer n'importe quelle liste avec `Authorization: Bearer <CLE_ADMIN>`).

## Contribuer

Commits au format [Conventional Commits](https://www.conventionalcommits.org/fr/) (vérifié par le hook `.githooks/commit-msg`) :

```bash
git config core.hooksPath .githooks
```

Les versions et le CHANGELOG sont gérés par release-please.

## Licence

[MIT](LICENSE)
