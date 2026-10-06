'use strict';
/* =====================================================================
   CLEANSCOUT MVP
   Layers in this file:
     1 CONFIG          plans, stages, signal types, service areas
     2 DATA PROVIDERS  the only place raw data enters the app. Records come from
                       data/index.json and data/tiles/, written by scripts/fetch-data.mjs
     3 SCORING         opportunity score + tiers + value estimate
     4 NORMALIZE       raw provider records -> businesses, contacts,
                       signals, opportunities (the clean data model)
     5 STORE           users, subscriptions, saved leads, pipeline, activity
   app.js holds views and events.

   DATA MODEL (collections)
     cities           {id, name, state, lat, lng, count, tiles}   (id is 'TX|Austin')
     businesses       {id, name, industry, address, city, state, lat, lng,
                       sqft, sqftSource, employees, website, phone, kind, source}
     contacts         {id, businessId, name, role, email, phone, kind}
     signals          {id, businessId, type, detectedAt, evidence,
                       sourceLabel, sourceUrl}
     opportunities    {id, businessId, contactId, signalIds, score,
                       scoreFactors, tier, primaryType, detectedAt, reason,
                       recommendedAction, estValue, verified}
     pipelineStages   {id, label}
     users            {id, name, email, company, planId, profile, ...}
     subscriptions    {id, userId, planId, status, startedAt, trialEndsAt, renewsAt}
     saved            {userId, oppId, at}
     pipeline         {userId, oppId, stageId, value, claimedAt}
     activities       {id, userId, oppId, type, text, at}
   ===================================================================== */

const TODAY = new Date();
const DAY = 86400000;
const daysAgo = n => new Date(TODAY.getTime() - n * DAY);
const daysBetween = d => Math.max(0, Math.floor((TODAY.getTime() - new Date(d).getTime()) / DAY));

/* ---------- 1. CONFIG ---------- */

/* Every city in the feed, loaded from data/index.json. A city appears here as soon as a
   source in scripts/fetch-data.mjs returns records for it. */
let CITIES = [];
let CITY_BY_ID = {};
const DEFAULT_CITY = 'TX|Austin';
const cityById = id => CITY_BY_ID[id] || null;
const cityLabel = id => { const c = CITY_BY_ID[id]; return c ? `${c.name}, ${c.state}` : String(id).split('|').reverse().join(', '); };

const PIPELINE_STAGES = [
  { id: 'new', label: 'New', btn: 'Back to New' },
  { id: 'contacted', label: 'Contacted', btn: 'Contacted' },
  { id: 'interested', label: 'Interested', btn: 'Interested' },
  { id: 'walkthrough', label: 'Walkthrough', btn: 'Walkthrough Scheduled' },
  { id: 'proposal', label: 'Proposal', btn: 'Proposal Sent' },
  { id: 'won', label: 'Won', btn: 'Won' },
  { id: 'lost', label: 'Lost', btn: 'Lost' }
];
const STAGE = Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, s]));

const SIGNAL_TYPES = {
  NEW_LOCATION: { label: 'New location', points: 25,
    why: 'New commercial locations frequently need recurring janitorial service, often before or just after opening.',
    action: 'Contact within 7 days and offer a free cleaning walkthrough.',
    phrase: c => 'recently opened a new location in ' + c },
  EXPANSION: { label: 'Office expansion', points: 20,
    why: 'Growing teams add floor space and foot traffic, which often outgrows an informal cleaning arrangement.',
    action: 'Contact the office or facilities manager about recurring janitorial service.',
    phrase: () => 'has been expanding' },
  NEW_FACILITY: { label: 'New facility', points: 15,
    why: 'A newly completed or newly occupied facility starts with no cleaning vendor in place.',
    action: 'Ask who is handling cleaning for the new space and offer a walkthrough this week.',
    phrase: () => 'has a new facility' },
  RELOCATION: { label: 'Recent move', points: 20,
    why: 'Businesses that move usually reset their vendors, and cleaning is one of the first services they price out.',
    action: 'Reach out within two weeks, while vendor choices for the new space are still open.',
    phrase: () => 'recently moved into a new space' },
  NEW_OPENING: { label: 'New business', points: 10,
    why: 'Newly opened businesses are still choosing vendors and have not settled into long-term contracts.',
    action: 'Introduce yourself and offer a no-cost walkthrough and written quote.',
    phrase: () => 'recently opened' },
  NEW_MGMT: { label: 'New property management', points: 10,
    why: 'A change in property management often triggers a review of building service contracts.',
    action: 'Contact the property manager and ask about upcoming vendor reviews for common areas and tenant suites.',
    phrase: () => 'has new property management in place' },
  RENOVATION: { label: 'New build or renovation', points: 10,
    why: 'Finished construction needs a post-build clean, and ongoing service usually follows.',
    action: 'Offer a post-construction clean and a recurring service quote together.',
    phrase: () => 'recently finished work on its space' },
  GROWTH: { label: 'Employee growth', points: 15,
    why: 'Significant headcount growth raises cleaning needs and often prompts a change of provider.',
    action: 'Ask the office manager whether the current cleaning scope still fits the larger team.',
    phrase: () => 'has been adding to its team' }
};

