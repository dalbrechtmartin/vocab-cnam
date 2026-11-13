// Listes de vocabulaire : celles du dépôt (pré-enregistrées), celles de l'API partagée et celles du navigateur.
import { API_URL } from './config.js';
import { formaterDate } from './texte.js';

const CLE_LISTES = 'vocab.listes';
const CLE_EDITION = 'vocab.cles';
const CLE_PROGRESSION = 'vocab.progression';
const CLE_PREFERENCES = 'vocab.preferences';
const LIMITE_MOTS = 300;
const LIMITE_TEXTE = 200;

export const ANNEES = ['A1', 'A2', 'A3'];

function lireStockage(cle, defaut) {
  try {
    return JSON.parse(localStorage.getItem(cle)) ?? defaut;
  } catch {
    return defaut;
  }
}

function ecrireStockage(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Stockage indisponible (navigation privée) : le site reste utilisable sans mémoriser.
  }
}

export function titre(liste) {
  return `Séance du ${formaterDate(liste.dateSeance)}`;
}

const texteCourt = (valeur) => String(valeur ?? '').trim().slice(0, LIMITE_TEXTE);

/** Nettoie une liste venue de l'extérieur (lien, fichier, API) ; renvoie null si elle est inutilisable. */
export function normaliserListe(brute) {
  if (!brute || typeof brute !== 'object' || !Array.isArray(brute.mots)) return null;
  const mots = brute.mots
    .map((mot) => ({ en: texteCourt(mot?.en), fr: texteCourt(mot?.fr) }))
    .filter((mot) => mot.en && mot.fr)
    .slice(0, LIMITE_MOTS);
  const dateValide = (date) => (/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date : '');
  const dateSeance = dateValide(brute.dateSeance);
  if (!mots.length || !dateSeance) return null;
  return {
    id: texteCourt(brute.id) || `locale-${crypto.randomUUID()}`,
    dateSeance,
    aApprendrePour: dateValide(brute.aApprendrePour),
    annee: ANNEES.includes(brute.annee) ? brute.annee : 'A1',
    prof: texteCourt(brute.prof),
    promo: texteCourt(brute.promo),
    mots,
  };
}

async function listesDuDepot() {
  try {
    const reponse = await fetch('data/listes.json', { cache: 'no-cache' });
    const listes = await reponse.json();
    return listes.map(normaliserListe).filter(Boolean).map((l) => ({ ...l, source: 'depot' }));
  } catch {
    return [];
  }
}

export let apiJoignable = false;

async function listesPartagees() {
  if (!API_URL) return [];
  try {
    const reponse = await fetch(`${API_URL}/api/listes`, { signal: AbortSignal.timeout(5000) });
    if (!reponse.ok) throw new Error(String(reponse.status));
    apiJoignable = true;
    const listes = await reponse.json();
    return listes.map((brute) => {
      const liste = normaliserListe(brute);
      return liste && { ...liste, id: brute.id, source: 'partagee' };
    }).filter(Boolean);
  } catch {
    apiJoignable = false;
    return [];
  }
}

function listesLocales() {
  return lireStockage(CLE_LISTES, []).map(normaliserListe).filter(Boolean).map((l) => ({ ...l, source: 'locale' }));
}

let cache = null;

export async function toutesLesListes(forcer = false) {
  if (cache && !forcer) return cache;
  const [depot, partagees] = await Promise.all([listesDuDepot(), listesPartagees()]);
  const parId = new Map();
  for (const liste of [...partagees, ...depot, ...listesLocales()]) parId.set(liste.id, liste);
  cache = [...parId.values()].sort((a, b) => b.dateSeance.localeCompare(a.dateSeance));
  return cache;
}

export async function trouverListe(id) {
  return (await toutesLesListes()).find((liste) => liste.id === id) ?? null;
}

export function enregistrerLocale(liste) {
  const locales = lireStockage(CLE_LISTES, []).filter((l) => l.id !== liste.id);
  const { source, ...sansSource } = liste;
  ecrireStockage(CLE_LISTES, [...locales, sansSource]);
  cache = null;
}

