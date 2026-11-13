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
const LIMITE_MOTS = 300;
const LIMITE_TEXTE = 200;
const LIMITE_CORPS = 100_000;
const ECRITURES_PAR_HEURE = 30;

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
};

const empreinte = (cle) => createHash('sha256').update(cle).digest();

function cleValide(cleFournie, empreinteStockee) {
  if (!cleFournie) return false;
  if (CLE_ADMIN && cleFournie.length === CLE_ADMIN.length && timingSafeEqual(Buffer.from(cleFournie), Buffer.from(CLE_ADMIN))) return true;
  return timingSafeEqual(empreinte(cleFournie), Buffer.from(empreinteStockee, 'hex'));
}

class ErreurClient extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

const texte = (valeur) => (typeof valeur === 'string' ? valeur.trim().slice(0, LIMITE_TEXTE) : '');
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

// Limite simple des écritures par adresse IP, en mémoire.
const ecritures = new Map();
function limiterEcritures(ip) {
  const maintenant = Date.now();
  const recentes = (ecritures.get(ip) ?? []).filter((t) => maintenant - t < 3_600_000);
  if (recentes.length >= ECRITURES_PAR_HEURE) throw new ErreurClient(429, 'Trop de modifications, réessaie dans une heure.');
  ecritures.set(ip, [...recentes, maintenant]);
}

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
    if (requete.method === 'GET') return [200, requetes.toutes.all().map(enListe)];
    if (requete.method === 'POST') {
      limiterEcritures(ip);
      const liste = validerListe(await lireCorps(requete));
      const id = randomUUID();
      const cleEdition = randomBytes(24).toString('base64url');
      requetes.creer.run(id, JSON.stringify(liste), empreinte(cleEdition).toString('hex'));
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
    limiterEcritures(ip);
    if (!cleValide(cle, ligne.empreinte_cle)) throw new ErreurClient(403, 'Seule la personne qui a publié cette liste peut la modifier.');
    if (requete.method === 'PUT') {
      requetes.modifier.run(JSON.stringify(validerListe(await lireCorps(requete))), ligne.id);
      return [200, enListe(requetes.une.get(ligne.id))];
    }
    requetes.supprimer.run(ligne.id);
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
  reponse.end(corps === null ? undefined : JSON.stringify(corps));
}).listen(PORT, () => console.log(`API vocab-cnam à l’écoute sur le port ${PORT}`));
