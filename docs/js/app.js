// Navigation et écrans du site.
import {
  ANNEES, apiJoignable, changerPreference, enregistrerLocale, lienDePartage, lireLienDePartage, maitrise,
  modifierPartagee, normaliserListe, peutModifier, preferences, publier, reinitialiserProgression,
  supprimerLocale, supprimerPartagee, titre, toutesLesListes, trouverListe,
} from './donnees.js';
import { boutonAudio, brancherAudio, JEUX, lancerJeu } from './jeux.js';
import { importerFichier, lignesEnMots, lignesTexte } from './import.js';
import { aujourdhui, echapper, formaterDate } from './texte.js';
import { choisirVoix, lire, voixChoisie, voixDisponible, voixPour } from './voix.js';

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
  const { pourcentage } = maitrise(liste);
  return `
    <li>
      <a class="carte-liste" href="#/liste/${encodeURIComponent(liste.id)}">
        <span class="carte-liste-entete">${badge(liste)}<span class="annee">${anneeProf(liste)}</span></span>
        <strong class="carte-liste-titre">${titre(liste)}</strong>
        ${echeance(liste)}
        <span class="carte-liste-pied">
          <span>${liste.mots.length} mot${liste.mots.length > 1 ? 's' : ''}</span>
          <span class="maitrise" aria-label="Progression ${pourcentage} %"><span class="jauge"><span style="width:${pourcentage}%"></span></span>${pourcentage} %</span>
        </span>
      </a>
    </li>`;
}

// --- Accueil ---

// La classe de l'élève : '' tant qu'il n'a rien choisi, TOUTES s'il veut tout voir.
const TOUTES = 'tout';
const NOMS_ANNEES = { A1: '1re année', A2: '2e année', A3: '3e année' };
const lienClasse = (annee) => `${location.origin}${location.pathname}#/${annee.toLowerCase()}`;

function resumeClasse(listes, annee) {
  const siennes = listes.filter((l) => l.annee === annee);
  const profs = [...new Set(siennes.map((l) => l.prof).filter(Boolean))];
  const nombre = siennes.length ? `${siennes.length} liste${siennes.length > 1 ? 's' : ''}` : '0 liste';
  return [...profs.map(echapper), nombre].join(' · ');
}

function choixClasse(listes) {
  return `
    <section class="choix-classe" aria-labelledby="titre-classe">
      <h2 id="titre-classe" tabindex="-1">Tu es en quelle année ?</h2>
      <p class="note-classe">Ton choix est retenu sur cet appareil, tu pourras le changer.</p>
      <div class="grille-classes">
        ${ANNEES.map((annee) => `
          <button type="button" class="bouton-classe" data-classe="${annee}">
            <strong>${NOMS_ANNEES[annee]}</strong>
            <span class="code-classe">${annee}</span>
            <span class="detail-classe">${resumeClasse(listes, annee)}</span>
          </button>`).join('')}
      </div>
      <button type="button" class="lien-bouton" data-classe="${TOUTES}">Je ne sais pas, tout afficher</button>
    </section>`;
}

function bandeauClasse(classe) {
  if (classe === TOUTES) {
    return `<p class="bandeau-classe" tabindex="-1">Toutes les années sont affichées. <button type="button" class="lien-bouton" data-classe="">Choisir ma classe</button></p>`;
  }
  return `
    <div class="bandeau-classe" tabindex="-1">
      <p>Ta classe : <strong>${NOMS_ANNEES[classe]} · ${classe}</strong> <button type="button" class="lien-bouton" data-classe="">Changer</button></p>
      <button type="button" class="bouton bouton-secondaire bouton-petit" id="copier-lien-classe">🔗 Copier le lien de ma classe</button>
      <span class="retour" role="status" aria-live="polite"></span>
    </div>`;
}

