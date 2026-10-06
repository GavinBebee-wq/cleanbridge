#!/usr/bin/env node
/* =====================================================================
   CLEANBRIDGE data refresh
   Pulls official open-data records, filters them down to likely commercial
   premises, and writes the feed the site reads:
     data/index.json          sources + every city with its location and tiles
     data/tiles/<lat>_<lng>.json   RawRecord[] for one half-degree map tile
   The site loads the index, then only the tiles for the cities a person picks.

   Every source is a public Socrata API (no key needed). Addresses without
   coordinates are geocoded with the U.S. Census batch geocoder.

   Run: node scripts/fetch-data.mjs          (Node 18+, no dependencies)
   ===================================================================== */
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const GEO_CACHE = path.join(DATA, 'geocode-cache.json');

const WINDOW_DAYS = 90;
const MIN_PERMIT_SQFT = 1500;

const TILE = 0.5;          // degrees
const MIN_CITY_RECORDS = 3; // smaller "cities" are mostly misspellings in the source data

const SALES_TAX = { id: 'tx-sales-tax', label: 'Texas Comptroller · Active Sales Tax Permit Holders', host: 'https://data.texas.gov', dataset: 'jrea-zgmq',
  page: 'https://data.texas.gov/dataset/Active-Sales-Tax-Permit-Holders/jrea-zgmq' };
const ATX_PERMITS = { id: 'austin-permits', label: 'City of Austin · Issued Construction Permits', host: 'https://data.austintexas.gov', dataset: '3syk-w9eu',
  page: 'https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu' };
const SEA_PERMITS = { id: 'seattle-permits', label: 'City of Seattle · Building Permits', host: 'https://data.seattle.gov', dataset: '76t5-zqzr',
  page: 'https://data.seattle.gov/Permitting/Building-Permits/76t5-zqzr' };
const CHI_LICENSES = { id: 'chicago-licenses', label: 'City of Chicago · Business Licenses', host: 'https://data.cityofchicago.org', dataset: 'r5kz-chrr',
  page: 'https://data.cityofchicago.org/Community-Economic-Development/Business-Licenses/r5kz-chrr' };
const SF_BUSINESSES = { id: 'sf-businesses', label: 'City of San Francisco · Registered Business Locations', host: 'https://data.sf.gov', dataset: 'g8m3-pdis',
  page: 'https://data.sf.gov/Economy-and-Community/Registered-Business-Locations-San-Francisco/g8m3-pdis' };
const LA_BUSINESSES = { id: 'la-businesses', label: 'City of Los Angeles · Listing of Active Businesses', host: 'https://data.lacity.org', dataset: '6rrh-rzua',
  page: 'https://data.lacity.org/Administration-Finance/Listing-of-Active-Businesses/6rrh-rzua' };

const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

/* ---------- helpers ---------- */

async function soql(src, params) {
  const rows = [];
  const limit = 5000;
  for (let offset = 0; ; offset += limit) {
    const qs = new URLSearchParams({ ...params, $limit: String(limit), $offset: String(offset) });
    const page = await getJson(`${src.host}/resource/${src.dataset}.json?${qs}`);
    rows.push(...page);
    if (page.length < limit) return rows;
  }
}

/* Open-data portals drop connections now and then, so every request gets a few tries. */
async function getJson(url) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 2000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(120000) });
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;   // a bad query will not fix itself
    } catch (e) { last = e; }
  }
  throw last;
}

/* The records currently published, so a source that is down keeps yesterday's data. */
async function loadPublished() {
  const out = [];
  let files = [];
  try { files = await readdir(path.join(DATA, 'tiles')); } catch { return out; }
  for (const f of files) out.push(...await loadJson(path.join(DATA, 'tiles', f), []));
  return out;
}

const KEEP_UPPER = new Set(['LLC', 'PLLC', 'LLP', 'LP', 'PC', 'PA', 'MD', 'DDS', 'DBA', 'USA', 'ATX', 'TX', 'II', 'III', 'IV', 'BBQ', 'HVAC', 'CPA', 'ATM', 'UPS', 'IH', 'FM', 'RR', 'RM', 'US', 'NW', 'NE', 'SW', 'SE']);
function titleCase(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ').map(w => {
    const bare = w.replace(/[^a-z0-9]/g, '').toUpperCase();
    if (KEEP_UPPER.has(bare)) return w.toUpperCase();
    if (/^\d+(st|nd|rd|th)$/.test(w)) return w;
    return w.replace(/(^|[-&/.(])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }).join(' ');
}

