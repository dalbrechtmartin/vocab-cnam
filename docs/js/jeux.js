// Les jeux d'apprentissage. Chaque jeu reçoit un conteneur, la liste, le sens de traduction et une fonction de fin.
import { boite, noterReponse } from './donnees.js';
import { comparer, echapper, melanger } from './texte.js';
import { lire, voixDisponible } from './voix.js';

const MOTS_PAR_PARTIE = 20;
const PAIRES_PAR_MANCHE = 6;

export const JEUX = [
  { id: 'cartes', nom: 'Cartes à retourner', icone: '🃏', description: 'Retourne la carte, dis si tu savais. Idéal pour une première découverte.' },
  { id: 'qcm', nom: 'Choix multiple', icone: '✅', description: 'Trouve la bonne traduction parmi quatre propositions.' },
  { id: 'paires', nom: 'Paires', icone: '🧩', description: 'Associe chaque mot anglais à sa traduction le plus vite possible.' },
  { id: 'ecrire', nom: 'Écrire', icone: '✍️', description: 'Écris la traduction. Les petites fautes et les accents sont signalés.' },
  { id: 'dictee', nom: 'Dictée', icone: '🎧', description: 'Écoute le mot anglais et écris-le correctement.', voix: true },
];

/** Côté question et côté réponse d'un mot selon le sens choisi. */
function faces(mot, sens) {
  return sens === 'en-fr'
    ? { question: mot.en, reponse: mot.fr, langueQuestion: 'en', langueReponse: 'fr' }
    : { question: mot.fr, reponse: mot.en, langueQuestion: 'fr', langueReponse: 'en' };
}

/** Mots les moins maîtrisés d'abord, mélangés à niveau égal. */
function ordreDeRevision(liste) {
  const melanges = melanger(liste.mots);
  return melanges.sort((a, b) => boite(liste.id, a) - boite(liste.id, b)).slice(0, MOTS_PAR_PARTIE);
}

const DRAPEAUX = { en: '🇬🇧', fr: '🇫🇷' };
const NOMS_LANGUES = { en: 'anglais', fr: 'français' };

export function boutonAudio(texte, langue) {
  if (!voixDisponible()) return '';
  return `<button type="button" class="bouton-audio" data-lire="${langue}" data-texte="${echapper(texte)}" aria-label="Écouter en ${NOMS_LANGUES[langue]}">🔊 <span aria-hidden="true">${DRAPEAUX[langue]}</span></button>`;
}

export function brancherAudio(conteneur) {
  conteneur.addEventListener('click', (evenement) => {
    const bouton = evenement.target.closest('[data-lire]');
    if (bouton) lire(bouton.dataset.texte, bouton.dataset.lire);
  });
}

function barre(index, total) {
  return `<div class="progression-partie"><progress max="${total}" value="${index}" aria-label="Progression"></progress><span>${index} / ${total}</span></div>`;
}

const RETOURS = {
  juste: { classe: 'juste', texte: 'Bravo, c’est juste !' },
  accents: { classe: 'presque', texte: 'Juste, mais attention aux accents :' },
  presque: { classe: 'presque', texte: 'Presque ! Une petite faute. La bonne réponse :' },
  faux: { classe: 'faux', texte: 'Pas tout à fait. La bonne réponse :' },
};

// --- Cartes à retourner ---