async function accueil() {
  principal.innerHTML = '<p class="chargement">Chargement des listes…</p>';
  const listes = await toutesLesListes(true);
  const classe = preferences().annee;
  const choisie = ANNEES.includes(classe) ? classe : '';
  const deMaClasse = (l) => !choisie || l.annee === choisie;
  const prochaine = listes
    .filter((l) => deMaClasse(l) && l.aApprendrePour && l.aApprendrePour >= aujourdhui())
    .sort((a, b) => a.aApprendrePour.localeCompare(b.aApprendrePour))[0];
  const compte = (annee) => listes.filter((l) => !annee || l.annee === annee).length;

  principal.innerHTML = `
    <section class="intro">
      <h1>Apprends ton vocabulaire d’anglais en jouant</h1>
      <p>Choisis la liste de ta séance, puis révise avec des cartes, des quiz, des paires et des dictées. Gratuit, sans compte, avec la prononciation en anglais et en français.</p>
      ${classe ? bandeauClasse(classe === TOUTES ? TOUTES : choisie || TOUTES) : ''}
      ${classe && prochaine ? `<a class="bouton bouton-grand" href="#/liste/${encodeURIComponent(prochaine.id)}">Réviser la prochaine liste : ${titre(prochaine)}</a>` : ''}
    </section>
    ${classe ? '' : choixClasse(listes)}
    <section aria-labelledby="titre-listes">
      <div class="entete-section">
        <h2 id="titre-listes">Listes de vocabulaire</h2>
        <a class="bouton bouton-secondaire" href="#/creer">＋ Ajouter une liste</a>
      </div>
      <div class="filtres">
        <div class="puces" role="group" aria-label="Filtrer par année">
          ${['', ...ANNEES].map((annee) => `
            <button type="button" class="puce" data-filtre="${annee}" aria-pressed="${annee === choisie}" ${annee && annee !== choisie && !compte(annee) ? 'disabled' : ''}>
              ${annee || 'Toutes'} <span class="compte">${compte(annee)}</span>
            </button>`).join('')}
        </div>
        <label>Rechercher un mot
          <input id="filtre-texte" class="champ" type="search" placeholder="ex. habit, couche…">
        </label>
      </div>
      <ul class="grille-listes" id="listes"></ul>
      ${API_INDISPONIBLE()}
    </section>`;

  const filtreTexte = principal.querySelector('#filtre-texte');
  const conteneur = principal.querySelector('#listes');
  const puces = [...principal.querySelectorAll('.puce')];
  let filtre = choisie;
  const afficher = () => {
    puces.forEach((p) => p.setAttribute('aria-pressed', String(p.dataset.filtre === filtre)));
    const recherche = filtreTexte.value.trim().toLowerCase();
    const visibles = listes.filter((l) =>
      (!filtre || l.annee === filtre)
      && (!recherche || l.mots.some((m) => `${m.en} ${m.fr}`.toLowerCase().includes(recherche))));
    conteneur.innerHTML = visibles.length
      ? visibles.map(carteListe).join('')
      : `<li class="vide">Aucune liste ${filtre ? `en ${filtre} ` : ''}pour l’instant. <a href="#/creer">Ajoute celle de ta dernière séance</a> : toute ta classe pourra l’utiliser.</li>`;
  };
  puces.forEach((p) => p.addEventListener('click', () => { filtre = p.dataset.filtre; afficher(); }));
  filtreTexte.addEventListener('input', afficher);

  principal.querySelectorAll('[data-classe]').forEach((bouton) => bouton.addEventListener('click', () => {
    changerPreference('annee', bouton.dataset.classe);
    accueil().then(() => principal.querySelector('.bandeau-classe, .choix-classe h2')?.focus?.());
  }));
  principal.querySelector('#copier-lien-classe')?.addEventListener('click', async () => {
    const retour = principal.querySelector('.bandeau-classe .retour');
    try {
      await navigator.clipboard.writeText(lienClasse(choisie));
      retour.textContent = 'Lien copié : partage-le à ta classe, elle arrivera directement sur ses listes.';
    } catch {
      retour.textContent = `Lien de ta classe : ${lienClasse(choisie)}`;
    }
  });
  afficher();
}