const UNIT_WORDS = '(?:STE|SUITE|UNIT|BLDG|BUILDING|RM|ROOM|FL|FLOOR|SPACE|SPC|SHOP|#)';
function addressKey(street, city) {
  let s = String(street || '').toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bINTERSTATE\b/g, 'IH').replace(/\bSTATE HIGHWAY\b/g, 'SH').replace(/\bHIGHWAY\b/g, 'HWY').replace(/\bSUITE\b/g, 'STE');
  const m = s.match(new RegExp(`^(.*?)\\s*${UNIT_WORDS}\\s*#?\\s*([A-Z0-9-]+)\\s*$`));
  const base = (m ? m[1] : s).trim();
  const unit = m ? m[2] : '';
  return `${String(city).toUpperCase().trim()}|${base}|${unit}`;
}
function streetOnly(street) {
  return String(street || '').toUpperCase().replace(new RegExp(`\\s*${UNIT_WORDS}\\s*#?\\s*[A-Z0-9-]+\\s*$`), '').trim();
}
function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}
const fmtDay = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtNum = n => Number(n).toLocaleString('en-US');

/* ---------- source 1: Texas sales tax permits ---------- */

function industryFromNaics(code) {
  const c = String(code || '');
  const is = (...p) => p.some(x => c.startsWith(x));
  if (is('454', '4541', '23', '56', '11', '21', '22', '92', '7223', '711', '4539', '81293', '48', '491', '492')) return null; // online sellers, trades, mobile food, etc.
  if (is('6244', '61')) return 'Education & childcare';
  if (is('62')) return 'Medical & dental';
  if (is('71394', '7139', '8121', '81219')) return 'Fitness & wellness';
  if (is('722')) return 'Restaurants & food';
  if (is('44', '45', '532', '8123', '8129')) return 'Retail & showrooms';
  if (is('51')) return 'Tech & coworking';
  if (is('531')) return 'Property & real estate';
  if (is('31', '32', '33', '42', '493', '811')) return 'Industrial & warehouse';
  if (is('52', '54', '55', '813')) return 'Professional services';
  if (is('71', '72', '81')) return 'Other commercial';
  return null;
}
const STOREFRONT = new Set(['Medical & dental', 'Education & childcare', 'Fitness & wellness', 'Restaurants & food', 'Retail & showrooms']);
const SUITE_RE = /\b(STE|SUITE|BLDG|BUILDING|RM|ROOM|FL|FLOOR|SHOP|SPACE)\b|#/;
const RESIDENTIAL_RE = /\b(APT|APARTMENT|LOT|TRLR|TRAILER)\b/;
const ARTERIAL_RE = /\b(BLVD|BOULEVARD|AVENUE|STREET|ROAD|BROADWAY|HWY|HIGHWAY|PKWY|INTERSTATE|IH|FM|RR|RM|EXPY|FWY|AVE|RD|ST|LOOP|SQ|PLZ|PLAZA|MALL|CTR|CENTER)\b/;

/* Sales tax permits include home-based sellers. Keep only records whose address looks like a
   commercial premises: a suite or building number, or a storefront business or
   second-or-later outlet on a main road. */
function looksCommercial(address, locationNo, industry) {
  const addr = String(address || '').toUpperCase();
  if (!addr || RESIDENTIAL_RE.test(addr) || /\bPO BOX\b/.test(addr)) return false;
  if (SUITE_RE.test(addr)) return true;
  return (Number(locationNo) >= 2 || STOREFRONT.has(industry)) && ARTERIAL_RE.test(addr);
}

