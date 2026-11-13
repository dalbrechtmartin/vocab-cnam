// Outils de texte : comparaison tolérante des réponses, nettoyage pour la synthèse vocale, dates.

const ARTICLES = /^(?:(?:an|a|the|to|une|un|les|le|la|des|du|de)\s+|l')/;

export function sansAccents(texte) {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Mots de remplissage qu'on n'exige pas : « en avoir marre » vaut « en avoir marre de quelque chose ».
const REMPLISSAGE = /\b(?:de |d')?(?:quelque chose|qqch|qqc|quelqu'un|qqn)\b|\b(?:with |of |for |to |about )?(?:something|sth|someone|somebody|sb|smth)\b/g;

const NOMBRES = {
  zero: 0, zéro: 0, un: 1, one: 1, deux: 2, two: 2, trois: 3, three: 3, quatre: 4, four: 4, cinq: 5, five: 5,
  six: 6, sept: 7, seven: 7, huit: 8, eight: 8, neuf: 9, nine: 9, dix: 10, ten: 10,
};
// Le chiffre écrit en lettres vaut le chiffre, sauf l'article en tête (« un vêtement »).
const enChiffres = (texte) => texte.replace(/(?<=\S\s+)([a-zéè]+)\b/g, (mot) => (mot in NOMBRES ? String(NOMBRES[mot]) : mot));

function simplifier(texte) {
  return enChiffres(texte
    .toLowerCase()
    .replace(/[’`]/g, "'"))
    .replace(/\([^)]*\)/g, ' ')
    .replace(REMPLISSAGE, ' ')
    .replace(/[.,;:!?"«»\-–—_]/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(ARTICLES, '')
    .trim();
}

/**
 * Réponses acceptées pour un texte à variantes séparées par « / » : la forme recopiée telle quelle,
 * plus chaque variante. « fois/mensualités » ne remplace que le dernier mot (« payer en plusieurs mensualités ») ;
 * « a nappy / a diaper » donne deux expressions complètes.
 */
export function variantes(texte) {
  const parties = texte.split('/').map((partie) => partie.trim()).filter(Boolean);
  const formes = [texte, parties[0] ?? ''];
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
  // Environ une faute de frappe tolérée tous les 5 caractères (aucune sur les mots très courts).
  const tolerance = (forme) => (forme.length <= 3 ? 0 : Math.max(1, Math.floor(forme.length / 5)));
  const compact = (texte) => texte.replace(/[\s/']/g, '');
  if (formes.some((forme) => distance(compact(sansAccents(forme)), compact(essaiSansAccents)) <= tolerance(forme))) return 'presque';
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