function cartes(conteneur, liste, sens, terminer) {
  let file = ordreDeRevision(liste);
  const total = file.length;
  let acquis = 0;
  const aRevoir = new Set();

  function afficher() {
    if (!file.length) return terminer({ justes: total - aRevoir.size, total, aRevoir: [...aRevoir] });
    const mot = file[0];
    const { question, reponse, langueQuestion, langueReponse } = faces(mot, sens);
    conteneur.innerHTML = `
      ${barre(acquis, total)}
      <div class="carte-scene">
        <button type="button" class="carte" aria-pressed="false" aria-label="Retourner la carte">
          <span class="carte-face carte-recto"><span class="carte-texte">${echapper(question)}</span><span class="carte-aide">Clique ou appuie sur Espace pour retourner</span></span>
          <span class="carte-face carte-verso"><span class="carte-texte">${echapper(reponse)}</span></span>
        </button>
      </div>
      <div class="rangee-audio">${boutonAudio(question, langueQuestion)}${boutonAudio(reponse, langueReponse)}</div>
      <div class="actions-carte" hidden>
        <button type="button" class="bouton bouton-revoir" data-reponse="non">À revoir <kbd>←</kbd></button>
        <button type="button" class="bouton bouton-su" data-reponse="oui">Je savais <kbd>→</kbd></button>
      </div>`;
    const carte = conteneur.querySelector('.carte');
    const actions = conteneur.querySelector('.actions-carte');
    const retourner = () => {
      const retournee = carte.classList.toggle('retournee');
      carte.setAttribute('aria-pressed', String(retournee));
      actions.hidden = false;
      if (retournee) lire(reponse, langueReponse);
    };
    carte.addEventListener('click', retourner);
    actions.addEventListener('click', (evenement) => {
      const choix = evenement.target.closest('[data-reponse]')?.dataset.reponse;
      if (choix) repondre(choix === 'oui');
    });
    carte.focus();
    clavier = (evenement) => {
      if (evenement.key === ' ' && evenement.target === document.body) { evenement.preventDefault(); retourner(); }
      if (!actions.hidden && evenement.key === 'ArrowRight') repondre(true);
      if (!actions.hidden && evenement.key === 'ArrowLeft') repondre(false);
    };
  }

  function repondre(su) {
    const mot = file.shift();
    noterReponse(liste.id, mot, su);
    if (su) acquis++;
    else { aRevoir.add(mot); file.push(mot); }
    afficher();
  }

  let clavier = () => {};
  const ecouteur = (evenement) => clavier(evenement);
  document.addEventListener('keydown', ecouteur);
  afficher();
  return () => document.removeEventListener('keydown', ecouteur);
}

// --- Choix multiple ---

function qcm(conteneur, liste, sens, terminer) {
  const file = ordreDeRevision(liste);
  let index = 0;
  let justes = 0;
  const aRevoir = [];
  let clavier = () => {};

  function afficher() {
    if (index >= file.length) return terminer({ justes, total: file.length, aRevoir });
    const mot = file[index];
    const { question, reponse, langueQuestion, langueReponse } = faces(mot, sens);
    const intrus = melanger(liste.mots.filter((m) => faces(m, sens).reponse !== reponse)).slice(0, 3).map((m) => faces(m, sens).reponse);
    const choix = melanger([reponse, ...intrus]);
    conteneur.innerHTML = `
      ${barre(index, file.length)}
      <p class="consigne">Quelle est la traduction de :</p>
      <p class="question">${echapper(question)} ${boutonAudio(question, langueQuestion)}</p>
      <div class="choix" role="group" aria-label="Propositions">
        ${choix.map((c, i) => `<button type="button" class="bouton-choix" data-choix="${i}"><kbd>${i + 1}</kbd> ${echapper(c)}</button>`).join('')}
      </div>
      <p class="retour" role="status" aria-live="polite"></p>
      <button type="button" class="bouton bouton-suivant" hidden>Suivant <kbd>Entrée</kbd></button>`;
    lire(question, langueQuestion);
    const boutons = [...conteneur.querySelectorAll('.bouton-choix')];
    const suivant = conteneur.querySelector('.bouton-suivant');
    const retour = conteneur.querySelector('.retour');
    let repondu = false;
    const choisir = (i) => {
      if (repondu || !boutons[i]) return;
      repondu = true;
      const bon = choix[i] === reponse;
      noterReponse(liste.id, mot, bon);
      if (bon) justes++; else aRevoir.push(mot);
      boutons.forEach((b, j) => {
        b.disabled = true;
        if (choix[j] === reponse) b.classList.add('juste');
        else if (j === i) b.classList.add('faux');
      });
      retour.className = `retour ${bon ? 'juste' : 'faux'}`;
      retour.textContent = bon ? 'Bravo !' : `La bonne réponse : ${reponse}`;
      lire(reponse, langueReponse);
      suivant.hidden = false;
      suivant.focus();
    };
    boutons.forEach((b, i) => b.addEventListener('click', () => choisir(i)));
    suivant.addEventListener('click', () => { index++; afficher(); });
    clavier = (evenement) => {
      if (/^[1-4]$/.test(evenement.key)) choisir(Number(evenement.key) - 1);
    };
  }

  const ecouteur = (evenement) => clavier(evenement);
  document.addEventListener('keydown', ecouteur);
  afficher();
  return () => document.removeEventListener('keydown', ecouteur);
}