async function fetchSalesTax() {
  const rows = await soql(SALES_TAX, {
    $select: 'taxpayer_number,taxpayer_name,outlet_number,outlet_name,outlet_address,outlet_city,outlet_zip_code,outlet_naics_code,outlet_permit_issue_date,outlet_first_sales_date',
    $where: `outlet_state='TX' AND outlet_permit_issue_date >= '${since}' AND taxpayer_organization_type != 'IS'`,
    $order: 'outlet_permit_issue_date DESC, taxpayer_number, outlet_number'
  });
  const out = [];
  for (const r of rows) {
    const industry = industryFromNaics(r.outlet_naics_code);
    if (!industry || !r.outlet_city || !looksCommercial(r.outlet_address, r.outlet_number, industry)) continue;
    const area = { name: titleCase(r.outlet_city) };
    const outletNo = Number(r.outlet_number) || 1;
    const name = titleCase(r.outlet_name || r.taxpayer_name);
    const taxpayer = titleCase(r.taxpayer_name).replace(/\.$/, '');
    const address = titleCase(r.outlet_address);
    const issued = r.outlet_permit_issue_date;
    const first = r.outlet_first_sales_date;
    const firstTxt = first ? ` First sales date on the permit: ${fmtDay(first)}.` : '';
    const operator = taxpayer && taxpayer !== name ? ` The permit holder is ${taxpayer}.` : '';
    const type = outletNo >= 2 ? 'NEW_LOCATION' : 'NEW_OPENING';
    const evidence = outletNo >= 2
      ? `A Texas sales tax permit was issued on ${fmtDay(issued)} for ${name} at ${address}, ${area.name}. It is outlet number ${outletNo} for this taxpayer.${operator}${firstTxt}`
      : `A Texas sales tax permit was issued on ${fmtDay(issued)} for ${name} at ${address}, ${area.name}, the first outlet for this taxpayer.${operator}${firstTxt}`;
    out.push({
      source: SALES_TAX.id, externalId: `st-${r.taxpayer_number}-${outletNo}`,
      key: addressKey(r.outlet_address, r.outlet_city),
      geo: { street: streetOnly(r.outlet_address), city: area.name, state: 'TX', zip: String(r.outlet_zip_code || '').slice(0, 5) },
      business: { kind: 'business', name, industry, address, city: area.name, state: 'TX', zip: String(r.outlet_zip_code || '').slice(0, 5),
        lat: null, lng: null, sqft: null, sqftSource: null, employees: null, website: null, phone: null,
        outlets: outletNo, operator: taxpayer, naics: String(r.outlet_naics_code || ''), opensAt: first && first.slice(0, 10) > today ? first : null },
      contact: null,
      signals: [{ type, detectedAt: issued, evidence, sourceLabel: SALES_TAX.label,
        sourceUrl: `${SALES_TAX.host}/resource/${SALES_TAX.dataset}.json?taxpayer_number=${r.taxpayer_number}&outlet_number=${r.outlet_number}` }]
    });
  }
  return { raw: rows.length, records: out };
}

/* ---------- source 2: City of Austin commercial building permits ---------- */

const SKIP_CLASS_RE = /C-\s*(329|105|104|103|102|101|321|325)\b/;
const SKIP_DESC_RE = /\b(antenna|cell (tower|site)|t-mobile|verizon|at&t|telecom|tower|generator|solar|photovoltaic|signage|re-?roof|roof(ing)? (repair|replacement)|retaining wall|swimming pool|foundation repair|ev charg|trash enclosure|dumpster|racking|ups replacement|uninterruptible|parking (lot|garage)|carport|canopy|awning|fence|demo(lition)? only)\b/i;
const SKIP_STATUS_RE = /withdrawn|void|cancel|expired|denied|rejected/i;
const FINISH_OUT_RE = /finish[\s-]?out|tenant (improvement|build)|new tenant|change of use|first[\s-]gen|white box|build[\s-]?out/i;

function industryFromPermit(r) {
  const t = `${r.description || ''} ${r.permit_class || ''}`.toLowerCase();
  if (/dental|dentist|clinic|medical|dialysis|surgery|hospital|physician|urgent care|pharmacy|veterinar|orthodont|optomet|therapy|imaging|health/.test(t)) return 'Medical & dental';
  if (/school|daycare|day care|child ?care|montessori|classroom|academy|education|university|college/.test(t)) return 'Education & childcare';
  if (/gym|fitness|yoga|pilates|spa\b|salon|wellness|barber/.test(t)) return 'Fitness & wellness';
  if (/restaurant|cafe|coffee|bar\b|brewery|kitchen|bakery|pizza|taco|food|dining|taproom/.test(t)) return 'Restaurants & food';
  if (/warehouse|industrial|manufactur|distribution|fabricat|cleanroom|clean room|data ?center|\blab\b|laborator|auto(motive)? (repair|service)|service station/.test(t)) return 'Industrial & warehouse';
  if (/retail|store|shop\b|showroom|boutique|grocery|market\b|dealership|bank\b/.test(t)) return 'Retail & showrooms';
  if (/cowork|tech\b|software/.test(t)) return 'Tech & coworking';
  if (/office|law firm|suite|conference|corporate|headquarter|professional bldg/.test(t)) return 'Professional services';
  return 'Other commercial';
}

