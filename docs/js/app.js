// Navigation et écrans du site.
import {
  ANNEES, apiJoignable, changerPreference, enregistrerLocale, lienDePartage, lireLienDePartage, maitrise,
  modifierPartagee, normaliserListe, peutModifier, preferences, publier, reinitialiserProgression,
  supprimerLocale, supprimerPartagee, titre, toutesLesListes, trouverListe,
} from './donnees.js';
import { boutonAudio, brancherAudio, JEUX, lancerJeu } from './jeux.js';
import { importerFichier, lignesEnMots, lignesTexte } from './import.js';
import { aujourdhui, echapper, formaterDate } from './texte.js';
import { voixDisponible } from './voix.js';

const principal = document.querySelector('#principal');
let nettoyer = () => {};

brancherAudio(principal);

const SOURCES = {
  depot: { libelle: 'Pré-enregistrée', classe: 'badge-depot' },
  partagee: { libelle: 'Partagée', classe: 'badge-partagee' },
  locale: { libelle: 'Sur cet appareil', classe: 'badge-locale' },
};

function badge(liste) {
  const { libelle, classe } = SOURCES[liste.source];
  return `<span class="badge ${classe}">${libelle}</span>`;
}

function echeance(liste) {
  if (!liste.aApprendrePour) return '';
  const passee = liste.aApprendrePour < aujourdhui();
  return `<span class="echeance${passee ? ' passee' : ''}">À apprendre pour le ${formaterDate(liste.aApprendrePour)}</span>`;
}

function anneeProf(liste) {
  return [liste.annee, liste.prof, liste.promo].filter(Boolean).map(echapper).join(' · ');
}

function carteListe(liste) {
  const pourcentage = maitrise(liste);
  return `
    <li>
      <a class="carte-liste" href="#/liste/${encodeURIComponent(liste.id)}">
        <span class="carte-liste-entete">${badge(liste)}<span class="annee">${anneeProf(liste)}</span></span>
        <strong class="carte-liste-titre">${titre(liste)}</strong>
        ${echeance(liste)}
        <span class="carte-liste-pied">
          <span>${liste.mots.length} mot${liste.mots.length > 1 ? 's' : ''}</span>
          <span class="maitrise" aria-label="Maîtrisé à ${pourcentage} %"><span class="jauge"><span style="width:${pourcentage}%"></span></span>${pourcentage} %</span>
        </span>
      </a>
    </li>`;
}

// --- Accueil ---