const PLANS = {
  solo: {
    id: 'solo', name: 'Solo', price: 19, limit: 20, maxCities: 1, maxMiles: 25,
    tagline: 'For owner-operators getting started',
    bullets: ['20 opportunities per month', 'One service area', 'Basic business information', 'Contact information when available', 'Opportunity reason', 'Weekly new opportunities'],
    features: { scoreNumber: false, industryFilter: false, sizeFilter: false, typeFilter: false, advancedFilter: false, csv: false }
  },
  growth: {
    id: 'growth', name: 'Growth', price: 39, limit: 50, maxCities: 3, maxMiles: 40, popular: true,
    tagline: 'For crews that want a steady pipeline',
    bullets: ['50 opportunities per month', 'Larger service area', 'Decision-maker information when available', 'Opportunity score', 'Buying signal and reason', 'Industry filters', 'Office size filters', 'CSV export'],
    features: { scoreNumber: true, industryFilter: true, sizeFilter: true, typeFilter: true, advancedFilter: false, csv: true }
  },
  pro: {
    id: 'pro', name: 'Pro', price: 79, limit: 100, maxCities: 5, maxMiles: 60,
    tagline: 'For teams working several markets',
    bullets: ['100 opportunities per month', 'Multiple cities and service areas', 'Highest-value opportunities prioritized', 'Detailed buying signals', 'Decision-maker research', 'Lead history', 'Pipeline tracking', 'CSV export', 'Advanced filtering'],
    features: { scoreNumber: true, industryFilter: true, sizeFilter: true, typeFilter: true, advancedFilter: true, csv: true }
  }
};

/* Every plan starts with a free trial. The first charge falls on the day the trial ends. */
const TRIAL_DAYS = 7;

const INDUSTRIES = ['Professional services', 'Medical & dental', 'Tech & coworking', 'Industrial & warehouse', 'Retail & showrooms', 'Education & childcare', 'Fitness & wellness', 'Property & real estate', 'Restaurants & food', 'Other commercial'];

const CLEANING_TYPES = [
  { id: 'office', label: 'Office', hint: 'Offices, coworking, professional suites', industries: ['Professional services', 'Tech & coworking', 'Property & real estate'] },
  { id: 'medical', label: 'Medical', hint: 'Clinics, dental and therapy offices', industries: ['Medical & dental'] },
  { id: 'industrial', label: 'Industrial', hint: 'Warehouses, plants, light industrial', industries: ['Industrial & warehouse'] },
  { id: 'retail', label: 'Retail', hint: 'Showrooms, shops, studios, gyms', industries: ['Retail & showrooms', 'Fitness & wellness', 'Restaurants & food'] },
  { id: 'other', label: 'Other', hint: 'A mix, or something else', industries: [] }
];

const VALUE_PER_SQFT = { 'Medical & dental': 0.22, 'Fitness & wellness': 0.17, 'Education & childcare': 0.15, 'Retail & showrooms': 0.11, 'Industrial & warehouse': 0.08 };
const DEFAULT_VALUE_PER_SQFT = 0.13;
VALUE_PER_SQFT['Restaurants & food'] = 0.14;
/* Used only when no public record states the size of the space. Shown as "typical", never as measured. */
const TYPICAL_SQFT = { 'Professional services': 2500, 'Medical & dental': 3500, 'Tech & coworking': 4000, 'Industrial & warehouse': 8000, 'Retail & showrooms': 3000,
  'Education & childcare': 5000, 'Fitness & wellness': 2500, 'Property & real estate': 2500, 'Restaurants & food': 2500, 'Other commercial': 3000 };