async function fetchAustinPermits() {
  const rows = await soql(ATX_PERMITS, {
    $select: ['permit_number', 'permit_class', 'work_class', 'permit_location', 'description', 'issue_date', 'total_new_add_sqft', 'remodel_repair_sqft',
      'status_current', 'completed_date', 'certificate_of_occupancy', 'link', 'latitude', 'longitude', 'original_zip',
      'contractor_company_name', 'contractor_full_name', 'contractor_phone', 'applicant_full_name', 'applicant_org'].join(','),
    $where: `permit_class_mapped='Commercial' AND permittype='BP' AND issue_date >= '${since}' AND work_class in ('New','Remodel','Addition','Addition and Remodel','Shell')`,
    $order: 'issue_date DESC'
  });
  const out = [];
  for (const r of rows) {
    if (SKIP_CLASS_RE.test(r.permit_class || '') || SKIP_STATUS_RE.test(r.status_current || '')) continue;
    const desc = String(r.description || '').replace(/\s+/g, ' ').trim();
    if (SKIP_DESC_RE.test(desc)) continue;
    // On remodels the "new/added" figure is often the whole building, so prefer the remodeled area.
    const added = Number(r.total_new_add_sqft) || 0, remodeled = Number(r.remodel_repair_sqft) || 0;
    const sqft = Math.round(r.work_class === 'New' || r.work_class === 'Shell' ? Math.max(added, remodeled) : remodeled || added);
    if (sqft < MIN_PERMIT_SQFT) continue;
    const lat = Number(r.latitude), lng = Number(r.longitude);
    if (!lat || !lng || !r.permit_location) continue;

    const finishOut = /C-\s*100[12]\b/.test(r.permit_class || '') || FINISH_OUT_RE.test(desc);
    const isNew = r.work_class === 'New' || r.work_class === 'Shell';
    const isAddition = r.work_class === 'Addition';
    const type = isNew || finishOut ? 'NEW_FACILITY' : isAddition ? 'EXPANSION' : 'RENOVATION';
    const what = isNew ? 'new commercial construction' : finishOut ? 'a commercial tenant finish-out' : isAddition ? 'a commercial addition' : 'a commercial remodel';
    const address = titleCase(r.permit_location);
    const quote = desc ? ` Permit description: "${desc.length > 260 ? desc.slice(0, 257) + '…' : desc}"` : '';
    const done = r.completed_date ? ` The permit was finalized on ${fmtDay(r.completed_date)}.` : '';
    const co = r.certificate_of_occupancy === 'Yes' ? ' A certificate of occupancy is part of this permit.' : '';
    const company = String(r.contractor_company_name || r.applicant_org || '').replace(/\*+\s*main\s*\**/gi, '').trim();
    const person = titleCase(r.contractor_full_name || r.applicant_full_name || '');
    const phone = fmtPhone(r.contractor_phone);
    out.push({
      source: ATX_PERMITS.id, externalId: `atx-${String(r.permit_number).replace(/[^0-9A-Za-z]+/g, '-')}`,
      key: addressKey(r.permit_location, 'Austin'),
      business: { kind: 'site', name: address, industry: industryFromPermit(r), address, city: 'Austin', state: 'TX', zip: r.original_zip || '',
        lat, lng, sqft, sqftSource: 'permit', employees: null, website: null, phone: null, outlets: null, operator: null, naics: null, opensAt: null,
        summary: desc.length > 180 ? desc.slice(0, 177) + '…' : desc },
      contact: company || person ? { kind: 'contractor', name: person || company, role: person && company ? `Contractor on the permit, ${company}` : 'Contractor on the permit', company, email: null, phone } : null,
      signals: [{ type, detectedAt: r.issue_date,
        evidence: `The City of Austin issued a permit on ${fmtDay(r.issue_date)} for ${what} of ${fmtNum(sqft)} sq ft at ${address} (permit ${r.permit_number}).${quote}${co}${done}`,
        sourceLabel: ATX_PERMITS.label, sourceUrl: (r.link && r.link.url) || ATX_PERMITS.page }]
    });
  }
  return { raw: rows.length, records: out };
}

/* ---------- source 3: City of Seattle commercial building permits ---------- */