export function supprimerLocale(id) {
  ecrireStockage(CLE_LISTES, lireStockage(CLE_LISTES, []).filter((l) => l.id !== id));
  cache = null;
}

// --- Partage via l'API ---

const clesEdition = () => lireStockage(CLE_EDITION, {});
export const peutModifier = (liste) => liste.source === 'locale' || (liste.source === 'partagee' && Boolean(clesEdition()[liste.id]));

async function appelApi(chemin, options = {}) {
  const reponse = await fetch(`${API_URL}${chemin}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(8000),
  });
  const corps = reponse.status === 204 ? null : await reponse.json().catch(() => null);
  if (!reponse.ok) throw new Error(corps?.erreur ?? `Erreur ${reponse.status}`);
  return corps;
}

const corpsListe = ({ dateSeance, aApprendrePour, annee, prof, promo, mots }) =>
  JSON.stringify({ dateSeance, aApprendrePour, annee, prof, promo, mots });

/** Publie une liste locale pour tout le monde ; garde la clé d'édition dans ce navigateur. */
export async function publier(liste) {
  const { id, cleEdition } = await appelApi('/api/listes', { method: 'POST', body: corpsListe(liste) });
  ecrireStockage(CLE_EDITION, { ...clesEdition(), [id]: cleEdition });
  if (liste.source === 'locale') supprimerLocale(liste.id);
  cache = null;
  return id;
}

export async function modifierPartagee(liste) {
  await appelApi(`/api/listes/${encodeURIComponent(liste.id)}`, {
    method: 'PUT',
    body: corpsListe(liste),
    headers: { Authorization: `Bearer ${clesEdition()[liste.id]}` },
  });
  cache = null;
}

export async function supprimerPartagee(id) {
  await appelApi(`/api/listes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${clesEdition()[id]}` },
  });
  const cles = clesEdition();
  delete cles[id];
  ecrireStockage(CLE_EDITION, cles);
  cache = null;
}

// --- Partage par lien (sans serveur) ---

export function lienDePartage(liste) {
  const { id, source, ...contenu } = liste;
  const octets = new TextEncoder().encode(JSON.stringify(contenu));
  const base64 = btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#/recevoir/${base64}`;
}

export function lireLienDePartage(base64) {
  try {
    const binaire = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const texte = new TextDecoder().decode(Uint8Array.from(binaire, (c) => c.charCodeAt(0)));
    const liste = normaliserListe(JSON.parse(texte));
    return liste && { ...liste, id: `locale-${crypto.randomUUID()}` };
  } catch {
    return null;
  }
}

// --- Progression (méthode des boîtes de Leitner) ---

const cleMot = (mot) => `${mot.en}|${mot.fr}`;
export const BOITE_MAITRISEE = 4;

export function boite(listeId, mot) {
  return lireStockage(CLE_PROGRESSION, {})[listeId]?.[cleMot(mot)] ?? 0;
}

export function noterReponse(listeId, mot, juste) {
  const progression = lireStockage(CLE_PROGRESSION, {});
  const liste = (progression[listeId] ??= {});
  liste[cleMot(mot)] = juste ? Math.min((liste[cleMot(mot)] ?? 0) + 1, 5) : 1;
  ecrireStockage(CLE_PROGRESSION, progression);
}

export function maitrise(liste) {
  const acquis = liste.mots.filter((mot) => boite(liste.id, mot) >= BOITE_MAITRISEE).length;
  return Math.round((acquis / liste.mots.length) * 100);
}

export function reinitialiserProgression(listeId) {
  const progression = lireStockage(CLE_PROGRESSION, {});
  delete progression[listeId];
  ecrireStockage(CLE_PROGRESSION, progression);
}

// --- Préférences ---

export const preferences = () => ({ sens: 'en-fr', annee: '', ...lireStockage(CLE_PREFERENCES, {}) });
export const changerPreference = (cle, valeur) => ecrireStockage(CLE_PREFERENCES, { ...preferences(), [cle]: valeur });
