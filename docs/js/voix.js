// Lecture à voix haute avec la synthèse vocale du navigateur (gratuite, sans serveur).
import { pourLaVoix } from './texte.js';

const LANGUES = { en: ['en-GB', 'en-US', 'en'], fr: ['fr-FR', 'fr'] };
let voix = [];

function chargerVoix() {
  voix = window.speechSynthesis?.getVoices() ?? [];
}

if ('speechSynthesis' in window) {
  chargerVoix();
  window.speechSynthesis.addEventListener('voiceschanged', chargerVoix);
}

function choisirVoix(langue) {
  for (const code of LANGUES[langue]) {
    const trouvee = voix.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(code.toLowerCase()));
    if (trouvee) return trouvee;
  }
  return null;
}

export const voixDisponible = () => 'speechSynthesis' in window;

/** @param {'en'|'fr'} langue */
export function lire(texte, langue) {
  if (!voixDisponible()) return;
  window.speechSynthesis.cancel();
  const enonce = new SpeechSynthesisUtterance(pourLaVoix(texte));
  enonce.lang = LANGUES[langue][0];
  const choisie = choisirVoix(langue);
  if (choisie) enonce.voice = choisie;
  enonce.rate = 0.9;
  window.speechSynthesis.speak(enonce);
}