async function fetchSeattlePermits() {
  const rows = await soql(SEA_PERMITS, {
    $where: `permitclass='Commercial' AND permittypemapped='Building' AND issueddate >= '${since}' AND permittypedesc in ('New','Addition/Alteration','Tenant Improvment','Change of Use Only - No Construction')`,
    $order: 'issueddate DESC, permitnum'
  });
  const out = [];
  for (const r of rows) {
    const desc = String(r.description || '').replace(/\s+/g, ' ').trim();
    const cost = Math.round(Number(r.estprojectcost) || 0);
    const lat = Number(r.latitude), lng = Number(r.longitude);
    if (!lat || !lng || !r.originaladdress1 || SKIP_DESC_RE.test(desc) || SKIP_STATUS_RE.test(r.statuscurrent || '')) continue;
    if (cost < 50000 && r.permittypedesc !== 'Change of Use Only - No Construction') continue;
    const isNew = r.permittypedesc === 'New';
    const finishOut = /Tenant|Change of Use/.test(r.permittypedesc) || FINISH_OUT_RE.test(desc);
    const what = isNew ? 'new commercial construction' : finishOut ? 'a commercial tenant improvement' : 'a commercial addition or alteration';
    const address = titleCase(r.originaladdress1);
    const quote = desc ? ` Permit description: "${desc.length > 260 ? desc.slice(0, 257) + '…' : desc}"` : '';
    const company = String(r.contractorcompanyname || '').trim();
    out.push({
      source: SEA_PERMITS.id, externalId: `sea-${r.permitnum}`, key: addressKey(r.originaladdress1, 'Seattle'),
      business: { kind: 'site', name: address, industry: industryFromPermit({ description: desc }), address, city: 'Seattle', state: 'WA', zip: r.originalzip || '',
        lat, lng, sqft: null, sqftSource: null, employees: null, website: null, phone: null, outlets: null, operator: null, opensAt: null,
        summary: desc.length > 180 ? desc.slice(0, 177) + '…' : desc },
      contact: company ? { kind: 'contractor', name: titleCase(company), role: 'Contractor on the permit', company: titleCase(company), email: null, phone: null } : null,
      signals: [{ type: isNew || finishOut ? 'NEW_FACILITY' : 'RENOVATION', detectedAt: r.issueddate,
        evidence: `The City of Seattle issued a permit on ${fmtDay(r.issueddate)} for ${what} at ${address} (permit ${r.permitnum})${cost ? `, with an estimated project cost of $${fmtNum(cost)}` : ''}.${quote}`,
        sourceLabel: SEA_PERMITS.label, sourceUrl: (r.link && r.link.url) || SEA_PERMITS.page }]
    });
  }
  return { raw: rows.length, records: out };
}

/* ---------- sources 4 to 6: new business registrations in Chicago, San Francisco and Los Angeles ---------- */

function newBusinessRecord(src, o) {
  const type = o.locationNo >= 2 ? 'NEW_LOCATION' : 'NEW_OPENING';
  const operator = o.operator && o.operator !== o.name ? ` The registered owner is ${o.operator}.` : '';
  const nth = o.locationNo >= 2 ? ` It is location number ${o.locationNo} on this account.` : '';
  return {
    source: src.id, externalId: o.id, key: addressKey(o.rawAddress, o.city),
    geo: o.lat ? undefined : { street: streetOnly(o.rawAddress), city: o.city, state: o.state, zip: o.zip },
    business: { kind: 'business', name: o.name, industry: o.industry, address: titleCase(o.rawAddress), city: o.city, state: o.state, zip: o.zip,
      lat: o.lat || null, lng: o.lng || null, sqft: null, sqftSource: null, employees: null, website: null, phone: null,
      outlets: o.locationNo || 1, operator: o.operator || null, opensAt: o.date.slice(0, 10) > today ? o.date : null },
    contact: null,
    signals: [{ type, detectedAt: o.date, evidence: `${o.sentence}${nth}${operator}${o.extra || ''}`, sourceLabel: src.label, sourceUrl: o.url }]
  };
}

const CHI_LICENSE_TYPES = ['Limited Business License', 'Regulated Business License', 'Retail Food Establishment', 'Consumption on Premises - Incidental Activity',
  "Children's Services Facility License", 'Motor Vehicle Services License', 'Tavern', 'Tobacco', 'Wholesale Food Establishment', 'Animal Care License'];
function industryFromActivity(text) {
  const t = String(text || '').toLowerCase();
  if (/home occupation|home-based|peddl|mobile|from home/.test(t)) return null;
  if (/child|day care|daycare|school|tutor|education/.test(t)) return 'Education & childcare';
  if (/medical|dental|health|clinic|pharmac|therapy|chiropract|optic|veterinar|animal care/.test(t)) return 'Medical & dental';
  if (/hair|nail|barber|beauty|massage|fitness|gym|yoga|spa\b|tattoo|salon|body/.test(t)) return 'Fitness & wellness';
  if (/food|restaurant|liquor|tavern|bar\b|cafe|coffee|bakery|consumption/.test(t)) return 'Restaurants & food';
  if (/retail|sales|store|tobacco|merchandise|grocery/.test(t)) return 'Retail & showrooms';
  if (/motor vehicle|repair|manufactur|wholesale|warehouse|storage/.test(t)) return 'Industrial & warehouse';
  if (/consult|office|administrative|accounting|legal|financial|insurance|real estate|media|design|engineering/.test(t)) return 'Professional services';
  return 'Other commercial';
}