async function accueil() {
  principal.innerHTML = '<p class="chargement">Chargement des listes…</p>';
  const listes = await toutesLesListes(true);
  const prefs = preferences();
  const prochaine = listes
    .filter((l) => l.aApprendrePour && l.aApprendrePour >= aujourdhui())
    .sort((a, b) => a.aApprendrePour.localeCompare(b.aApprendrePour))[0];

  principal.innerHTML = `
    <section class="intro">
      <h1>Apprends ton vocabulaire d’anglais en jouant</h1>
      <p>Choisis la liste de ta séance, puis révise avec des cartes, des quiz, des paires et des dictées. Gratuit, sans compte, avec la prononciation en anglais et en français.</p>
      ${prochaine ? `<a class="bouton bouton-grand" href="#/liste/${encodeURIComponent(prochaine.id)}">Réviser la prochaine liste : ${titre(prochaine)}</a>` : ''}
    </section>
    <section aria-labelledby="titre-listes">
      <div class="entete-section">
        <h2 id="titre-listes">Listes de vocabulaire</h2>
        <a class="bouton bouton-secondaire" href="#/creer">＋ Ajouter une liste</a>
      </div>
      <div class="filtres">
        <label>Année
          <select id="filtre-annee" class="champ">
            <option value="">Toutes</option>
            ${ANNEES.map((a) => `<option ${prefs.annee === a ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </label>
        <label>Rechercher un mot
          <input id="filtre-texte" class="champ" type="search" placeholder="ex. habit, couche…">
        </label>
      </div>
      <ul class="grille-listes" id="listes"></ul>
      ${API_INDISPONIBLE()}
    </section>`;

  const filtreAnnee = principal.querySelector('#filtre-annee');
  const filtreTexte = principal.querySelector('#filtre-texte');
  const conteneur = principal.querySelector('#listes');
  const afficher = () => {
    const recherche = filtreTexte.value.trim().toLowerCase();
    const visibles = listes.filter((l) =>
      (!filtreAnnee.value || l.annee === filtreAnnee.value)
      && (!recherche || l.mots.some((m) => `${m.en} ${m.fr}`.toLowerCase().includes(recherche))));
    conteneur.innerHTML = visibles.length
      ? visibles.map(carteListe).join('')
      : '<li class="vide">Aucune liste ne correspond. Tu peux en <a href="#/creer">ajouter une</a>.</li>';
  };
  filtreAnnee.addEventListener('change', () => { changerPreference('annee', filtreAnnee.value); afficher(); });
  filtreTexte.addEventListener('input', afficher);
  afficher();
}

const API_INDISPONIBLE = () => (apiJoignable ? '' : '<p class="note">Le serveur de partage ne répond pas pour l’instant : seules les listes pré-enregistrées et celles de cet appareil sont affichées.</p>');

// --- Détail d'une liste ---

async function detail(id) {
  const liste = await trouverListe(id);
  if (!liste) return introuvable();
  const { sens } = preferences();
  const modifiable = peutModifier(liste);
  principal.innerHTML = `
    <nav class="fil"><a href="#/">← Toutes les listes</a></nav>
    <header class="entete-liste">
      <p class="annee">${badge(liste)} ${anneeProf(liste)}</p>
      <h1>${titre(liste)}</h1>
      ${echeance(liste)}
      <p class="maitrise-liste">Maîtrisé : <strong>${maitrise(liste)} %</strong> des ${liste.mots.length} mots</p>
    </header>

    <section aria-labelledby="titre-jeux">
      <div class="entete-section">
        <h2 id="titre-jeux">Choisis un jeu</h2>
        <fieldset class="sens">
          <legend>Sens</legend>
          <label><input type="radio" name="sens" value="en-fr" ${sens === 'en-fr' ? 'checked' : ''}> 🇬🇧 → 🇫🇷</label>
          <label><input type="radio" name="sens" value="fr-en" ${sens === 'fr-en' ? 'checked' : ''}> 🇫🇷 → 🇬🇧</label>
        </fieldset>
      </div>
      <ul class="grille-jeux">
        ${JEUX.filter((j) => !j.voix || voixDisponible()).map((j) => `
          <li><a class="carte-jeu" href="#/jouer/${encodeURIComponent(liste.id)}/${j.id}">
            <span class="icone-jeu" aria-hidden="true">${j.icone}</span>
            <strong>${j.nom}</strong>
            <span>${j.description}</span>
          </a></li>`).join('')}
      </ul>
    </section>

    <section aria-labelledby="titre-mots">
      <h2 id="titre-mots">Les mots</h2>
      <table class="tableau-mots">
        <thead><tr><th scope="col">🇬🇧 Anglais</th><th scope="col">🇫🇷 Français</th></tr></thead>
        <tbody>
          ${liste.mots.map((m) => `<tr>
            <td lang="en"><span class="cellule-mot">${echapper(m.en)} ${boutonAudio(m.en, 'en')}</span></td>
            <td lang="fr"><span class="cellule-mot">${echapper(m.fr)} ${boutonAudio(m.fr, 'fr')}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>

    <section aria-labelledby="titre-actions" class="actions-liste">
      <h2 id="titre-actions">Partager et gérer</h2>
      <div class="rangee-boutons">
        <button type="button" class="bouton bouton-secondaire" data-action="lien">🔗 Copier un lien de partage</button>
        <button type="button" class="bouton bouton-secondaire" data-action="csv">⬇️ Télécharger (CSV)</button>
        ${liste.source === 'locale' ? '<button type="button" class="bouton" data-action="publier">🌍 Publier pour tout le monde</button>' : ''}
        ${modifiable ? `<a class="bouton bouton-secondaire" href="#/modifier/${encodeURIComponent(liste.id)}">✏️ Modifier</a>
          <button type="button" class="bouton bouton-danger" data-action="supprimer">🗑️ Supprimer</button>` : ''}
        <button type="button" class="bouton bouton-secondaire" data-action="zero">↺ Remettre ma progression à zéro</button>
      </div>
      <p class="retour" role="status" aria-live="polite"></p>
    </section>`;

  principal.querySelectorAll('input[name="sens"]').forEach((radio) => radio.addEventListener('change', () => changerPreference('sens', radio.value)));
  const retour = principal.querySelector('.actions-liste .retour');
  principal.querySelector('.actions-liste').addEventListener('click', async (evenement) => {
    const action = evenement.target.closest('[data-action]')?.dataset.action;
    try {
      if (action === 'lien') {
        await navigator.clipboard.writeText(lienDePartage(liste));
        retour.textContent = 'Lien copié : colle-le dans un message à tes camarades.';
      }
      if (action === 'csv') telechargerCsv(liste);
      if (action === 'publier') {
        retour.textContent = 'Publication…';
        const nouvelId = await publier(liste);
        location.hash = `#/liste/${encodeURIComponent(nouvelId)}`;
      }
      if (action === 'supprimer' && confirm(`Supprimer « ${titre(liste)} »${liste.source === 'partagee' ? ' pour tout le monde' : ''} ?`)) {
        if (liste.source === 'partagee') await supprimerPartagee(liste.id);
        else supprimerLocale(liste.id);
        location.hash = '#/';
      }
      if (action === 'zero' && confirm('Remettre à zéro ta progression sur cette liste ?')) {
        reinitialiserProgression(liste.id);
        detail(id);
      }
    } catch (erreur) {
      retour.textContent = `Impossible : ${erreur.message}`;
    }
  });
}

function telechargerCsv(liste) {
  const cellule = (v) => `"${v.replace(/"/g, '""')}"`;
  const contenu = ['anglais;français', ...liste.mots.map((m) => `${cellule(m.en)};${cellule(m.fr)}`)].join('\r\n');
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob(['﻿', contenu], { type: 'text/csv;charset=utf-8' }));
  lien.download = `vocabulaire-${liste.dateSeance}.csv`;
  lien.click();
  URL.revokeObjectURL(lien.href);
}

// --- Jeu ---

async function jouer(id, jeuId) {
  const liste = await trouverListe(id);
  const jeu = JEUX.find((j) => j.id === jeuId);
  if (!liste || !jeu) return introuvable();
  const lienListe = `#/liste/${encodeURIComponent(liste.id)}`;
  principal.innerHTML = `
    <nav class="fil"><a href="${lienListe}">← ${titre(liste)}</a></nav>
    <h1 class="titre-jeu"><span aria-hidden="true">${jeu.icone}</span> ${jeu.nom}</h1>
    <div class="zone-jeu" id="zone-jeu"></div>`;
  const zone = principal.querySelector('#zone-jeu');
  const demarrer = () => {
    nettoyer();
    nettoyer = lancerJeu(jeu.id, zone, liste, preferences().sens, (resultat) => {
      nettoyer();
      nettoyer = () => {};
      bilan(zone, resultat, lienListe, demarrer);
    });
  };
  demarrer();
}

function bilan(zone, { justes, total, aRevoir, detail }, lienListe, rejouer) {
  const score = total ? Math.round((justes / total) * 100) : 0;
  const message = score === 100 ? 'Parfait ! 🎉' : score >= 70 ? 'Très bien ! 💪' : 'Continue, ça rentre ! 🌱';
  zone.innerHTML = `
    <div class="bilan${score === 100 ? ' parfait' : ''}">
      <p class="score">${score} %</p>
      <p class="message-bilan">${message}</p>
      <p>${justes} / ${total} du premier coup${detail ? ` · ${detail}` : ''}</p>
      ${aRevoir.length ? `<h2>À revoir</h2><ul class="a-revoir">${aRevoir.map((m) => `<li><span lang="en">${echapper(m.en)}</span> → <span lang="fr">${echapper(m.fr)}</span> ${boutonAudio(m.en, 'en')}</li>`).join('')}</ul>` : ''}
      <div class="rangee-boutons">
        <button type="button" class="bouton" id="rejouer">Rejouer</button>
        <a class="bouton bouton-secondaire" href="${lienListe}">Choisir un autre jeu</a>
      </div>
    </div>`;
  zone.querySelector('#rejouer').addEventListener('click', rejouer);
  zone.querySelector('#rejouer').focus();
}

// --- Création et modification ---

function ligneMot(mot = { en: '', fr: '' }) {
  return `<tr>
    <td><input class="champ" lang="en" aria-label="Mot anglais" value="${echapper(mot.en)}" data-champ="en"></td>
    <td><input class="champ" lang="fr" aria-label="Traduction française" value="${echapper(mot.fr)}" data-champ="fr"></td>
    <td><button type="button" class="bouton-icone" data-action="retirer" aria-label="Retirer ce mot">✕</button></td>
  </tr>`;
}

async function formulaire(id) {
  const existante = id ? await trouverListe(id) : null;
  if (id && (!existante || !peutModifier(existante))) return introuvable();
  const prefs = preferences();
  const liste = existante ?? { dateSeance: aujourdhui(), aApprendrePour: '', annee: prefs.annee || 'A1', prof: '', promo: '', mots: [] };
  principal.innerHTML = `
    <nav class="fil"><a href="#/">← Toutes les listes</a></nav>
    <h1>${existante ? 'Modifier la liste' : 'Ajouter une liste'}</h1>
    <form id="formulaire-liste" class="formulaire-liste">
      <fieldset>
        <legend>La séance</legend>
        <div class="grille-champs">
          <label>Date de la séance <input class="champ" type="date" name="dateSeance" required value="${liste.dateSeance}"></label>
          <label>À apprendre pour le <input class="champ" type="date" name="aApprendrePour" value="${liste.aApprendrePour}"></label>
          <label>Année
            <select class="champ" name="annee">${ANNEES.map((a) => `<option ${liste.annee === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
          </label>
          <label>Prof <input class="champ" name="prof" placeholder="ex. A. Kraus" value="${echapper(liste.prof)}"></label>
          <label>Promo <input class="champ" name="promo" placeholder="ex. 2026-27" value="${echapper(liste.promo)}"></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Les mots</legend>
        <div class="zone-depot" id="zone-depot">
          <p><strong>Dépose ici ton fichier Word ou Excel</strong> (tableau à deux colonnes : anglais | français)</p>
          <label class="bouton bouton-secondaire">Choisir un fichier
            <input type="file" id="fichier" accept=".docx,.xlsx,.csv,.txt,.tsv" class="visuellement-cache">
          </label>
        </div>
        <details>
          <summary>…ou colle le tableau copié depuis Word, Excel ou un mail</summary>
          <label class="visuellement-cache" for="colle">Texte collé</label>
          <textarea id="colle" class="champ" rows="5" placeholder="A habit	Une habitude&#10;Clothes = Un vêtement"></textarea>
          <button type="button" class="bouton bouton-secondaire" data-action="coller">Ajouter ces mots</button>
        </details>
        <p class="retour" id="retour-import" role="status" aria-live="polite"></p>
        <table class="tableau-saisie">
          <thead><tr><th scope="col">🇬🇧 Anglais</th><th scope="col">🇫🇷 Français</th><th><span class="visuellement-cache">Retirer</span></th></tr></thead>
          <tbody id="lignes">${(liste.mots.length ? liste.mots : [undefined, undefined, undefined]).map(ligneMot).join('')}</tbody>
        </table>
        <button type="button" class="bouton bouton-secondaire" data-action="ajouter">＋ Ajouter un mot</button>
      </fieldset>

      <div class="rangee-boutons">
        <button type="submit" class="bouton bouton-grand">${existante ? 'Enregistrer' : 'Créer la liste'}</button>
        ${existante ? '' : '<label class="case"><input type="checkbox" name="publier" checked> Publier aussi pour tout le monde (les autres promos pourront l’utiliser)</label>'}
      </div>
      <p class="retour" id="retour-formulaire" role="status" aria-live="polite"></p>
    </form>`;

  const form = principal.querySelector('#formulaire-liste');
  const lignes = form.querySelector('#lignes');
  const retourImport = form.querySelector('#retour-import');

  const motsSaisis = () => [...lignes.querySelectorAll('tr')]
    .map((tr) => ({ en: tr.querySelector('[data-champ="en"]').value.trim(), fr: tr.querySelector('[data-champ="fr"]').value.trim() }))
    .filter((m) => m.en || m.fr);

  const ajouterMots = (mots) => {
    if (!mots.length) {
      retourImport.textContent = 'Aucune paire anglais / français trouvée. Vérifie que ton tableau a deux colonnes.';
      return;
    }
    lignes.innerHTML = [...motsSaisis(), ...mots].map(ligneMot).join('');
    retourImport.textContent = `${mots.length} mot${mots.length > 1 ? 's' : ''} ajouté${mots.length > 1 ? 's' : ''}. Vérifie-les ci-dessous.`;
  };

  const importer = async (fichier) => {
    try {
      retourImport.textContent = 'Lecture du fichier…';
      ajouterMots(await importerFichier(fichier));
    } catch (erreur) {
      retourImport.textContent = erreur.message;
    }
  };

  form.querySelector('#fichier').addEventListener('change', (e) => e.target.files[0] && importer(e.target.files[0]));
  const depot = form.querySelector('#zone-depot');
  depot.addEventListener('dragover', (e) => { e.preventDefault(); depot.classList.add('survol'); });
  depot.addEventListener('dragleave', () => depot.classList.remove('survol'));
  depot.addEventListener('drop', (e) => {
    e.preventDefault();
    depot.classList.remove('survol');
    if (e.dataTransfer.files[0]) importer(e.dataTransfer.files[0]);
  });

  form.addEventListener('click', (evenement) => {
    const action = evenement.target.closest('[data-action]')?.dataset.action;
    if (action === 'ajouter') {
      lignes.insertAdjacentHTML('beforeend', ligneMot());
      lignes.querySelector('tr:last-child input').focus();
    }
    if (action === 'retirer') evenement.target.closest('tr').remove();
    if (action === 'coller') {
      const zone = form.querySelector('#colle');
      ajouterMots(lignesEnMots(lignesTexte(zone.value)));
      zone.value = '';
    }
  });

  form.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    const retour = form.querySelector('#retour-formulaire');
    const donnees = new FormData(form);
    const incompletes = motsSaisis().filter((m) => !m.en || !m.fr).length;
    if (incompletes) {
      retour.textContent = `${incompletes} ligne${incompletes > 1 ? 's ont' : ' a'} un seul des deux mots : complète ou retire-la${incompletes > 1 ? 's' : ''}.`;
      return;
    }
    const nouvelle = normaliserListe({
      id: existante?.id,
      ...Object.fromEntries(['dateSeance', 'aApprendrePour', 'annee', 'prof', 'promo'].map((cle) => [cle, donnees.get(cle)])),
      mots: motsSaisis(),
    });
    if (!nouvelle) {
      retour.textContent = 'Il faut au moins une date de séance et un mot.';
      return;
    }
    try {
      if (existante?.source === 'partagee') {
        await modifierPartagee(nouvelle);
        location.hash = `#/liste/${encodeURIComponent(nouvelle.id)}`;
        return;
      }
      enregistrerLocale(nouvelle);
      if (donnees.get('publier')) {
        retour.textContent = 'Publication…';
        try {
          const id = await publier({ ...nouvelle, source: 'locale' });
          location.hash = `#/liste/${encodeURIComponent(id)}`;
          return;
        } catch {
          alert('Le serveur de partage ne répond pas : la liste est gardée sur cet appareil. Tu pourras la publier plus tard ou envoyer son lien.');
        }
      }
      location.hash = `#/liste/${encodeURIComponent(nouvelle.id)}`;
    } catch (erreur) {
      retour.textContent = `Impossible : ${erreur.message}`;
    }
  });
}

