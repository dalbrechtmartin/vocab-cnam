// Import de vocabulaire depuis un fichier Word (.docx), Excel (.xlsx), CSV ou du texte collé, sans bibliothèque.

/** Lit les fichiers d'une archive ZIP (format des .docx et .xlsx) avec la décompression native du navigateur. */
async function lireZip(tampon) {
  const vue = new DataView(tampon);
  let fin = tampon.byteLength - 22;
  while (fin >= 0 && vue.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('Fichier illisible : ce n’est pas un document Word ou Excel.');
  const nombre = vue.getUint16(fin + 10, true);
  let position = vue.getUint32(fin + 16, true);
  const fichiers = new Map();
  for (let i = 0; i < nombre; i++) {
    const methode = vue.getUint16(position + 10, true);
    const tailleCompressee = vue.getUint32(position + 20, true);
    const longueurNom = vue.getUint16(position + 28, true);
    const longueurExtra = vue.getUint16(position + 30, true);
    const longueurCommentaire = vue.getUint16(position + 32, true);
    const decalageLocal = vue.getUint32(position + 42, true);
    const nom = new TextDecoder().decode(new Uint8Array(tampon, position + 46, longueurNom));
    fichiers.set(nom, { methode, tailleCompressee, decalageLocal });
    position += 46 + longueurNom + longueurExtra + longueurCommentaire;
  }
  return async (nom) => {
    const entree = fichiers.get(nom);
    if (!entree) return null;
    const debut = entree.decalageLocal + 30 + vue.getUint16(entree.decalageLocal + 26, true) + vue.getUint16(entree.decalageLocal + 28, true);
    const donnees = new Uint8Array(tampon, debut, entree.tailleCompressee);
    if (entree.methode === 0) return new TextDecoder().decode(donnees);
    const flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flux).text();
  };
}

const analyserXml = (texte) => new DOMParser().parseFromString(texte, 'application/xml');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function texteDeCellule(cellule) {
  return [...cellule.getElementsByTagNameNS(W, 'p')]
    .map((paragraphe) => [...paragraphe.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join(''))
    .join(' ')
    .trim();
}

async function lignesDocx(lire) {
  const document = analyserXml(await lire('word/document.xml'));
  const lignes = [...document.getElementsByTagNameNS(W, 'tr')].map((ligne) => [...ligne.getElementsByTagNameNS(W, 'tc')].map(texteDeCellule));
  if (lignes.length) return lignes;
  // Pas de tableau : une paire par paragraphe, séparée par une tabulation, « = », « : » ou un tiret.
  const paragraphes = [...document.getElementsByTagNameNS(W, 'p')].map((p) =>
    [...p.childNodes].map((n) => (n.localName === 'r' ? [...n.childNodes].map((c) => (c.localName === 'tab' ? '\t' : c.textContent)).join('') : '')).join(''),
  );
  return lignesTexte(paragraphes.join('\n'));
}

function indiceColonne(reference) {
  const lettres = reference.replace(/\d+/g, '');
  return [...lettres].reduce((total, lettre) => total * 26 + lettre.charCodeAt(0) - 64, 0) - 1;
}

async function lignesXlsx(lire) {
  const partages = await lire('xl/sharedStrings.xml');
  const chaines = partages
    ? [...analyserXml(partages).getElementsByTagNameNS(S, 'si')].map((si) => [...si.getElementsByTagNameNS(S, 't')].map((t) => t.textContent).join(''))
    : [];
  const feuille = analyserXml(await lire('xl/worksheets/sheet1.xml'));
  return [...feuille.getElementsByTagNameNS(S, 'row')].map((ligne) => {
    const valeurs = [];
    for (const cellule of ligne.getElementsByTagNameNS(S, 'c')) {
      const type = cellule.getAttribute('t');
      const brute = cellule.getElementsByTagNameNS(S, 'v')[0]?.textContent ?? cellule.getElementsByTagNameNS(S, 't')[0]?.textContent ?? '';
      valeurs[indiceColonne(cellule.getAttribute('r') ?? 'A')] = type === 's' ? chaines[Number(brute)] : brute;
    }
    return Array.from(valeurs, (v) => (v ?? '').trim());
  });
}

/** Texte collé (depuis Word, Excel, un mail…) : une paire par ligne. */
export function lignesTexte(texte) {
  return texte
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .map((ligne) => {
      for (const separateur of ['\t', ';', ' = ', ' : ', ' – ', ' — ', ' - ']) {
        if (ligne.includes(separateur)) {
          const [gauche, ...reste] = ligne.split(separateur);
          return [gauche, reste.join(separateur)].map((v) => v.trim());
        }
      }
      return [ligne];
    });
}

const ENTETES = /^(anglais|english|en|français|francais|french|fr|mot|word|traduction|translation)$/i;

/** Garde les lignes à deux colonnes remplies et retire la ligne d'en-tête éventuelle. */
export function lignesEnMots(lignes) {
  return lignes
    .map((ligne) => ligne.filter((v) => v !== undefined && String(v).trim() !== ''))
    .filter((ligne) => ligne.length >= 2)
    .filter((ligne) => !(ENTETES.test(ligne[0]) && ENTETES.test(ligne[1])))
    .map(([en, fr]) => ({ en: String(en).trim(), fr: String(fr).trim() }));
}

/** @returns {Promise<{en: string, fr: string}[]>} */
export async function importerFichier(fichier) {
  const nom = fichier.name.toLowerCase();
  if (nom.endsWith('.docx')) return lignesEnMots(await lignesDocx(await lireZip(await fichier.arrayBuffer())));
  if (nom.endsWith('.xlsx')) return lignesEnMots(await lignesXlsx(await lireZip(await fichier.arrayBuffer())));
  if (nom.endsWith('.csv') || nom.endsWith('.txt') || nom.endsWith('.tsv')) return lignesEnMots(lignesTexte(await fichier.text()));
  throw new Error('Format non pris en charge : utilise un fichier .docx, .xlsx, .csv ou .txt (les anciens .doc et .xls sont à réenregistrer au nouveau format).');
}