async function fetchChicagoLicenses() {
  const rows = await soql(CHI_LICENSES, {
    $select: 'license_id,account_number,site_number,legal_name,doing_business_as_name,address,zip_code,license_description,business_activity,license_start_date,latitude,longitude',
    $where: `application_type='ISSUE' AND city='CHICAGO' AND license_start_date >= '${since}' AND license_description in (${CHI_LICENSE_TYPES.map(t => `'${t.replace(/'/g, "''")}'`).join(',')})`,
    $order: 'license_start_date DESC, license_id'
  });
  const out = [];
  for (const r of rows) {
    const industry = industryFromActivity(`${r.license_description} ${r.business_activity || ''}`);
    const lat = Number(r.latitude), lng = Number(r.longitude);
    if (!industry || !lat || !lng || !r.address || RESIDENTIAL_RE.test(r.address.toUpperCase())) continue;
    const name = titleCase(r.doing_business_as_name || r.legal_name);
    const address = titleCase(r.address);
    out.push(newBusinessRecord(CHI_LICENSES, {
      id: `chi-${r.license_id}`, name, operator: titleCase(r.legal_name).replace(/\.$/, ''), rawAddress: r.address, city: 'Chicago', state: 'IL', zip: r.zip_code || '',
      lat, lng, industry, locationNo: Number(r.site_number) || 1, date: r.license_start_date,
      sentence: `The City of Chicago issued a new ${r.license_description} to ${name} at ${address}, starting ${fmtDay(r.license_start_date)}.`,
      extra: r.business_activity ? ` Licensed activity: ${r.business_activity}.` : '',
      url: `${CHI_LICENSES.host}/resource/${CHI_LICENSES.dataset}.json?license_id=${r.license_id}`
    }));
  }
  return { raw: rows.length, records: out };
}

async function fetchSanFrancisco() {
  const rows = await soql(SF_BUSINESSES, {
    $select: 'uniqueid,ttxid,ownership_name,dba_name,full_business_address,business_zip,location_start_date,location_end_date,self_reported_naics_code,location',
    $where: `city='San Francisco' AND location_start_date >= '${since}' AND location_start_date <= '${today}'`,
    $order: 'location_start_date DESC, uniqueid'
  });
  const out = [];
  for (const r of rows) {
    const industry = industryFromNaics(r.self_reported_naics_code);
    const xy = r.location && r.location.coordinates;
    if (!industry || !xy || r.location_end_date || !looksCommercial(r.full_business_address, 1, industry)) continue;
    const name = titleCase(r.dba_name || r.ownership_name);
    out.push(newBusinessRecord(SF_BUSINESSES, {
      id: `sf-${r.uniqueid}`, name, operator: titleCase(r.ownership_name), rawAddress: r.full_business_address, city: 'San Francisco', state: 'CA', zip: r.business_zip || '',
      lat: xy[1], lng: xy[0], industry, locationNo: 1, date: r.location_start_date,
      sentence: `${name} registered a business location at ${titleCase(r.full_business_address)} with the City of San Francisco, starting ${fmtDay(r.location_start_date)}.`,
      url: `${SF_BUSINESSES.host}/resource/${SF_BUSINESSES.dataset}.json?uniqueid=${r.uniqueid}`
    }));
  }
  return { raw: rows.length, records: out };
}

async function fetchLosAngeles() {
  const rows = await soql(LA_BUSINESSES, {
    $select: 'location_account,business_name,dba_name,street_address,zip_code,naics,location_start_date',
    $where: `location_start_date >= '${since}' AND location_start_date <= '${today}'`,
    $order: 'location_start_date DESC, location_account'
  });
  const out = [];
  for (const r of rows) {
    const industry = industryFromNaics(r.naics);
    const locationNo = Number(String(r.location_account || '').split('-')[1]) || 1;
    if (!industry || !r.street_address || !looksCommercial(r.street_address, locationNo, industry)) continue;
    const name = titleCase(r.dba_name || r.business_name);
    out.push(newBusinessRecord(LA_BUSINESSES, {
      id: `la-${r.location_account}`, name, operator: titleCase(r.business_name), rawAddress: r.street_address, city: 'Los Angeles', state: 'CA', zip: String(r.zip_code || '').slice(0, 5),
      industry, locationNo, date: r.location_start_date,
      sentence: `${name} registered a business location at ${titleCase(r.street_address)} with the City of Los Angeles, starting ${fmtDay(r.location_start_date)}.`,
      url: `${LA_BUSINESSES.host}/resource/${LA_BUSINESSES.dataset}.json?location_account=${r.location_account}`
    }));
  }
  return { raw: rows.length, records: out };
}

