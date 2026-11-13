// Outils de texte : comparaison tolérante des réponses, nettoyage pour la synthèse vocale, dates.

const ARTICLES = /^(?:(?:an|a|the|to|une|un|les|le|la|des|du|de)\s+|l')/;

export function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function simplifier(texte) {
  return texte
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,;:!?"«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(ARTICLES, '')
    .trim();
}

/**
 * Réponses acceptées pour un texte à variantes séparées par « / ».
 * « fois/mensualités » ne remplace que le dernier mot (« payer en plusieurs mensualités ») ;
 * « a nappy / a diaper » donne deux expressions complètes.
 */
export function variantes(texte) {
  const parties = texte.split('/').map((partie) => partie.trim()).filter(Boolean);
  const formes = [parties[0] ?? ''];
  for (const partie of parties.slice(1)) {
    const precedente = formes.at(-1).split(/\s+/);
    const unSeulMot = !/\s/.test(partie.replace(/\([^)]*\)/g, '').trim());
    formes.push(unSeulMot && precedente.length > 1 ? [...precedente.slice(0, -1), partie].join(' ') : partie);
  }
  return [...new Set(formes.map(simplifier).filter(Boolean))];
}

function distance(a, b) {
  const ligne = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let precedent = ligne[0];
    ligne[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = ligne[j];
      ligne[j] = Math.min(ligne[j] + 1, ligne[j - 1] + 1, precedent + (a[i - 1] === b[j - 1] ? 0 : 1));
      precedent = temp;
    }
  }
  return ligne[b.length];
}

/**
 * Compare une saisie à la réponse attendue.
 * @returns {'juste'|'accents'|'presque'|'faux'}
 */
export function comparer(saisie, attendu) {
  const essai = simplifier(saisie);
  if (!essai) return 'faux';
  const formes = variantes(attendu);
  if (formes.includes(essai)) return 'juste';
  const essaiSansAccents = sansAccents(essai);
  if (formes.some((forme) => sansAccents(forme) === essaiSansAccents)) return 'accents';
  const tolerance = (forme) => (forme.length > 6 ? 1 : 0);
  if (formes.some((forme) => distance(sansAccents(forme), essaiSansAccents) <= tolerance(forme))) return 'presque';
  return 'faux';
}

/** Texte lisible par la synthèse vocale : sans parenthèses, « / » remplacé par une pause. */
export function pourLaVoix(texte) {
  return texte.replace(/\([^)]*\)/g, ' ').replace(/\s*\/\s*/g, ', ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
}

export function formaterDate(iso) {
  if (!iso) return '';
  const [annee, mois, jour] = iso.split('-').map(Number);
  return new Date(annee, mois - 1, jour).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function aujourdhui() {
  const maintenant = new Date();
  const decalage = maintenant.getTimezoneOffset() * 60000;
  return new Date(maintenant - decalage).toISOString().slice(0, 10);
}

export function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Échappe le texte saisi par les utilisateurs avant de l'insérer dans le HTML. */
export function echapper(texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