// --- Réception d'un lien de partage ---

function recevoir(donnees) {
  const liste = lireLienDePartage(donnees);
  if (!liste) return introuvable();
  principal.innerHTML = `
    <nav class="fil"><a href="#/">← Toutes les listes</a></nav>
    <h1>On t’a partagé une liste</h1>
    <p><strong>${titre(liste)}</strong> · ${anneeProf(liste)} · ${liste.mots.length} mots</p>
    <ul class="apercu">${liste.mots.slice(0, 8).map((m) => `<li>${echapper(m.en)} → ${echapper(m.fr)}</li>`).join('')}${liste.mots.length > 8 ? '<li>…</li>' : ''}</ul>
    <button type="button" class="bouton bouton-grand" id="ajouter">Ajouter à mes listes</button>`;
  principal.querySelector('#ajouter').addEventListener('click', () => {
    enregistrerLocale(liste);
    location.hash = `#/liste/${encodeURIComponent(liste.id)}`;
  });
}

function introuvable() {
  principal.innerHTML = '<h1>Page introuvable</h1><p>Cette liste n’existe pas ou plus. <a href="#/">Retour à l’accueil</a></p>';
}

// --- Routeur ---

const ROUTES = [
  [/^#\/liste\/([^/]+)$/, (id) => detail(decodeURIComponent(id))],
  [/^#\/jouer\/([^/]+)\/([^/]+)$/, (id, jeu) => jouer(decodeURIComponent(id), jeu)],
  [/^#\/creer$/, () => formulaire()],
  [/^#\/modifier\/([^/]+)$/, (id) => formulaire(decodeURIComponent(id))],
  [/^#\/recevoir\/(.+)$/, (donnees) => recevoir(donnees)],
];

async function router() {
  nettoyer();
  nettoyer = () => {};
  window.speechSynthesis?.cancel();
  const hash = location.hash || '#/';
  const route = ROUTES.find(([motif]) => motif.test(hash));
  await (route ? route[1](...hash.match(route[0]).slice(1)) : accueil());
  window.scrollTo(0, 0);
  const titrePage = principal.querySelector('h1')?.cloneNode(true);
  titrePage?.querySelectorAll('[aria-hidden="true"]').forEach((decor) => decor.remove());
  document.title = titrePage ? `${titrePage.textContent.trim()} · Vocab CNAM` : 'Vocab CNAM';
  if (!principal.querySelector('.zone-jeu')) principal.focus({ preventScroll: true });
}

window.addEventListener('hashchange', router);
router();