/* Kinds of business that usually hire a janitorial contractor rather than cleaning with their own staff. */
const CONTRACTS_OUT = new Set(['Professional services', 'Medical & dental', 'Tech & coworking', 'Education & childcare', 'Fitness & wellness', 'Property & real estate']);

/* ---------- 2. DATA PROVIDERS ---------- */
/* scripts/fetch-data.mjs pulls each active source, filters it and writes RawRecord[] into
   half-degree map tiles under data/tiles/:
   { source, externalId,
     business: {kind, name, industry, address, city, state, zip, lat, lng, sqft, sqftSource,
                employees, website, phone, outlets, operator, opensAt, summary, approxLocation},
     contact:  {kind, name, role, company, email, phone} | null,
     signals:  [{type, detectedAt, evidence, sourceLabel, sourceUrl}] }
   business.kind is 'business' (a named business) or 'site' (an address with permitted work,
   where the public record does not name the occupant).
   Nothing outside this layer knows where a record came from. */

/* Connect more of these one at a time. Each must use an official API, open-data feed, or licensed
   dataset. No scraping of sites whose terms forbid it. */
const PROVIDERS = [
  { id: 'tx-sales-tax', label: 'Texas sales tax permits', category: 'Business openings', status: 'active',
    note: 'Texas Comptroller open data. New permits show businesses opening and existing operators adding a location, in every Texas city.' },
  { id: 'austin-permits', label: 'City of Austin commercial building permits', category: 'Permits', status: 'active',
    note: 'New construction, tenant finish-outs, additions and remodels of 1,500 sq ft or more.' },
  { id: 'seattle-permits', label: 'City of Seattle commercial building permits', category: 'Permits', status: 'active',
    note: 'New construction, tenant improvements and alterations with a project cost of $50,000 or more.' },
  { id: 'chicago-licenses', label: 'City of Chicago business licenses', category: 'Business openings', status: 'active',
    note: 'Newly issued licenses for premises-based businesses.' },
  { id: 'sf-businesses', label: 'San Francisco registered business locations', category: 'Business openings', status: 'active',
    note: 'New business locations registered with the city.' },
  { id: 'la-businesses', label: 'Los Angeles active businesses', category: 'Business openings', status: 'active',
    note: 'New business locations registered with the Office of Finance.' },
  { id: 'more-cities', label: 'More city permit and license feeds', category: 'Permits', status: 'planned',
    note: 'Each city publishes its records differently, so they are added one at a time as a feed that allows reuse is found.' },
  { id: 'company', label: 'Company and contact data', category: 'Company information', status: 'planned',
    note: 'A licensed B2B data provider for employee counts, decision-makers and verified contact details.' }
];

let FEED_META = { generatedAt: null, windowDays: null, sources: [], error: null };