// --- Écrire et dictée ---

function saisie(conteneur, liste, sens, terminer, dictee) {
  const file = ordreDeRevision(liste);
  let index = 0;
  let justes = 0;
  const aRevoir = [];

  function afficher() {
    if (index >= file.length) return terminer({ justes, total: file.length, aRevoir });
    const mot = file[index];
    const { question, reponse, langueQuestion, langueReponse } = dictee
      ? { question: mot.en, reponse: mot.en, langueQuestion: 'en', langueReponse: 'en' }
      : faces(mot, sens);
    const enonce = dictee
      ? `<p class="consigne">Écoute et écris le mot anglais :</p><p class="question"><button type="button" class="bouton bouton-ecouter" data-lire="en" data-texte="${echapper(question)}">🔊 Réécouter</button></p><p class="indice-dictee">Indice : ${echapper(mot.fr)}</p>`
      : `<p class="consigne">Écris la traduction en ${NOMS_LANGUES[langueReponse]} de :</p><p class="question">${echapper(question)} ${boutonAudio(question, langueQuestion)}</p>`;
    conteneur.innerHTML = `
      ${barre(index, file.length)}
      ${enonce}
      <form class="formulaire-saisie" autocomplete="off">
        <label class="visuellement-cache" for="reponse">Ta réponse</label>
        <input id="reponse" class="champ" type="text" lang="${langueReponse}" spellcheck="false" autocapitalize="off" required>
        <div class="actions-saisie">
          <button type="button" class="bouton bouton-secondaire" data-action="indice">Indice</button>
          <button type="button" class="bouton bouton-secondaire" data-action="passer">Je ne sais pas</button>
          <button type="submit" class="bouton">Valider</button>
        </div>
      </form>
      <p class="retour" role="status" aria-live="polite"></p>
      <button type="button" class="bouton bouton-suivant" hidden>Suivant <kbd>Entrée</kbd></button>`;
    if (dictee) lire(question, 'en');
    else lire(question, langueQuestion);
    const formulaire = conteneur.querySelector('form');
    const champ = conteneur.querySelector('#reponse');
    const retour = conteneur.querySelector('.retour');
    const suivant = conteneur.querySelector('.bouton-suivant');
    let lettres = 0;
    champ.focus();

    const corriger = (resultat) => {
      const bon = resultat === 'juste' || resultat === 'accents' || resultat === 'presque';
      noterReponse(liste.id, mot, bon);
      if (bon) justes++; else aRevoir.push(mot);
      const { classe, texte } = RETOURS[resultat];
      retour.className = `retour ${classe}`;
      retour.innerHTML = resultat === 'juste' ? texte : `${texte} <strong>${echapper(reponse)}</strong>`;
      champ.disabled = true;
      formulaire.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      lire(reponse, langueReponse);
      suivant.hidden = false;
      suivant.focus();
    };

    formulaire.addEventListener('submit', (evenement) => {
      evenement.preventDefault();
      corriger(comparer(champ.value, reponse));
    });
    formulaire.addEventListener('click', (evenement) => {
      const action = evenement.target.closest('[data-action]')?.dataset.action;
      if (action === 'passer') corriger('faux');
      if (action === 'indice') {
        lettres = Math.min(lettres + 1, reponse.length);
        champ.value = reponse.slice(0, lettres);
        champ.focus();
      }
    });
    suivant.addEventListener('click', () => { index++; afficher(); });
  }

  afficher();
  return () => {};
}

