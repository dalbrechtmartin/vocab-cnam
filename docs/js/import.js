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

/** Chemin de la première feuille du classeur (pas forcément sheet1.xml). */
async function cheminPremiereFeuille(lire) {
  const classeur = await lire('xl/workbook.xml');
  const relations = await lire('xl/_rels/workbook.xml.rels');
  const premiere = classeur && analyserXml(classeur).getElementsByTagNameNS(S, 'sheet')[0];
  const idRelation = premiere?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relation = relations && [...analyserXml(relations).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === idRelation);
  const cible = relation?.getAttribute('Target');
  if (!cible) return 'xl/worksheets/sheet1.xml';
  return cible.startsWith('/') ? cible.slice(1) : `xl/${cible}`;
}

async function lignesXlsx(lire) {
  const partages = await lire('xl/sharedStrings.xml');
  const chaines = partages
    ? [...analyserXml(partages).getElementsByTagNameNS(S, 'si')].map((si) => [...si.getElementsByTagNameNS(S, 't')].map((t) => t.textContent).join(''))
    : [];
  const contenu = await lire(await cheminPremiereFeuille(lire));
  if (!contenu) throw new Error('Feuille Excel introuvable dans ce fichier.');
  return [...analyserXml(contenu).getElementsByTagNameNS(S, 'row')].map((ligne) => {
    const valeurs = [];
    let colonne = 0;
    for (const cellule of ligne.getElementsByTagNameNS(S, 'c')) {
      const type = cellule.getAttribute('t');
      const brute = cellule.getElementsByTagNameNS(S, 'v')[0]?.textContent ?? cellule.getElementsByTagNameNS(S, 't')[0]?.textContent ?? '';
      const reference = cellule.getAttribute('r');
      colonne = reference ? indiceColonne(reference) : colonne;
      valeurs[colonne++] = type === 's' ? chaines[Number(brute)] : brute;
    }
    return Array.from(valeurs, (v) => (v ?? '').trim());
  });
}

/** Lecture CSV avec champs entre guillemets ; séparateur détecté sur la première ligne (; , ou tabulation). */
function lignesCsv(texte) {
  const premiere = texte.split(/\r?\n/, 1)[0];
  const separateur = ['\t', ';', ','].reduce((meilleur, s) => (premiere.split(s).length > premiere.split(meilleur).length ? s : meilleur), ';');
  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') entreGuillemets = false;
      else champ += c;
    } else if (c === '"' && champ === '') entreGuillemets = true;
    else if (c === separateur) { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      lignes.push([...ligne, champ]);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ || ligne.length) lignes.push([...ligne, champ]);
  // Retire l'apostrophe ajoutée à l'export pour neutraliser les formules.
  return lignes.map((l) => l.map((v) => v.replace(/^'(?=[=+\-@])/, '').trim()));
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

const ENTETE_EN = /^(anglais|english|en|mot|word|vocabulaire|vocabulary)$/i;
const ENTETE_FR = /^(français|francais|french|fr|traduction|translation)$/i;

const valeur = (cellule) => String(cellule ?? '').trim();

/**
 * Repère les colonnes anglais et français (grâce à l'en-tête, sinon les deux colonnes les plus remplies
 * de texte, en ignorant les numéros) puis garde les lignes où les deux sont remplies.
 */
export function lignesEnMots(lignes) {
  const indexEntete = lignes.findIndex((ligne) => ligne.some((c) => ENTETE_EN.test(valeur(c))) && ligne.some((c) => ENTETE_FR.test(valeur(c))));
  let colonneEn;
  let colonneFr;
  if (indexEntete >= 0) {
    colonneEn = lignes[indexEntete].findIndex((c) => ENTETE_EN.test(valeur(c)));
    colonneFr = lignes[indexEntete].findIndex((c) => ENTETE_FR.test(valeur(c)));
  } else {
    const largeur = Math.max(0, ...lignes.map((ligne) => ligne.length));
    const remplissage = Array.from({ length: largeur }, (_, colonne) => ({
      colonne,
      total: lignes.filter((ligne) => /\p{L}/u.test(valeur(ligne[colonne]))).length,
    }));
    [colonneEn, colonneFr] = remplissage.sort((a, b) => b.total - a.total).slice(0, 2).map((r) => r.colonne).sort((a, b) => a - b);
  }
  if (colonneEn === undefined || colonneFr === undefined) return [];
  return lignes
    .filter((_, index) => index !== indexEntete)
    .map((ligne) => ({ en: valeur(ligne[colonneEn]), fr: valeur(ligne[colonneFr]) }))
    .filter((mot) => mot.en && mot.fr);
}

/** @returns {Promise<{en: string, fr: string}[]>} */
export async function importerFichier(fichier) {
  const nom = fichier.name.toLowerCase();
  if (nom.endsWith('.docx')) return lignesEnMots(await lignesDocx(await lireZip(await fichier.arrayBuffer())));
  if (nom.endsWith('.xlsx')) return lignesEnMots(await lignesXlsx(await lireZip(await fichier.arrayBuffer())));
  if (nom.endsWith('.csv') || nom.endsWith('.tsv')) return lignesEnMots(lignesCsv(await fichier.text()));
  if (nom.endsWith('.txt')) return lignesEnMots(lignesTexte(await fichier.text()));
  throw new Error('Format non pris en charge : utilise un fichier .docx, .xlsx, .csv ou .txt (les anciens .doc et .xls sont à réenregistrer au nouveau format).');
}