/* The feed is a set of static files next to the page. */
const fetchJson = async file => {
  const res = await fetch('data/' + file, { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
};

async function loadIndex() {
  const idx = await fetchJson('index.json');
  CITIES = idx.cities;
  CITY_BY_ID = Object.fromEntries(CITIES.map(c => [c.id, c]));
  FEED_META = { generatedAt: idx.generatedAt, windowDays: idx.windowDays, sources: idx.sources || [], total: idx.total, error: null };
}

const TILE_CACHE = {};
const loadTile = t => TILE_CACHE[t] || (TILE_CACHE[t] = fetchJson(`tiles/${t}.json`).catch(e => { delete TILE_CACHE[t]; throw e; }));

function slugify(s) { return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 24); }
const fmtNum = n => Number(n).toLocaleString('en-US');

/* ---------- 3. SCORING ---------- */

const SCORE_BASE = 30;
const LARGE_SQFT = 7000;
const MID_SQFT = 3000;

function scoreOpportunity(biz, contact, signals) {
  const factors = [{ key: 'base', label: 'Commercial premises inside a service area', points: SCORE_BASE }];
  const seen = new Set();
  signals.forEach(s => {
    if (seen.has(s.type)) return;
    seen.add(s.type);
    factors.push({ key: s.type, label: SIGNAL_TYPES[s.type].label, points: SIGNAL_TYPES[s.type].points });
  });
  if (biz.sqftSource === 'permit' && biz.sqft >= LARGE_SQFT) factors.push({ key: 'large', label: `Large space on the permit (${fmtNum(LARGE_SQFT)}+ sq ft)`, points: 15 });
  else if (biz.sqftSource === 'permit' && biz.sqft >= MID_SQFT) factors.push({ key: 'mid', label: `Mid-size space on the permit (${fmtNum(MID_SQFT)}+ sq ft)`, points: 8 });
  if (CONTRACTS_OUT.has(biz.industry)) factors.push({ key: 'fit', label: 'Type of business that usually contracts out cleaning', points: 12 });
  if (biz.outlets >= 3) factors.push({ key: 'multi', label: `Operator with ${biz.outlets} or more locations`, points: 8 });
  if (contact && contact.kind !== 'contractor' && contact.name && contact.role) factors.push({ key: 'dm', label: 'Decision-maker identified', points: 10 });
  if (biz.opensAt && new Date(biz.opensAt) > TODAY) factors.push({ key: 'opening', label: 'Opening date is still ahead', points: 8 });
  const newest = Math.min(...signals.map(s => daysBetween(s.detectedAt)));
  if (newest <= 14) factors.push({ key: 'recent', label: 'Signal detected in the last 14 days', points: 5 });
  const raw = factors.reduce((a, f) => a + f.points, 0);
  return { score: Math.min(100, raw), factors, raw };
}

function tierOf(score) {
  if (score >= 90) return { id: 'exceptional', label: 'Exceptional' };
  if (score >= 75) return { id: 'high', label: 'High' };
  if (score >= 60) return { id: 'good', label: 'Good' };
  return { id: 'moderate', label: 'Moderate' };
}

function estimateMonthlyValue(biz) {
  const rate = VALUE_PER_SQFT[biz.industry] || DEFAULT_VALUE_PER_SQFT;
  return Math.min(20000, Math.max(250, Math.round(biz.sqft * rate / 25) * 25));
}

/* ---------- 4. NORMALIZE ---------- */

function normalize(records) {
  const db = { businesses: [], contacts: [], signals: [], opportunities: [] };
  const rawByOpp = {};
  records.forEach(rec => {
    const bId = 'biz-' + rec.externalId;
    const biz = { id: bId, ...rec.business, cityId: `${rec.business.state}|${rec.business.city}`, source: rec.source };
    if (!biz.sqft) { biz.sqft = TYPICAL_SQFT[biz.industry] || 3000; biz.sqftSource = 'typical'; }
    rawByOpp['opp-' + rec.externalId] = rec;
    db.businesses.push(biz);
    let contact = null;
    if (rec.contact) {
      contact = { id: 'con-' + rec.externalId, businessId: bId, ...rec.contact };
      db.contacts.push(contact);
    }
    const sigs = rec.signals.map((s, k) => ({ id: `sig-${rec.externalId}-${k}`, businessId: bId, ...s }));
    db.signals.push(...sigs);
    const { score, factors } = scoreOpportunity(biz, contact, sigs);
    const primary = sigs.slice().sort((a, b) => SIGNAL_TYPES[b.type].points - SIGNAL_TYPES[a.type].points)[0];
    const newest = sigs.slice().sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt))[0];
    db.opportunities.push({
      id: 'opp-' + rec.externalId,
      businessId: bId, contactId: contact ? contact.id : null,
      signalIds: sigs.map(s => s.id), score, scoreFactors: factors, tier: tierOf(score).id,
      primaryType: primary.type, types: sigs.map(s => s.type),
      detectedAt: newest.detectedAt, reason: SIGNAL_TYPES[primary.type].why,
      recommendedAction: SIGNAL_TYPES[primary.type].action, estValue: estimateMonthlyValue(biz),
      verified: false
    });
  });
  const byId = o => Object.fromEntries(o.map(x => [x.id, x]));
  return { ...db, rawByOpp, bizById: byId(db.businesses), conById: byId(db.contacts), sigById: byId(db.signals), oppById: byId(db.opportunities) };
}