// --- Paires ---

function paires(conteneur, liste, _sens, terminer) {
  const manches = [];
  const ordre = ordreDeRevision(liste);
  for (let i = 0; i < ordre.length; i += PAIRES_PAR_MANCHE) manches.push(ordre.slice(i, i + PAIRES_PAR_MANCHE));
  let manche = 0;
  let erreurs = 0;
  const aRevoir = new Set();
  const debut = performance.now();

  function afficher() {
    if (manche >= manches.length) {
      const secondes = Math.round((performance.now() - debut) / 1000);
      return terminer({ justes: ordre.length - aRevoir.size, total: ordre.length, aRevoir: [...aRevoir], detail: `${secondes} s, ${erreurs} erreur${erreurs > 1 ? 's' : ''}` });
    }
    const mots = manches[manche];
    const tuiles = melanger(mots.flatMap((mot, i) => [{ i, texte: mot.en, langue: 'en' }, { i, texte: mot.fr, langue: 'fr' }]));
    conteneur.innerHTML = `
      ${barre(manche, manches.length)}
      <p class="consigne">Associe chaque mot anglais 🇬🇧 à sa traduction 🇫🇷.</p>
      <div class="grille-paires">
        ${tuiles.map((t, k) => `<button type="button" class="tuile tuile-${t.langue}" data-k="${k}" lang="${t.langue}">${echapper(t.texte)}</button>`).join('')}
      </div>
      <p class="retour" role="status" aria-live="polite"></p>`;
    const boutons = [...conteneur.querySelectorAll('.tuile')];
    const retour = conteneur.querySelector('.retour');
    let selection = null;
    let trouvees = 0;
    boutons.forEach((bouton, k) => bouton.addEventListener('click', () => {
      const tuile = tuiles[k];
      lire(tuile.texte, tuile.langue);
      if (selection === null) { selection = k; bouton.classList.add('choisie'); return; }
      if (selection === k) { selection = null; bouton.classList.remove('choisie'); return; }
      const autre = tuiles[selection];
      const precedent = boutons[selection];
      selection = null;
      precedent.classList.remove('choisie');
      if (autre.i === tuile.i && autre.langue !== tuile.langue) {
        [precedent, bouton].forEach((b) => { b.classList.add('trouvee'); b.disabled = true; });
        noterReponse(liste.id, mots[tuile.i], !aRevoir.has(mots[tuile.i]));
        trouvees++;
        retour.textContent = `Paire trouvée : ${mots[tuile.i].en} = ${mots[tuile.i].fr}`;
        if (trouvees === mots.length) setTimeout(() => { manche++; afficher(); }, 700);
      } else {
        erreurs++;
        [autre, tuile].forEach((t) => aRevoir.add(mots[t.i]));
        [precedent, bouton].forEach((b) => { b.classList.add('erreur'); setTimeout(() => b.classList.remove('erreur'), 500); });
        retour.textContent = 'Ce n’est pas une paire, réessaie.';
      }
    }));
  }

  afficher();
  return () => {};
}

const MOTEURS = {
  cartes,
  qcm,
  paires,
  ecrire: (c, l, s, t) => saisie(c, l, s, t, false),
  dictee: (c, l, s, t) => saisie(c, l, s, t, true),
};

/** Lance un jeu ; renvoie une fonction de nettoyage (écouteurs clavier). */
export function lancerJeu(id, conteneur, liste, sens, terminer) {
  return MOTEURS[id](conteneur, liste, sens, terminer);
}