/* ---------- merge records that share an address ---------- */

function mergeByAddress(records) {
  const byKey = new Map();
  for (const rec of records) {
    const hit = byKey.get(rec.key);
    if (!hit) { byKey.set(rec.key, rec); continue; }
    // A named business beats a bare site address; permit data fills in size, location and contact.
    const named = hit.business.kind === 'business' ? hit : rec.business.kind === 'business' ? rec : hit;
    const other = named === hit ? rec : hit;
    const b = { ...named.business };
    if (other.business.sqftSource === 'permit' && (!b.sqft || other.business.sqft > b.sqft)) { b.sqft = other.business.sqft; b.sqftSource = 'permit'; }
    if (!b.lat && other.business.lat) { b.lat = other.business.lat; b.lng = other.business.lng; }
    if (!b.summary && other.business.summary) b.summary = other.business.summary;
    const signals = [...named.signals, ...other.signals].sort((x, y) => new Date(y.detectedAt) - new Date(x.detectedAt));
    const seen = new Set();
    const merged = { ...named, business: b, contact: named.contact || other.contact,
      signals: signals.filter(s => !seen.has(s.type) && seen.add(s.type)).slice(0, 4),
      source: named.source === other.source ? named.source : `${named.source}+${other.source}` };
    byKey.set(rec.key, merged);
  }
  return [...byKey.values()];
}

/* ---------- geocoding (U.S. Census batch geocoder) ---------- */

async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

const geoId = r => `${r.geo.street}|${r.geo.city}|${r.geo.state}|${r.geo.zip}`;
const BATCH = 2000;