let CATALOG = null;
/* Builds the catalog for a set of cities, loading only the tiles those cities sit in. */
async function buildCatalog(cityIds) {
  let records = [];
  try {
    if (!CITIES.length) await loadIndex();
    const want = new Set(cityIds.filter(id => CITY_BY_ID[id]));
    const tiles = [...new Set([...want].flatMap(id => CITY_BY_ID[id].tiles))];
    const lists = await Promise.all(tiles.map(loadTile));
    records = lists.flat().filter(r => want.has(`${r.business.state}|${r.business.city}`));
  } catch (e) { FEED_META.error = e.message || 'unavailable'; }
  // Claimed leads keep their record after it ages out of the feed.
  const have = new Set(records.map(r => 'opp-' + r.externalId));
  Object.entries(DB.snapshots || {}).forEach(([oppId, rec]) => { if (!have.has(oppId)) records.push(rec); });
  return normalize(records);
}

/* ---------- 5. STORE ---------- */

const STORE_KEY = 'cleanscout.v2';
let DB = { users: [], subscriptions: [], saved: [], pipeline: [], activities: [], snapshots: {}, session: null, city: null, cityPicked: false };
let persisted = true;

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) DB = Object.assign(DB, JSON.parse(raw));
    rollSubscriptions();
    // Profiles saved before cities had ids hold bare Texas city names.
    DB.users.forEach(u => { if (u.profile) u.profile.cities = u.profile.cities.map(c => c.includes('|') ? c : 'TX|' + c); });
  } catch (e) { persisted = false; }
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { persisted = false; }
}
function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

const currentUser = () => DB.users.find(u => u.id === DB.session) || null;
const planOf = u => PLANS[(u && u.planId) || 'growth'];
const subOf = u => DB.subscriptions.find(s => s.userId === u.id);
const inTrial = sub => !!(sub && sub.trialEndsAt && Date.now() < new Date(sub.trialEndsAt).getTime());
const trialDaysLeft = sub => Math.max(1, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / DAY));
/* Once a trial or billing period has passed, move the next billing date forward a month at a time. */
function rollSubscriptions() {
  DB.subscriptions.forEach(sub => {
    if (sub.status === 'canceled') return;
    const d = new Date(sub.renewsAt);
    while (d.getTime() <= Date.now()) d.setMonth(d.getMonth() + 1);
    sub.renewsAt = d.toISOString();
  });
}
const leadsOf = u => DB.pipeline.filter(p => p.userId === u.id && CATALOG && CATALOG.oppById[p.oppId]);
const leadOf = (u, oppId) => DB.pipeline.find(p => p.userId === u.id && p.oppId === oppId) || null;
const isSaved = (u, oppId) => DB.saved.some(s => s.userId === u.id && s.oppId === oppId);
const activitiesOf = (u, oppId) => DB.activities.filter(a => a.userId === u.id && a.oppId === oppId).sort((a, b) => new Date(b.at) - new Date(a.at));
const claimedCount = u => DB.pipeline.filter(p => p.userId === u.id).length;
const savedOf = u => DB.saved.filter(x => x.userId === u.id && CATALOG && CATALOG.oppById[x.oppId]);
function dropSnapshots() {
  const used = new Set(DB.pipeline.map(p => p.oppId));
  Object.keys(DB.snapshots).forEach(id => { if (!used.has(id)) delete DB.snapshots[id]; });
}

function addActivity(u, oppId, type, text, at) {
  DB.activities.push({ id: uid('act'), userId: u.id, oppId, type, text, at: (at || new Date()).toISOString() });
}

function createUser({ name, email, company, planId, demo }) {
  const u = { id: uid('usr'), name, email: email.toLowerCase(), company, planId, profile: null, demo: !!demo, createdAt: new Date().toISOString(), notify: { weekly: true, highScore: true } };
  DB.users.push(u);
  const start = new Date();
  const trialEnds = new Date(start.getTime() + TRIAL_DAYS * DAY);
  DB.subscriptions.push({ id: uid('sub'), userId: u.id, planId, status: 'active', startedAt: start.toISOString(), trialEndsAt: trialEnds.toISOString(), renewsAt: trialEnds.toISOString() });
  return u;
}

/* ---------- 6. SELECTORS ---------- */