/** Lien de classe (#/a3) : retient la classe puis affiche l'accueil, sans garder le lien dans l'historique. */
function arriverParLienClasse(annee) {
  changerPreference('annee', annee.toUpperCase());
  history.replaceState(null, '', '#/');
  return accueil();
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
      ${(({ pourcentage, maitrises }) => `<div class="maitrise-liste">
        <p>Progression : <strong>${pourcentage} %</strong> · ${maitrises} mot${maitrises > 1 ? 's' : ''} sur ${liste.mots.length} maîtrisé${maitrises > 1 ? 's' : ''}</p>
        <span class="jauge jauge-large"><span style="width:${pourcentage}%"></span></span>
      </div>`)(maitrise(liste))}
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

    ${voixDisponible() ? `<section aria-labelledby="titre-voix" class="reglage-voix">
      <h2 id="titre-voix">Voix</h2>
      <div class="grille-champs" id="choix-voix"></div>
      <p class="note" id="alerte-voix" hidden></p>
    </section>` : ''}

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
  if (voixDisponible()) afficherChoixVoix();
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

const EXEMPLES_VOIX = { en: 'Hello, how are you?', fr: 'Bonjour, comment ça va ?' };
const AIDE_VOIX = 'Aucune voix anglaise sur cet appareil : la prononciation serait faite avec un accent français. '
  + 'Ouvre le site dans Chrome ou Edge (voix en ligne incluses), ou installe une voix anglaise : '
  + 'Windows › Paramètres › Heure et langue › Voix ; Android › Paramètres › Synthèse vocale ; iPhone › Réglages › Accessibilité › Contenu énoncé › Voix.';

async function afficherChoixVoix() {
  const conteneur = principal.querySelector('#choix-voix');
  const alerte = principal.querySelector('#alerte-voix');
  const libelles = { en: '🇬🇧 Voix anglaise', fr: '🇫🇷 Voix française' };
  for (const langue of ['en', 'fr']) {
    const disponibles = await voixPour(langue);
    if (!conteneur.isConnected) return;
    if (!disponibles.length) {
      if (langue === 'en') { alerte.textContent = AIDE_VOIX; alerte.hidden = false; }
      continue;
    }
    const choisie = await voixChoisie(langue);
    conteneur.insertAdjacentHTML('beforeend', `
      <div class="ligne-voix">
        <label>${libelles[langue]}
          <select class="champ" data-langue="${langue}">
            ${disponibles.map((v) => `<option ${v.name === choisie?.name ? 'selected' : ''}>${echapper(v.name)}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="bouton bouton-secondaire" data-essai="${langue}">▶ Essayer</button>
      </div>`);
  }
  conteneur.addEventListener('change', (evenement) => {
    const select = evenement.target.closest('select[data-langue]');
    if (!select) return;
    choisirVoix(select.dataset.langue, select.value);
    lire(EXEMPLES_VOIX[select.dataset.langue], select.dataset.langue);
  });
  conteneur.addEventListener('click', (evenement) => {
    const langue = evenement.target.closest('[data-essai]')?.dataset.essai;
    if (langue) lire(EXEMPLES_VOIX[langue], langue);
  });
}

function telechargerCsv(liste) {
  // L'apostrophe neutralise les formules qu'un tableur exécuterait (=, +, -, @).
  const cellule = (v) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
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
    <div class="bilan${score === 100 ? ' parfait' : ''}" tabindex="-1">
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
  zone.querySelector('.bilan').focus();
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
  await toutesLesListes(); // renseigne apiJoignable pour cocher « Publier » par défaut
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
        ${existante ? '' : `<label class="case"><input type="checkbox" name="publier" ${apiJoignable ? 'checked' : ''}> Publier aussi pour tout le monde (les autres promos pourront l’utiliser)</label>`}
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

  const boutonEnvoi = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (evenement) => {
    evenement.preventDefault();
    if (boutonEnvoi.disabled) return;
    boutonEnvoi.disabled = true;
    try {
      await enregistrer();
    } finally {
      boutonEnvoi.disabled = false;
    }
  });

  async function enregistrer() {
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
  }
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
  [/^#\/(a[1-3])$/i, (annee) => arriverParLienClasse(annee)],
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