async function geocodeBatch(batch, cache) {
  const csv = batch.map((r, k) => [k, r.geo.street, r.geo.city, r.geo.state, r.geo.zip].map(v => `"${String(v).replace(/"/g, '')}"`).join(',')).join('\n');
  const form = new FormData();
  form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');
  form.append('benchmark', 'Public_AR_Current');
  const res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: form, signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  for (const line of (await res.text()).split('\n')) {
    const cells = line.match(/("([^"]*)"|[^,]+)/g);
    if (!cells) continue;
    const rec = batch[Number(cells[0].replace(/"/g, ''))];
    if (!rec) continue;
    const coord = cells.map(c => c.replace(/"/g, '')).find(c => /^-\d+\.\d+,\d+\.\d+$/.test(c));
    cache[geoId(rec)] = coord ? { lng: Number(coord.split(',')[0]), lat: Number(coord.split(',')[1]) } : null;
  }
}

/* Fills in coordinates. Records the geocoder cannot place sit at the middle of their city's
   placed records; a city with nothing placed is dropped. */
async function geocode(records) {
  const cache = await loadJson(GEO_CACHE, {});
  const need = records.filter(r => !r.business.lat && r.geo && !(geoId(r) in cache));
  const batches = [];
  for (let i = 0; i < need.length; i += BATCH) batches.push(need.slice(i, i + BATCH));
  if (batches.length) console.log(`  geocoding ${need.length} new addresses in ${batches.length} batches`);
  for (let i = 0; i < batches.length; i += 3) {
    await Promise.all(batches.slice(i, i + 3).map(b => geocodeBatch(b, cache).catch(e => console.warn(`  geocoder batch failed (${e.message}); retried on the next run`))));
    await writeFile(GEO_CACHE, JSON.stringify(cache));
  }
  let exact = 0;
  for (const r of records) {
    if (r.business.lat) continue;
    const hit = r.geo && cache[geoId(r)];
    if (hit) { r.business.lat = hit.lat; r.business.lng = hit.lng; exact++; }
  }
  const median = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const byCity = new Map();
  for (const r of records) {
    const id = cityId(r);
    if (!byCity.has(id)) byCity.set(id, []);
    byCity.get(id).push(r);
  }
  const kept = [], cities = [];
  let approx = 0;
  for (const [id, list] of byCity) {
    const placed = list.filter(r => r.business.lat);
    if (list.length < MIN_CITY_RECORDS || !placed.length) continue;
    const lat = median(placed.map(r => r.business.lat)), lng = median(placed.map(r => r.business.lng));
    for (const r of list) {
      if (!r.business.lat) { r.business.lat = lat; r.business.lng = lng; r.business.approxLocation = true; approx++; }
      // A geocode far from the rest of the city is a wrong match; pull it back to the middle.
      else if (Math.abs(r.business.lat - lat) > 1 || Math.abs(r.business.lng - lng) > 1) { r.business.lat = lat; r.business.lng = lng; r.business.approxLocation = true; approx++; }
      kept.push(r);
    }
    cities.push({ id, name: list[0].business.city, state: list[0].business.state, lat: +lat.toFixed(4), lng: +lng.toFixed(4), count: list.length });
  }
  return { records: kept, cities, exact, approx };
}
const cityId = r => `${r.business.state}|${r.business.city}`;
const tileOf = b => `${Math.floor(b.lat / TILE)}_${Math.floor(b.lng / TILE)}`;

/* ---------- main ---------- */

async function main() {
  console.log(`CleanBridge refresh: records since ${since}`);
  const fetchers = [[SALES_TAX, fetchSalesTax], [ATX_PERMITS, fetchAustinPermits], [SEA_PERMITS, fetchSeattlePermits],
    [CHI_LICENSES, fetchChicagoLicenses], [SF_BUSINESSES, fetchSanFrancisco], [LA_BUSINESSES, fetchLosAngeles]];
  const published = await loadPublished();
  const previous = (await loadJson(path.join(DATA, 'index.json'), {})).total || 0;
  const sources = [], all = [];
  await Promise.all(fetchers.map(async ([src, fn]) => {
    try {
      const { raw, records } = await fn();
      console.log(`  ${src.id}: ${raw} rows -> ${records.length} kept`);
      sources.push({ id: src.id, label: src.label, url: src.page, records: records.length });
      all.push(...records);
    } catch (e) {
      // A source that is down keeps the records it had last time, minus any that have aged out.
      const kept = published
        .filter(r => r.source.split('+').includes(src.id) && r.signals.some(g => String(g.detectedAt).slice(0, 10) >= since))
        .map(r => ({ ...r, key: addressKey(r.business.address, r.business.city) }));
      console.warn(`  ${src.id}: FAILED (${e.message}); carrying forward ${kept.length} records from the last run`);
      sources.push({ id: src.id, label: src.label, url: src.page, records: kept.length, stale: true });
      all.push(...kept);
    }
  }));
  if (!all.length) throw new Error('every source failed; keeping the existing feed');
  // Carried-forward records that were merged across sources can arrive twice.
  const seenIds = new Set();
  const unique = all.filter(r => !seenIds.has(r.externalId) && seenIds.add(r.externalId));
  const geo = await geocode(mergeByAddress(unique));
  // Never replace a healthy feed with a badly shrunken one.
  if (previous && geo.records.length < previous * 0.6) throw new Error(`only ${geo.records.length} records against ${previous} last time; keeping the existing feed`);
  console.log(`  geocoded ${geo.exact} addresses, ${geo.approx} placed at the middle of their city`);

  const tiles = new Map(), cityTiles = new Map();
  for (const { key, geo: _g, ...rec } of geo.records) {
    const t = tileOf(rec.business);
    if (!tiles.has(t)) tiles.set(t, []);
    tiles.get(t).push(rec);
    const id = cityId(rec);
    if (!cityTiles.has(id)) cityTiles.set(id, new Set());
    cityTiles.get(id).add(t);
  }
  await rm(path.join(DATA, 'tiles'), { recursive: true, force: true });
  await rm(path.join(DATA, 'opportunities.json'), { force: true });
  await mkdir(path.join(DATA, 'tiles'), { recursive: true });
  for (const [t, list] of tiles) {
    list.sort((a, b) => new Date(b.signals[0].detectedAt) - new Date(a.signals[0].detectedAt) || a.externalId.localeCompare(b.externalId));
    // Some source rows carry broken characters; drop them rather than publish mojibake.
    await writeFile(path.join(DATA, 'tiles', `${t}.json`), JSON.stringify(list).replace(/\uFFFD/g, ''));
  }
  const cities = geo.cities.map(c => ({ ...c, tiles: [...cityTiles.get(c.id)].sort() })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  sources.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(path.join(DATA, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, tileDegrees: TILE, total: geo.records.length, sources, cities }));
  console.log(`  wrote ${geo.records.length} records in ${cities.length} cities across ${tiles.size} tiles`);
  console.log('  largest:', cities.slice(0, 12).map(c => `${c.name} ${c.count}`).join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