/* The city a visitor is browsing before they have a profile: the one nearest them, or their pick. */
const landingCity = () => CITY_BY_ID[DB.city] ? DB.city : CITY_BY_ID[DEFAULT_CITY] ? DEFAULT_CITY : (CITIES[0] || {}).id;

function nearestCities(pt, n, skip) {
  return CITIES.filter(c => !(skip || []).includes(c.id)).map(c => ({ c, d: milesBetween(pt, c) })).sort((a, b) => a.d - b.d).slice(0, n).map(x => x.c);
}
function searchCities(q, n, skip) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const pool = CITIES.filter(c => !(skip || []).includes(c.id));
  const starts = pool.filter(c => `${c.name}, ${c.state}`.toLowerCase().startsWith(t));
  const inside = pool.filter(c => !starts.includes(c) && c.name.toLowerCase().includes(t));
  return [...starts, ...inside].slice(0, n);   // CITIES is already ordered by record count
}

function milesBetween(a, b) {
  const R = 3958.8, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function homeOf(profile) {
  return cityById(profile && profile.cities && profile.cities[0]) || cityById(landingCity()) || { name: '', state: '', lat: 0, lng: 0 };
}

function decorate(u, opp) {
  const biz = CATALOG.bizById[opp.businessId];
  const contact = opp.contactId ? CATALOG.conById[opp.contactId] : null;
  // Distance is to the nearest of the member's cities, so a second metro is not ruled out by the first.
  const bases = ((u.profile && u.profile.cities) || []).map(cityById).filter(Boolean);
  const near = (bases.length ? bases : [homeOf(u.profile)]).map(c => ({ c, d: milesBetween(c, biz) })).sort((a, b) => a.d - b.d)[0];
  const miles = near.d;
  const p = u.profile || {};
  let fit = opp.score - miles * 0.15;
  if ((p.industries || []).includes(biz.industry)) fit += 6;
  if (p.minContract && opp.estValue >= p.minContract) fit += 3;
  if (p.minContract && opp.estValue < p.minContract) fit -= 8;
  return { opp, biz, contact, miles, from: near.c, fit, lead: leadOf(u, opp.id), saved: isSaved(u, opp.id) };
}

/* All opportunities that match the user's onboarding answers. */
function matchedFor(u) {
  const p = u.profile;
  if (!p || !CATALOG) return [];
  return CATALOG.opportunities
    .map(o => decorate(u, o))
    .filter(x => p.cities.includes(x.biz.cityId) && x.miles <= p.miles);
}

function sizeBand(sqft) { return sqft < 3000 ? 'small' : sqft < 8000 ? 'mid' : 'large'; }

function applyFilters(list, f, u) {
  const p = u.profile;
  return list.filter(x => {
    if (f.cities.length && !f.cities.includes(x.biz.cityId)) return false;
    if (x.miles > f.miles) return false;
    if (f.industry !== 'all' && x.biz.industry !== f.industry) return false;
    if (f.type !== 'all' && !x.opp.types.includes(f.type)) return false;
    if (x.opp.score < f.minScore) return false;
    if (f.size !== 'all' && sizeBand(x.biz.sqft) !== f.size) return false;
    if (f.age !== 'all' && daysBetween(x.opp.detectedAt) > Number(f.age)) return false;
    const st = x.lead ? x.lead.stageId : 'new';
    if (f.status === 'unclaimed' && x.lead) return false;
    if (f.status !== 'all' && f.status !== 'unclaimed' && st !== f.status) return false;
    if (f.status !== 'all' && f.status !== 'unclaimed' && !x.lead) return false;
    if (f.minContractOnly && p.minContract && x.opp.estValue < p.minContract) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (![x.biz.name, x.biz.address, x.biz.city, x.biz.industry, x.biz.operator || ''].some(v => v.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

function sortList(list, key) {
  const c = {
    score: (a, b) => b.opp.score - a.opp.score || new Date(b.opp.detectedAt) - new Date(a.opp.detectedAt),
    newest: (a, b) => new Date(b.opp.detectedAt) - new Date(a.opp.detectedAt),
    closest: (a, b) => a.miles - b.miles,
    largest: (a, b) => b.opp.estValue - a.opp.estValue
  }[key] || (() => 0);
  return list.slice().sort(c);
}

function userStats(u) {
  const matched = matchedFor(u);
  const leads = leadsOf(u);
  const n = id => leads.filter(l => l.stageId === id).length;
  const sumVal = ids => leads.filter(l => ids.includes(l.stageId)).reduce((a, l) => a + (l.value || 0), 0);
  const plan = planOf(u);
  return {
    matched, plan,
    used: leads.length, limit: plan.limit,
    newThisWeek: matched.filter(x => daysBetween(x.opp.detectedAt) <= 7).length,
    highPriority: matched.filter(x => x.opp.score >= 75 && !x.lead).length,
    contacted: leads.filter(l => !['new'].includes(l.stageId)).length,
    interested: n('interested'), walkthroughs: n('walkthrough'), proposals: n('proposal'), won: n('won'), lost: n('lost'), saved: n('new'),
    mrr: sumVal(['won']), potential: sumVal(['interested', 'walkthrough', 'proposal']),
    counts: Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, n(s.id)]))
  };
}

/* ---------- 7. OUTREACH TEMPLATES ---------- */

/* A 'site' is an address with permitted work; its contact is the contractor on the permit. */
function outreachEmail(u, d) {
  const me = u.name.split(' ')[0];
  const mine = u.company || 'a local commercial cleaning company';
  const home = homeOf(u.profile).name;
  if (d.biz.kind === 'site') {
    const first = d.contact && d.contact.name !== d.contact.company ? d.contact.name.split(' ')[0] : null;
    return {
      subject: `Cleaning for the space at ${d.biz.address}`,
      body: `Hi ${first || 'there'},\n\nI run ${mine} in ${home}. I saw the permit for the work at ${d.biz.address} and wanted to introduce myself.\n\nIf you need a post-construction clean before turnover, or the occupant is looking for recurring janitorial service, I'd be glad to walk the space at no cost and send a written quote within two business days. If you're all set, no problem at all.\n\nThanks,\n${me}\n${u.company || ''}`.trim()
    };
  }
  const first = d.contact && d.contact.kind !== 'contractor' ? d.contact.name.split(' ')[0] : null;
  const phrase = SIGNAL_TYPES[d.opp.primaryType].phrase(d.biz.city);
  return {
    subject: `Cleaning for ${d.biz.name}'s ${d.biz.city} location`,
    body: `Hi ${first || 'there'},\n\nI run ${mine} in ${home}. I saw that ${d.biz.name} ${phrase} and wanted to introduce myself.\n\nIf you don't already have a cleaning provider you're happy with, I'd be glad to walk the space with you at no cost and send a written quote within two business days. If you're all set, no problem at all.\n\nThanks,\n${me}\n${u.company || ''}`.trim()
  };
}

function outreachCall(u, d) {
  const me = u.name.split(' ')[0];
  const mine = u.company || 'a local cleaning company';
  if (d.biz.kind === 'site') {
    const who = d.contact ? d.contact.name : `whoever is running the project at ${d.biz.address}`;
    return `"Hi, this is ${me} with ${mine}. Could I speak with ${who}?"\n\nIf connected: "I'll be brief. I saw the permit for the work at ${d.biz.address}. Do you have the final clean covered, and do you know who will handle cleaning once the space is occupied?"\n\nIf it's covered: "Understood. Could I leave my number in case that changes?"\nIf not: "Could I stop by for a 15 minute walkthrough this week and send you a written quote?"\n\nVoicemail: "Hi, this is ${me} with ${mine}. I'm calling about cleaning for ${d.biz.address}. You can reach me at this number."`;
  }
  const who = d.contact && d.contact.kind !== 'contractor' ? `${d.contact.name}, your ${d.contact.role.toLowerCase()}` : 'whoever handles building services';
  return `"Hi, this is ${me} with ${mine}. Could I speak with ${who}?"\n\nIf connected: "I'll be brief. I work with ${d.biz.industry.toLowerCase()} businesses in ${d.biz.city}, and I saw ${d.biz.name} ${SIGNAL_TYPES[d.opp.primaryType].phrase(d.biz.city)}. Who looks after cleaning for the space right now?"\n\nIf there's a provider: "Understood. Could I leave my number in case that changes?"\nIf not: "Could I stop by for a 15 minute walkthrough this week and send you a written quote?"\n\nVoicemail: "Hi, this is ${me} with ${mine}. I'm following up about cleaning for ${d.biz.name}. You can reach me at this number."`;
}
