// Lecture à voix haute avec la synthèse vocale du navigateur (gratuite, sans serveur).
import { pourLaVoix } from './texte.js';

const LANGUES = { en: 'en-GB', fr: 'fr-FR' };
const CLE_VOIX = 'vocab.voix';
// Voix de meilleure qualité d'abord : neuronales (Edge), Google (Chrome), puis Apple et Microsoft locales.
const QUALITE = [/natural|neural|online/i, /google/i, /premium|enhanced|siri/i];

let voix = [];
const pret = new Promise((resoudre) => {
  if (!('speechSynthesis' in window)) return resoudre();
  const charger = () => {
    voix = window.speechSynthesis.getVoices();
    if (voix.length) resoudre();
  };
  charger();
  window.speechSynthesis.addEventListener('voiceschanged', charger);
  setTimeout(resoudre, 2000); // certains navigateurs n'envoient jamais l'événement
});

const langueDe = (v) => v.lang.replace('_', '-').toLowerCase();

function lireChoix() {
  try {
    return JSON.parse(localStorage.getItem(CLE_VOIX)) ?? {};
  } catch {
    return {};
  }
}

export const voixDisponible = () => 'speechSynthesis' in window;

/** Voix de l'appareil pour une langue, les meilleures en premier (anglais britannique avant les autres). */
export async function voixPour(langue) {
  await pret;
  const score = (v) => {
    const qualite = QUALITE.findIndex((motif) => motif.test(v.name));
    return (qualite === -1 ? QUALITE.length : qualite) * 2 + (langueDe(v) === LANGUES[langue].toLowerCase() ? 0 : 1);
  };
  return voix.filter((v) => langueDe(v).startsWith(langue)).sort((a, b) => score(a) - score(b));
}

export function choisirVoix(langue, nom) {
  try {
    localStorage.setItem(CLE_VOIX, JSON.stringify({ ...lireChoix(), [langue]: nom }));
  } catch {
    // Stockage indisponible : le choix vaut pour cette page seulement.
  }
}

export async function voixChoisie(langue) {
  const disponibles = await voixPour(langue);
  return disponibles.find((v) => v.name === lireChoix()[langue]) ?? disponibles[0] ?? null;
}

/** @param {'en'|'fr'} langue */
export async function lire(texte, langue) {
  if (!voixDisponible()) return;
  const choisie = await voixChoisie(langue);
  window.speechSynthesis.cancel();
  const enonce = new SpeechSynthesisUtterance(pourLaVoix(texte));
  enonce.lang = choisie?.lang ?? LANGUES[langue];
  if (choisie) enonce.voice = choisie;
  enonce.rate = 0.9;
  window.speechSynthesis.speak(enonce);
}
