// API de partage des listes de vocabulaire : Node.js et SQLite intégrés, sans dépendance.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? 8080);
const DOSSIER_DONNEES = process.env.DOSSIER_DONNEES ?? '/data';
const ORIGINES = (process.env.ORIGINES_AUTORISEES ?? 'https://dalbrechtmartin.github.io').split(',').map((o) => o.trim());
const CLE_ADMIN = process.env.CLE_ADMIN ?? '';
const ANNEES = ['A1', 'A2', 'A3'];
const LIMITE_MOTS = 150;
const LIMITE_TEXTE = 150;
const LIMITE_CORPS = 50_000;
const ECRITURES_PAR_HEURE = 30;
const ECRITURES_GLOBALES_PAR_HEURE = 300;
const LIMITE_LISTES = 1000;

mkdirSync(DOSSIER_DONNEES, { recursive: true });
const base = new DatabaseSync(`${DOSSIER_DONNEES}/vocab.sqlite`);
base.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS listes (
    id TEXT PRIMARY KEY,
    contenu TEXT NOT NULL,
    empreinte_cle TEXT NOT NULL,
    cree_le TEXT NOT NULL DEFAULT (datetime('now')),
    modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const requetes = {
  toutes: base.prepare('SELECT id, contenu FROM listes ORDER BY json_extract(contenu, \'$.dateSeance\') DESC'),
  une: base.prepare('SELECT id, contenu, empreinte_cle FROM listes WHERE id = ?'),
  creer: base.prepare('INSERT INTO listes (id, contenu, empreinte_cle) VALUES (?, ?, ?)'),
  modifier: base.prepare('UPDATE listes SET contenu = ?, modifie_le = datetime(\'now\') WHERE id = ?'),
  supprimer: base.prepare('DELETE FROM listes WHERE id = ?'),
  compter: base.prepare('SELECT COUNT(*) AS total FROM listes'),
};

const empreinte = (cle) => createHash('sha256').update(cle).digest();

function cleValide(cleFournie, empreinteStockee) {
  if (!cleFournie) return false;
  const empreinteFournie = empreinte(cleFournie);
  if (CLE_ADMIN && timingSafeEqual(empreinteFournie, empreinte(CLE_ADMIN))) return true;
  return timingSafeEqual(empreinteFournie, Buffer.from(empreinteStockee, 'hex'));
}

class ErreurClient extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

// Retire les caractères de contrôle et les débuts de formule (=, +, -, @) qui piégeraient un export tableur.
const texte = (valeur) => (typeof valeur === 'string'
  ? valeur.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/^[=+\-@]+/, '').trim().slice(0, LIMITE_TEXTE)
  : '');
const date = (valeur) => (typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? valeur : '');

function validerListe(corps) {
  if (!corps || typeof corps !== 'object' || !Array.isArray(corps.mots)) throw new ErreurClient(400, 'Liste invalide.');
  const mots = corps.mots
    .map((mot) => ({ en: texte(mot?.en), fr: texte(mot?.fr) }))
    .filter((mot) => mot.en && mot.fr);
  if (!mots.length) throw new ErreurClient(400, 'Il faut au moins un mot avec sa traduction.');
  if (mots.length > LIMITE_MOTS) throw new ErreurClient(400, `${LIMITE_MOTS} mots au maximum par liste.`);
  const dateSeance = date(corps.dateSeance);
  if (!dateSeance) throw new ErreurClient(400, 'La date de la séance est obligatoire.');
  return {
    dateSeance,
    aApprendrePour: date(corps.aApprendrePour),
    annee: ANNEES.includes(corps.annee) ? corps.annee : 'A1',
    prof: texte(corps.prof),
    promo: texte(corps.promo),
    mots,
  };
}

// Limite des écritures en mémoire : par client (IPv6 regroupées par /64) et au total.
const HEURE = 3_600_000;
const ecritures = new Map();
let ecrituresGlobales = [];

// IPv6 regroupées par /48 : un hébergeur en attribue souvent un entier à une seule machine.
const client = (ip) => (ip.includes(':') ? ip.split(':').slice(0, 3).join(':') : ip);

function verifierQuota(ip) {
  const maintenant = Date.now();
  const recentes = (ecritures.get(client(ip)) ?? []).filter((t) => maintenant - t < HEURE);
  ecritures.set(client(ip), recentes);
  ecrituresGlobales = ecrituresGlobales.filter((t) => maintenant - t < HEURE);
  if (recentes.length >= ECRITURES_PAR_HEURE || ecrituresGlobales.length >= ECRITURES_GLOBALES_PAR_HEURE) {
    throw new ErreurClient(429, 'Trop de modifications, réessaie dans une heure.');
  }
}

/** Compte une écriture ; un essai refusé (mauvaise clé) ne pèse que sur son auteur, pas sur le quota de tous. */
function compterEcriture(ip, { globale = true } = {}) {
  ecritures.get(client(ip)).push(Date.now());
  if (globale) ecrituresGlobales.push(Date.now());
}

// Réponse de GET /api/listes gardée sérialisée jusqu'à la prochaine écriture.
let listesSerialisees = null;
class Brut {
  constructor(texte) {
    this.texte = texte;
  }
}
const toutesSerialisees = () => (listesSerialisees ??= new Brut(JSON.stringify(requetes.toutes.all().map(enListe))));
const invaliderCache = () => { listesSerialisees = null; };

setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, horaires] of ecritures) {
    if (horaires.every((t) => maintenant - t >= HEURE)) ecritures.delete(cle);
  }
}, HEURE).unref();

async function lireCorps(requete) {
  let taille = 0;
  const morceaux = [];
  for await (const morceau of requete) {
    taille += morceau.length;
    if (taille > LIMITE_CORPS) throw new ErreurClient(413, 'Liste trop volumineuse.');
    morceaux.push(morceau);
  }
  try {
    return JSON.parse(Buffer.concat(morceaux).toString('utf8'));
  } catch {
    throw new ErreurClient(400, 'JSON invalide.');
  }
}

function entetes(requete) {
  const origine = requete.headers.origin;
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    ...(ORIGINES.includes(origine) && {
      'Access-Control-Allow-Origin': origine,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }),
  };
}

const enListe = (ligne) => ({ id: ligne.id, ...JSON.parse(ligne.contenu) });

async function traiter(requete) {
  const { pathname } = new URL(requete.url, 'http://localhost');
  const ip = String(requete.headers['x-forwarded-for'] ?? requete.socket.remoteAddress).split(',').at(-1).trim(); // Traefik ajoute l'IP réelle en dernier

  if (requete.method === 'OPTIONS') return [204, null];
  if (pathname === '/sante') return [200, { ok: true }];

  if (pathname === '/api/listes') {
    if (requete.method === 'GET') return [200, toutesSerialisees()];
    if (requete.method === 'POST') {
      verifierQuota(ip);
      if (requetes.compter.get().total >= LIMITE_LISTES) throw new ErreurClient(507, 'Le serveur de partage est plein, préviens la personne qui le gère.');
      const liste = validerListe(await lireCorps(requete));
      compterEcriture(ip);
      const id = randomUUID();
      const cleEdition = randomBytes(24).toString('base64url');
      requetes.creer.run(id, JSON.stringify(liste), empreinte(cleEdition).toString('hex'));
      invaliderCache();
      return [201, { id, cleEdition }];
    }
  }

  const correspondance = pathname.match(/^\/api\/listes\/([\w-]{1,64})$/);
  if (correspondance) {
    const ligne = requetes.une.get(correspondance[1]);
    if (!ligne) throw new ErreurClient(404, 'Liste introuvable.');
    if (requete.method === 'GET') return [200, enListe(ligne)];
    const cle = String(requete.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!['PUT', 'DELETE'].includes(requete.method)) throw new ErreurClient(405, 'Méthode non autorisée.');
    verifierQuota(ip);
    if (!cleValide(cle, ligne.empreinte_cle)) {
      compterEcriture(ip, { globale: false });
      throw new ErreurClient(403, 'Seule la personne qui a publié cette liste peut la modifier.');
    }
    compterEcriture(ip);
    if (requete.method === 'PUT') {
      requetes.modifier.run(JSON.stringify(validerListe(await lireCorps(requete))), ligne.id);
      invaliderCache();
      return [200, enListe(requetes.une.get(ligne.id))];
    }
    requetes.supprimer.run(ligne.id);
    invaliderCache();
    return [204, null];
  }

  throw new ErreurClient(404, 'Introuvable.');
}

createServer(async (requete, reponse) => {
  let statut;
  let corps;
  try {
    [statut, corps] = await traiter(requete);
  } catch (erreur) {
    statut = erreur instanceof ErreurClient ? erreur.statut : 500;
    corps = { erreur: erreur instanceof ErreurClient ? erreur.message : 'Erreur interne.' };
    if (statut === 500) console.error(erreur);
  }
  reponse.writeHead(statut, entetes(requete));
  reponse.end(corps === null ? undefined : corps instanceof Brut ? corps.texte : JSON.stringify(corps));
}).listen(PORT, () => console.log(`API vocab-cnam à l’écoute sur le port ${PORT}`));
