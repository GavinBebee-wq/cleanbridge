'use strict';
/* =====================================================================
   CLEANSCOUT MVP  views + events (data layer lives in data.js)
   ===================================================================== */

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + fmtNum(Math.round(n));
const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDateTime = d => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function agoLabel(d) {
  const n = daysBetween(d);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return n + ' days ago';
  return fmtDate(d);
}

/* ---------- icons ---------- */
const ICONS = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.5-4.5"/>',
  flame: '<path fill="currentColor" stroke="none" d="M12 2c.6 3.2 3.2 4.8 4.4 7.4 1.3 2.8.6 6-1.2 8-1.4 1.6-3.4 2.6-5.2 2.6-3.2 0-5.6-2.7-5.6-6 0-2.4 1.2-4 2.6-5.4.4 1.2 1 2 1.8 2.4C8.6 8 10 5 12 2z"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4"/>'
};
const ico = (n, extra = '') => `<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const logoMark = () => '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--brand)"/><circle cx="11.5" cy="20.5" r="3" fill="var(--signal)"/><path d="M11.5 12.5a8 8 0 018 8M11.5 6.5a14 14 0 0114 14" stroke="var(--brand-ink)" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';

/* ---------- state ---------- */
const S = {
  route: 'landing', params: {}, authTab: 'signup', selPlan: 'growth', authErr: '',
  ob: { step: 0, building: false, data: { type: 'office', cities: [], miles: 25, minContract: 500, industries: [], crew: 'solo' } },
  f: null, fUser: null, filtersOpen: false, outreach: 'email', modal: null,
  cityQ: '', catKey: null
};
const APP_ROUTES = ['dashboard', 'opportunities', 'detail', 'pipeline', 'saved', 'settings', 'billing'];

const PAGE_SIZE = 30;
function defaultFilters(u) {
  return { cities: [], miles: u.profile.miles, industry: 'all', type: 'all', minScore: 0, size: 'all', age: 'all', status: 'all', sort: 'score', view: 'cards', q: '', minContractOnly: true, limit: PAGE_SIZE };
}
function ensureFilters(u) {
  if (!S.f || S.fUser !== u.id) { S.f = defaultFilters(u); S.fUser = u.id; }
  S.f.miles = Math.min(S.f.miles, u.profile.miles);
}

/* ---------- Stripe (Payment Links, set in config.js) ---------- */
const STRIPE = (window.CLEANSCOUT_CONFIG && window.CLEANSCOUT_CONFIG.stripe) || {};
const stripeLink = planId => /^https:\/\/buy\.stripe\.com\//.test(STRIPE[planId] || '') ? STRIPE[planId] : null;
const stripePortal = () => /^https:\/\/billing\.stripe\.com\//.test(STRIPE.portal || '') ? STRIPE.portal : null;
const stripeOn = () => !!(stripeLink('solo') && stripeLink('growth') && stripeLink('pro'));
/* Sends the member to Stripe's hosted checkout. Card details never touch this site. */
function goToCheckout(u, planId) {
  const sub = subOf(u);
  sub.checkout = 'pending'; sub.checkoutPlan = planId; saveStore();
  window.location.href = `${stripeLink(planId)}?client_reference_id=${encodeURIComponent(u.id)}`;
}
/* Stripe sends people back to <site>/?checkout=success after they start the trial. */
function finishCheckout() {
  if (!/[?&]checkout=success\b/.test(window.location.search)) return;
  const u = currentUser(), sub = u && subOf(u);
  try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* ignore */ }
  if (!sub || sub.checkout !== 'pending') return;
  sub.checkout = 'done';
  if (sub.checkoutPlan && PLANS[sub.checkoutPlan]) { u.planId = sub.checkoutPlan; sub.planId = sub.checkoutPlan; }
  saveStore();
  toast(`Your ${TRIAL_DAYS}-day free trial has started.`);
}
const billingNote = () => stripeOn() ? 'Payments are handled by Stripe.' : 'Billing is simulated in this preview and no card is charged.';

/* Which cities the current screen needs: a member's service area, or the visitor's city. */
function activeCityIds() {
  const u = currentUser();
  if (u && u.profile) return u.profile.cities;
  return [landingCity()].filter(Boolean);
}
/* Loads the catalog for those cities whenever the set changes, then redraws. */
function syncCatalog() {
  const ids = activeCityIds();
  const key = ids.slice().sort().join(',');
  if (key === S.catKey) return Promise.resolve();
  S.catKey = key;
  return buildCatalog(ids).then(cat => { if (S.catKey === key) { CATALOG = cat; render(); } });
}
function setLandingCity(id, picked) {
  DB.city = id; DB.cityPicked = !!picked; S.cityQ = ''; saveStore();
  if (S.route === 'onboarding' && !S.ob.data.cities.length) S.ob.data.cities = [id];
  render();
}
/* Starts a visitor in the city nearest to them. Only the nearest city is kept, never the coordinates. */
function locateVisitor() {
  if (DB.cityPicked || DB.city || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    if (DB.cityPicked) return;
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const c = nearestCities(here, 1)[0];
    if (!c) return;
    const far = milesBetween(here, c) > 75;
    setLandingCity(c.id, false);
    toast(far ? `CleanScout does not cover your area yet. Showing ${cityLabel(c.id)}, the nearest city.` : `Showing opportunities near ${cityLabel(c.id)}.`);
  }, () => { /* declined or unavailable: stay on the default city */ }, { timeout: 8000, maximumAge: 86400000 });
}
/* City search box plus suggestions. ctx says what a pick does: 'land' or 'profile'. */
function cityPicker(ctx, skip, emptyList) {
  const hits = S.cityQ ? searchCities(S.cityQ, 8, skip) : emptyList || [];
  const act = ctx === 'land' ? 'land-city' : 'p-city';
  return `<input class="input" id="city-q" data-cityq="1" value="${esc(S.cityQ)}" placeholder="Search ${fmtNum(CITIES.length)} cities" autocomplete="off" aria-label="Search cities">
    <div class="chips" style="margin-top:10px">${hits.map(c => `<button type="button" class="chip" data-act="${act}" data-v="${esc(c.id)}">${esc(c.name)}, ${c.state} <span class="muted num" style="font-weight:500">${fmtNum(c.count)}</span></button>`).join('')}
    ${S.cityQ && !hits.length ? '<span class="hint">No city by that name is covered yet.</span>' : ''}</div>`;
}

function toast(msg) {
  const box = $('#toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function go(route, params) {
  S.route = route; S.params = params || {}; S.modal = null;
  render();
  window.scrollTo(0, 0);
}

/* ---------- shared pieces ---------- */
const SIG = k => SIGNAL_TYPES[k];

function scoreBadge(opp, showNum) {
  const t = tierOf(opp.score);
  if (!showNum) return `<div class="score tier-${t.id} locked" title="The numeric score is on the Growth plan and above">${ico('lock')}<b>${t.label}</b></div>`;
  return `<div class="score tier-${t.id}" title="Estimated opportunity score">${t.id === 'exceptional' ? ico('flame') : ''}<b>${opp.score}</b><small>${t.id === 'exceptional' ? 'Exceptional' : t.label}</small></div>`;
}
function statusPill(lead) {
  if (!lead) return '<span class="pill st-unclaimed">Not claimed</span>';
  return `<span class="pill st-${lead.stageId}">${esc(STAGE[lead.stageId].label)}</span>`;
}
function primaryEvidence(opp) {
  const s = opp.signalIds.map(id => CATALOG.sigById[id]).find(x => x.type === opp.primaryType);
  return s ? s.evidence : opp.reason;
}
const clip = (t, n) => t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
function signalChips(opp) {
  const rest = opp.types.filter(t => t !== opp.primaryType);
  return `<span class="signal">${esc(SIG(opp.primaryType).label)}</span>` + rest.map(t => `<span class="signal sec2">${esc(SIG(t).label)}</span>`).join('');
}
function sourceTag() { return '<span class="demo-tag" title="From public records. CleanScout has not verified it.">Public record</span>'; }
const feedDate = () => FEED_META.generatedAt ? fmtDate(FEED_META.generatedAt) : 'not yet';
function sizeLabel(biz) { return `${biz.sqftSource === 'permit' ? '' : 'about '}${fmtNum(biz.sqft)} sq ft`; }
function lookupLinks(biz) {
  const q = encodeURIComponent(`${biz.kind === 'site' ? '' : biz.name + ' '}${biz.address} ${biz.city} ${biz.state}`);
  return `<a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Search the web</a> · <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Open in Maps</a>`;
}

function oppCard(x, u, opts) {
  opts = opts || {};
  const plan = u ? planOf(u) : PLANS.pro;
  const { opp, biz, contact, lead, saved } = x;
  const stage = lead ? lead.stageId : null;
  const contactLine = contact
    ? `<span class="who2">${ico('building')}${esc(contact.name)}, ${esc(contact.role)}</span>`
    : `<span class="who2">${ico('building')}No contact in the public record</span>`;
  const actions = opts.mock ? '' : `<div class="opp-actions">
      <button class="btn btn-primary btn-sm" data-act="view" data-id="${opp.id}">View</button>
      <button class="btn btn-sm ${saved ? 'on' : ''}" data-act="save" data-id="${opp.id}">${ico('bookmark')}${saved ? 'Saved' : 'Save'}</button>
      ${(!lead || stage === 'new') ? `<button class="btn btn-sm" data-act="contacted" data-id="${opp.id}">Mark Contacted</button>` : ''}
    </div>`;
  return `<article class="opp">
    ${scoreBadge(opp, plan.features.scoreNumber)}
    <div class="opp-body">
      <div class="opp-top"><h3>${esc(biz.name)}</h3>${opts.mock ? '' : sourceTag()}</div>
      <div class="opp-sub">${esc(biz.city)}, ${esc(biz.state)} · ${esc(biz.industry)} · ${sizeLabel(biz)}${x.miles != null && !opts.mock ? ` · about ${Math.round(x.miles)} mi away` : ''}</div>
      <div class="sig-row">${signalChips(opp)}<span>Detected ${agoLabel(opp.detectedAt)}</span></div>
      <p class="opp-why">${esc(clip(primaryEvidence(opp), 210))}</p>
      <div class="opp-foot">${contactLine}${opts.mock ? '' : statusPill(lead)}${opts.mock ? '' : `<span>Est. ${money(opp.estValue)}/mo</span>`}</div>
      ${actions}
    </div>
  </article>`;
}

function publicDecor(opp) {
  return { opp, biz: CATALOG.bizById[opp.businessId], contact: opp.contactId ? CATALOG.conById[opp.contactId] : null, lead: null, saved: false, miles: null };
}

function priceCard(p, cta) {
  return `<div class="price ${p.popular ? 'pop' : ''}">
    ${p.popular ? '<span class="badge">Most Popular</span>' : ''}
    <div><h3>${esc(p.name)}</h3><p class="muted" style="margin-top:6px;font-size:14px">${esc(p.tagline)}</p></div>
    <div><div class="amt">$${p.price}<small>/month</small></div><p class="muted" style="margin-top:8px;font-size:14px">Free for ${TRIAL_DAYS} days, then $${p.price}/month</p></div>
    <ul>${p.bullets.map(b => `<li>${ico('check')}<span>${esc(b)}</span></li>`).join('')}</ul>
    ${cta}
  </div>`;
}
function publicPriceCta(p) {
  return `<button class="btn ${p.popular ? 'btn-primary' : ''} btn-lg" data-act="auth" data-tab="signup" data-plan="${p.id}">Start ${TRIAL_DAYS}-day free trial</button>`;
}

/* ---------- public site ---------- */
function pubBar() {
  const u = currentUser();
  return `<div class="preview-strip">${FEED_META.error ? 'The opportunity feed could not be loaded. Try again shortly.' : `Live public-record data, refreshed ${feedDate()}. ${stripeOn() ? 'Accounts are saved in this browser only.' : 'Accounts and billing are still a preview: saved in this browser only, no card charged.'}`}</div>
  <header class="pub-bar"><div class="wrap">
    <button class="logo" data-act="go" data-to="landing" aria-label="CleanScout home">${logoMark()}<span>Clean<em>Scout</em></span></button>
    <nav class="pub-nav" aria-label="Main">
      <button class="btn btn-ghost" data-act="scroll" data-target="how">How it works</button>
      <button class="btn btn-ghost" data-act="go" data-to="pricing">Pricing</button>
    </nav>
    <div class="pub-actions">
      ${u ? `<button class="btn btn-primary" data-act="go" data-to="${u.profile ? 'dashboard' : 'onboarding'}">Open my dashboard</button>`
        : `<button class="btn btn-ghost" data-act="auth" data-tab="login">Log in</button><button class="btn btn-primary" data-act="auth" data-tab="signup">Get started</button>`}
    </div>
  </div></header>`;
}
function pubFooter() {
  return `<footer class="footer"><div class="wrap">
    <div><b style="color:var(--ink)">CleanScout</b><br>Opportunity signals for commercial cleaners.</div>
    <div style="max-width:520px">Opportunities come from public records and have not been verified by CleanScout. Scores are estimates, not a guarantee that a business needs or will buy cleaning. CleanScout does not contact businesses on your behalf.</div>
  </div></footer>`;
}
function faqBlock() {
  return `<div class="faq">
    <div><h4>Where do the opportunities come from?</h4><p>From public records. Today that means new Texas sales tax permits statewide, building permits in Austin and Seattle, and new business registrations in Chicago, San Francisco and Los Angeles, refreshed daily. Each opportunity links to the record it came from. Contact details are limited to what those records publish.</p></div>
    <div><h4>Does a high score guarantee a client?</h4><p>No. The score estimates how many signs point to a possible need for a new provider. You still make the call, walk the space and earn the contract.</p></div>
    <div><h4>Do you contact the businesses for me?</h4><p>No. You get the business, the reason it was flagged, the contact when available and a suggested message. You reach out and close the contract.</p></div>
    <div><h4>Can I change or cancel my plan?</h4><p>Yes. Every plan starts with a ${TRIAL_DAYS}-day free trial. Switch plans or cancel from Billing at any time, and if you cancel during the trial you are never charged. ${billingNote()}</p></div>
  </div>`;
}

function viewLanding() {
  const all = CATALOG.opportunities.filter(o => CATALOG.bizById[o.businessId].cityId === landingCity());
  const top = all.slice().sort((a, b) => b.score - a.score || new Date(b.detectedAt) - new Date(a.detectedAt)).slice(0, 3);
  const best = top[0];
  const mockCards = top.map(o => oppCard(publicDecor(o), null, { mock: true })).join('');
  return pubBar() + `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <span class="eyebrow">For commercial cleaners in ${esc(cityLabel(landingCity()))}</span>
      <h1>Find Your Next Commercial Cleaning Clients.</h1>
      <p class="sub">CleanScout finds businesses showing signs they may need a new cleaning provider — so you can spend less time searching and more time closing contracts.</p>
      <div class="hero-cta">
        <button class="btn btn-primary btn-lg" data-act="auth" data-tab="signup">Find My First Opportunities ${ico('arrow')}</button>
        <button class="btn btn-lg" data-act="scroll" data-target="how">See How It Works</button>
      </div>
      <p class="hero-note">Free for ${TRIAL_DAYS} days on every plan, then from $19/month. Or <button class="btn btn-ghost btn-sm" style="padding:2px 6px;text-decoration:underline" data-act="demo">explore the demo account</button>.</p>
      <div class="field" style="max-width:420px;margin-top:22px"><span class="lbl">Showing ${esc(cityLabel(landingCity()))}. Work somewhere else?</span>${cityPicker('land', [landingCity()])}</div>
    </div>
    <div class="mock" aria-label="Example of the opportunity dashboard">
      <div class="mock-bar"><i></i><i></i><i></i><span>cleanscout / opportunities</span></div>
      <div class="mock-body">
        <div class="mock-stats">
          <div class="mock-stat"><b>${fmtNum(all.filter(o => daysBetween(o.detectedAt) <= 7).length)}</b><span>new this week</span></div>
          <div class="mock-stat"><b>${fmtNum(all.filter(o => o.score >= 75).length)}</b><span>high opportunity</span></div>
          <div class="mock-stat"><b>${fmtNum(all.length)}</b><span>in ${esc((cityById(landingCity()) || {}).name || 'the feed')}</span></div>
        </div>
        ${mockCards || '<p class="muted">The feed is empty right now.</p>'}
        <div style="text-align:right">${sourceTag()}</div>
      </div>
    </div>
  </div></section>

  <section class="sec"><div class="wrap">
    <span class="eyebrow">Signals we look for</span>
    <h2 style="margin-top:10px">Don't cold call 1,000 random businesses.</h2>
    <p class="lead">Find the businesses that have a reason to need cleaning right now. Every opportunity is tied to something that changed.</p>
    <div class="signal-strip">${Object.values(SIGNAL_TYPES).map(s => `<span class="signal">${esc(s.label)}</span>`).join('')}</div>
  </div></section>

  <section class="sec sec-alt"><div class="wrap">
    <h2>Stop Searching. Start Finding.</h2>
    <div class="vs">
      <div class="vs-col them"><h3>The usual way</h3><ul>
        ${['Search Google Maps', 'Find random businesses', 'Look for contact information', 'Call hundreds of companies', 'Hope someone needs cleaning'].map(t => `<li>${ico('x')}<span>${t}</span></li>`).join('')}
      </ul></div>
      <div class="vs-col us"><h3>With CleanScout</h3><ul>
        ${['We monitor opportunity signals', 'We identify promising businesses', "We explain why they're worth contacting", 'We show the contact the public record lists, when there is one', 'You contact the businesses and close the contract'].map(t => `<li>${ico('check')}<span>${t}</span></li>`).join('')}
      </ul></div>
    </div>
  </div></section>

  <section class="sec" id="how"><div class="wrap">
    <span class="eyebrow">How it works</span>
    <h2 style="margin-top:10px">From signup to signed contract in three steps.</h2>
    <div class="steps">
      <div class="step"><span class="n">STEP 1</span><h3>Tell us where you work</h3><p>Pick your cities, how far you will drive, the smallest contract worth your time and the buildings you like to clean.</p></div>
      <div class="step"><span class="n">STEP 2</span><h3>Get opportunities with the reason attached</h3><p>Each one shows what changed, how strong the signal is, a link to the public record and a message you can send as is.</p></div>
      <div class="step"><span class="n">STEP 3</span><h3>Track every lead to a contract</h3><p>Move leads from contacted to walkthrough to proposal to won, and watch your monthly recurring revenue grow.</p></div>
    </div>
  </div></section>

  <section class="sec sec-alt"><div class="wrap">
    <span class="eyebrow">Every lead explains itself</span>
    <div class="explain-grid">
      <div>
        <h2 style="margin-top:10px">A score you can read in a second.</h2>
        <p class="lead">Each opportunity gets a score from 0 to 100 built from visible factors: what happened, how big the space is, what kind of business it is and how recent the signal is.</p>
        <p class="disclaimer" style="margin-top:18px;max-width:560px">The score is an estimate of how many signs point to a need. It is not a guarantee that a business needs cleaning or will hire you.</p>
      </div>
      ${best ? `<div class="card">
        <div class="card-head"><h3>${esc(CATALOG.bizById[best.businessId].name)}</h3>${sourceTag()}</div>
        <div class="factors">${best.scoreFactors.map(f => `<div class="factor"><div><span>${esc(f.label)}</span><div class="bar"><i style="width:${f.points * 4}%"></i></div></div><b>+${f.points}</b></div>`).join('')}
          <div class="factor total"><span>Opportunity score</span><b>${best.score}</b></div></div>
      </div>` : ''}
    </div>
  </div></section>

  <section class="sec"><div class="wrap">
    <span class="eyebrow">Pricing</span>
    <h2 style="margin-top:10px">Priced for a one-truck operation.</h2>
    <div class="price-grid">${Object.values(PLANS).map(p => priceCard(p, publicPriceCta(p))).join('')}</div>
  </div></section>

  <section class="sec sec-alt"><div class="wrap"><h2>Questions</h2>${faqBlock()}</div></section>
  ${pubFooter()}`;
}

function viewPricing() {
  return pubBar() + `
  <section class="sec"><div class="wrap">
    <span class="eyebrow">Pricing</span>
    <h1 style="font-size:clamp(34px,4.6vw,54px);margin-top:10px;font-weight:900">Simple pricing for small crews.</h1>
    <p class="lead">Every plan is free for ${TRIAL_DAYS} days. After that, pay monthly and change plans any time. ${billingNote()}</p>
    <div class="price-grid">${Object.values(PLANS).map(p => priceCard(p, publicPriceCta(p))).join('')}</div>
    <h2 style="margin-top:72px;font-size:30px">Common questions</h2>
    ${faqBlock()}
  </div></section>
  ${pubFooter()}`;
}

/* ---------- auth ---------- */
function viewAuth() {
  const signup = S.authTab === 'signup';
  return pubBar() + `<div class="center-page"><div class="panel">
    <h1>${signup ? 'Create your workspace' : 'Welcome back'}</h1>
    <p class="muted" style="margin-top:8px">${signup ? 'Takes about two minutes. Your service area comes next.' : 'Log in with the email you signed up with.'}</p>
    <div class="tabs" role="tablist">
      <button class="${signup ? 'on' : ''}" data-act="tab" data-tab="signup" role="tab">Sign up</button>
      <button class="${!signup ? 'on' : ''}" data-act="tab" data-tab="login" role="tab">Log in</button>
    </div>
    ${signup ? `<form id="form-signup" class="stack" novalidate>
      <div class="field"><label for="su-name">Your name</label><input class="input" id="su-name" autocomplete="name" placeholder="Alex Rivera"></div>
      <div class="field"><label for="su-company">Company name</label><input class="input" id="su-company" autocomplete="organization" placeholder="Rivera Commercial Cleaning"></div>
      <div class="field"><label for="su-email">Email</label><input class="input" id="su-email" type="email" autocomplete="email" placeholder="you@example.com"></div>
      <div class="field"><span class="lbl">Plan</span>
        <div class="plan-pick">${Object.values(PLANS).map(p => `<label><input type="radio" name="su-plan" value="${p.id}" ${S.selPlan === p.id ? 'checked' : ''}><b>${p.name}</b><span>${TRIAL_DAYS} days free, then $${p.price}/mo${p.popular ? ' · popular' : ''}</span></label>`).join('')}</div>
      </div>
      ${S.authErr ? `<div class="err" role="alert">${esc(S.authErr)}</div>` : ''}
      <button class="btn btn-primary btn-lg" type="submit">Start ${TRIAL_DAYS}-day free trial ${ico('arrow')}</button>
      <p class="hint">${stripeOn() ? `After a few questions you add a card with Stripe. You are not charged during the ${TRIAL_DAYS}-day trial.` : 'Preview build: no password or card is needed.'} Your workspace is saved only in this browser.</p>
    </form>` : `<form id="form-login" class="stack" novalidate>
      <div class="field"><label for="li-email">Email</label><input class="input" id="li-email" type="email" autocomplete="email" placeholder="you@example.com"></div>
      ${S.authErr ? `<div class="err" role="alert">${esc(S.authErr)}</div>` : ''}
      <button class="btn btn-primary btn-lg" type="submit">Log in</button>
    </form>`}
    <div class="divider">or</div>
    <button class="btn" style="width:100%" data-act="demo">Explore the demo account</button>
    <p class="hint" style="margin-top:10px;text-align:center">A Pro workspace on the live feed. Nothing to fill in.</p>
  </div></div>`;
}

function submitSignup() {
  const name = $('#su-name').value.trim(), company = $('#su-company').value.trim(), email = $('#su-email').value.trim();
  const plan = (document.querySelector('input[name="su-plan"]:checked') || {}).value || 'growth';
  S.selPlan = plan;
  if (!name || !company) { S.authErr = 'Enter your name and company name.'; return render(); }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { S.authErr = 'Enter a valid email address.'; return render(); }
  if (DB.users.some(u => u.email === email.toLowerCase())) { S.authErr = 'A workspace with that email already exists in this browser. Log in instead.'; return render(); }
  const u = createUser({ name, email, company, planId: plan });
  DB.session = u.id; saveStore(); S.authErr = '';
  S.ob = { step: 0, building: false, data: { type: 'office', cities: [landingCity()].filter(Boolean), miles: Math.min(25, PLANS[plan].maxMiles), minContract: 500, industries: CLEANING_TYPES[0].industries.slice(), crew: 'solo' } };
  go('onboarding');
}
function submitLogin() {
  const email = $('#li-email').value.trim().toLowerCase();
  const u = DB.users.find(x => x.email === email);
  if (!u) { S.authErr = 'No workspace for that email in this browser. Sign up, or explore the demo account.'; return render(); }
  DB.session = u.id; saveStore(); S.authErr = '';
  go(u.profile ? 'dashboard' : 'onboarding');
}
function startDemo() {
  let u = DB.users.find(x => x.demo);
  if (!u) {
    u = createUser({ name: 'Alex Rivera', email: 'alex@rivera-clean.example', company: 'Rivera Commercial Cleaning', planId: 'pro', demo: true });
    const here = cityById(landingCity());
    u.profile = { type: 'office', cities: here ? [here.id, ...nearestCities(here, 2, [here.id]).map(c => c.id)] : [], miles: 40, minContract: 0, industries: ['Professional services', 'Medical & dental', 'Tech & coworking'], crew: '2-3' };
  }
  DB.session = u.id; saveStore(); S.f = null;
  go('dashboard');
}

/* ---------- profile controls (onboarding + settings) ---------- */
const MILE_OPTIONS = [10, 15, 25, 40, 60];
const MIN_OPTIONS = [0, 250, 500, 1000, 2000];
const CREW_OPTIONS = [['solo', 'Just me'], ['2-3', '2 to 3 people'], ['4-9', '4 to 9 people'], ['10+', '10 or more']];
const P = () => S.route === 'onboarding' ? S.ob.data : currentUser().profile;

function ctlType(p) {
  return `<div class="choice-grid">${CLEANING_TYPES.map(t => `<button type="button" class="choice ${p.type === t.id ? 'on' : ''}" data-act="p-type" data-v="${t.id}"><b>${t.label}</b><span>${esc(t.hint)}</span></button>`).join('')}</div>`;
}
function ctlCities(p, plan) {
  const full = p.cities.length >= plan.maxCities;
  const home = cityById(p.cities[0]) || cityById(landingCity());
  const chosen = p.cities.map((id, i) => `<button type="button" class="chip on" data-act="p-city" data-v="${esc(id)}" title="Remove">${ico('check')}${esc(cityLabel(id))}${i === 0 ? ' · home base' : ''}</button>`).join('');
  return `<div class="chips">${chosen || '<span class="hint">No city picked yet.</span>'}</div>
  ${full ? '' : `<div style="margin-top:14px"><span class="lbl">${p.cities.length ? 'Add a nearby city, or search' : 'Pick the city you work from'}</span><div style="margin-top:8px">${cityPicker('profile', p.cities, home ? nearestCities(home, 8, p.cities) : [])}</div></div>`}
  <p class="hint" style="margin-top:10px">Distances are measured from the center of the nearest city you pick. The ${plan.name} plan covers up to ${plan.maxCities} ${plan.maxCities === 1 ? 'city' : 'cities'}${full ? ', so remove one to add another' : ''}. CleanScout covers ${fmtNum(CITIES.length)} cities so far.</p>`;
}
function ctlMiles(p, plan) {
  return `<div class="chips">${MILE_OPTIONS.map(m => {
    const locked = m > plan.maxMiles;
    return `<button type="button" class="chip ${p.miles === m ? 'on' : ''}" data-act="p-miles" data-v="${m}" ${locked ? 'disabled' : ''}>${locked ? ico('lock') : ''}${m} miles</button>`;
  }).join('')}</div>
  <p class="hint" style="margin-top:10px">Straight-line distance from the center of each city you service. The ${plan.name} plan reaches up to ${plan.maxMiles} miles.</p>`;
}
function ctlMin(p) {
  return `<div class="chips">${MIN_OPTIONS.map(m => `<button type="button" class="chip ${p.minContract === m ? 'on' : ''}" data-act="p-min" data-v="${m}">${m === 0 ? 'No minimum' : money(m) + '/month'}</button>`).join('')}</div>
  <p class="hint" style="margin-top:10px">Contract size is estimated from the size of the space and the type of business.</p>`;
}
function ctlInd(p) {
  return `<div class="chips"><button type="button" class="chip ${p.industries.length === 0 ? 'on' : ''}" data-act="p-ind" data-v="">No preference</button>${INDUSTRIES.map(i => `<button type="button" class="chip ${p.industries.includes(i) ? 'on' : ''}" data-act="p-ind" data-v="${esc(i)}">${esc(i)}</button>`).join('')}</div>`;
}
function ctlCrew(p) {
  return `<div class="chips">${CREW_OPTIONS.map(([id, l]) => `<button type="button" class="chip ${p.crew === id ? 'on' : ''}" data-act="p-crew" data-v="${id}">${l}</button>`).join('')}</div>`;
}

const OB_STEPS = [
  { q: 'What type of cleaning do you provide?', ctl: (p) => ctlType(p) },
  { q: 'What cities do you service?', ctl: (p, plan) => ctlCities(p, plan), valid: p => p.cities.length > 0 },
  { q: 'What is your maximum driving distance?', ctl: (p, plan) => ctlMiles(p, plan) },
  { q: 'What is the smallest contract worth your time?', ctl: (p) => ctlMin(p) },
  { q: 'What types of businesses do you prefer?', ctl: (p) => ctlInd(p) },
  { q: 'About how big is your crew?', ctl: (p) => ctlCrew(p) }
];

function viewOnboarding() {
  const u = currentUser(), plan = planOf(u), st = S.ob.step, step = OB_STEPS[st], p = S.ob.data;
  if (S.ob.building) {
    return pubBar() + `<div class="center-page"><div class="panel"><div class="building"><div class="ping"><i></i></div><h2 style="font-size:26px">Building your feed</h2><p class="muted" style="margin-top:8px">Matching current opportunities to your cities, distance and contract size.</p></div></div></div>`;
  }
  const valid = step.valid ? step.valid(p) : true;
  return pubBar() + `<div class="center-page"><div class="panel wide">
    <span class="eyebrow">Question ${st + 1} of ${OB_STEPS.length}</span>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${OB_STEPS.length}" aria-valuenow="${st + 1}"><i style="width:${((st + 1) / OB_STEPS.length) * 100}%"></i></div>
    <h1 style="font-size:28px">${step.q}</h1>
    <div style="margin-top:22px">${step.ctl(p, plan)}</div>
    <div class="ob-foot">
      <button class="btn btn-ghost" data-act="ob-back" ${st === 0 ? 'disabled' : ''}>${ico('back')} Back</button>
      <button class="btn btn-primary" data-act="ob-next" ${valid ? '' : 'disabled'}>${st === OB_STEPS.length - 1 ? 'Build my feed' : 'Next'} ${ico('arrow')}</button>
    </div>
  </div></div>`;
}

function finishOnboarding() {
  const u = currentUser();
  S.ob.building = true; render();
  const profile = JSON.parse(JSON.stringify(S.ob.data));
  Promise.all([buildCatalog(profile.cities), new Promise(r => setTimeout(r, 1200))]).then(([cat]) => {
    u.profile = profile;
    CATALOG = cat; S.catKey = null;
    saveStore(); S.f = null; S.ob.building = false; S.cityQ = '';
    if (stripeOn() && subOf(u).checkout !== 'done') return goToCheckout(u, u.planId);
    go('dashboard');
    toast(`Your feed is ready: ${fmtNum(matchedFor(u).length)} opportunities match your service area.`);
  });
}

/* ---------- app shell ---------- */
const NAV = [
  ['dashboard', 'Dashboard', 'dash'], ['opportunities', 'Opportunities', 'target'], ['pipeline', 'Pipeline', 'kanban'],
  ['saved', 'Saved leads', 'bookmark'], ['settings', 'Settings', 'sliders'], ['billing', 'Billing', 'card']
];
function appShell(u, inner) {
  const s = userStats(u), plan = s.plan;
  const active = S.route === 'detail' ? 'opportunities' : S.route;
  const unclaimed = s.matched.filter(x => !x.lead).length;
  const pct = Math.min(100, (s.used / s.limit) * 100);
  const initials = u.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const tab = [['dashboard', 'Home', 'dash'], ['opportunities', 'Leads', 'target'], ['pipeline', 'Pipeline', 'kanban'], ['saved', 'Saved', 'bookmark'], ['settings', 'Account', 'sliders']];
  const tabActive = ['billing', 'settings'].includes(active) ? 'settings' : active;
  return `<div class="app">
    <aside class="side">
      <button class="logo" data-act="go" data-to="dashboard">${logoMark()}<span>Clean<em>Scout</em></span></button>
      <nav class="nav" aria-label="App">${NAV.map(([id, label, ic]) => `<button class="${active === id ? 'on' : ''}" data-act="go" data-to="${id}" ${active === id ? 'aria-current="page"' : ''}>${ico(ic)}${label}${id === 'opportunities' && unclaimed ? `<span class="count">${unclaimed}</span>` : ''}${id === 'pipeline' && s.used ? `<span class="count">${s.used}</span>` : ''}</button>`).join('')}</nav>
      <div class="side-foot">
        <div class="plan-box"><b>${plan.name} plan</b> <span class="muted">${inTrial(subOf(u)) ? `Free trial · ${trialDaysLeft(subOf(u))} ${trialDaysLeft(subOf(u)) === 1 ? 'day' : 'days'} left` : `$${plan.price}/mo`}</span>
          <div class="meter ${s.used >= s.limit ? 'full' : ''}"><i style="width:${pct}%"></i></div>
          <div style="margin-top:6px" class="num">${s.used} of ${s.limit} opportunities used</div>
          ${plan.id !== 'pro' ? `<button class="btn btn-sm btn-primary" style="margin-top:10px;width:100%" data-act="go" data-to="billing">Upgrade</button>` : ''}
        </div>
        <div class="who"><div class="avatar">${esc(initials)}</div><div><b>${esc(u.name)}</b><span class="muted">${esc(u.company)}</span></div></div>
        <button class="btn btn-ghost btn-sm" data-act="logout" style="justify-content:flex-start">Log out</button>
      </div>
    </aside>
    <div class="main">
      <div class="m-top"><button class="logo" data-act="go" data-to="dashboard" style="font-size:18px">${logoMark()}<span>Clean<em>Scout</em></span></button><button class="pill" data-act="go" data-to="billing" style="border:0;cursor:pointer">${plan.name} · ${s.used}/${s.limit}</button></div>
      <div class="demo-banner">${ico('lock')}<span>${FEED_META.error ? 'The opportunity feed could not be loaded, so only your claimed leads are shown.' : `Public-record data, refreshed ${feedDate()}. Not verified by CleanScout, so confirm details before you reach out.`}${u.demo ? ' This is the demo account.' : ''}</span></div>
      <main class="page">${inner}</main>
    </div>
    <nav class="tabbar" aria-label="App">${tab.map(([id, l, ic]) => `<button class="${tabActive === id ? 'on' : ''}" data-act="go" data-to="${id}">${ico(ic)}${l}</button>`).join('')}</nav>
  </div>`;
}

/* ---------- dashboard ---------- */
function viewDashboard(u) {
  const s = userStats(u), p = u.profile;
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const renews = subOf(u) ? fmtDate(subOf(u).renewsAt) : '';
  const left = Math.max(0, s.limit - s.used);
  const wonAvg = s.won ? s.mrr / s.won : 0;
  const picks = s.matched.filter(x => !x.lead).sort((a, b) => b.fit - a.fit).slice(0, 3);
  const maxCount = Math.max(1, ...Object.values(s.counts));
  const prefs = `${p.cities.map(cityLabel).join(', ')} · within ${p.miles} mi${p.minContract ? ' · ' + money(p.minContract) + '+/mo' : ''}${p.industries.length ? ' · ' + p.industries.slice(0, 2).join(', ') + (p.industries.length > 2 ? ' +' + (p.industries.length - 2) : '') : ''}`;
  return appShell(u, `
    <div class="page-head"><div><h1>${greet}, ${esc(u.name.split(' ')[0])}</h1><p>Personalized for ${esc(prefs)}.</p></div>
      <button class="btn btn-primary" data-act="go" data-to="opportunities">See all opportunities ${ico('arrow')}</button></div>
    <div class="grid dash-top">
      <div class="card"><div class="card-head"><h3>Opportunities used this month</h3><span class="muted" style="font-size:13px">Resets ${esc(renews)}</span></div>
        <div class="big num">${s.used} <small>/ ${s.limit} opportunities used</small></div>
        <div class="meter ${s.used >= s.limit ? 'full' : ''}" style="margin-top:16px"><i style="width:${Math.min(100, s.used / s.limit * 100)}%"></i></div>
        <p class="muted" style="margin-top:10px;font-size:14px">${left} left on your ${s.plan.name} plan. Claiming an opportunity (saving it or marking it contacted) reveals its contact details and lookup links.</p></div>
      <div class="card"><div class="card-head"><h3>Monthly recurring revenue</h3></div>
        <div class="big num">${money(s.mrr)}<small>/mo</small></div>
        <div class="mrr-line num">${s.won ? `${s.won} won ${s.won === 1 ? 'contract' : 'contracts'} × ${money(wonAvg)}/month = <b>${money(s.mrr)} MRR</b>` : 'Win your first contract to start your MRR.'}<br><span class="muted">${money(s.potential)}/month potential in open deals</span></div></div>
    </div>
    <div class="grid tiles" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="tile"><b class="num">${s.matched.length}</b><span>Available this month</span></div>
      <div class="tile"><b class="num">${s.newThisWeek}</b><span>New this week</span></div>
      <div class="tile hot"><b class="num">${s.highPriority}</b><span>High opportunity, not yet claimed</span></div>
      <div class="tile"><b class="num">${s.contacted}</b><span>Opportunities contacted</span></div>
      <div class="tile"><b class="num">${s.walkthroughs}</b><span>Walkthroughs booked</span></div>
      <div class="tile"><b class="num">${s.proposals}</b><span>Proposals sent</span></div>
      <div class="tile"><b class="num">${s.won}</b><span>Contracts won</span></div>
      <div class="tile"><b class="num">${money(s.potential)}</b><span>Potential monthly revenue</span></div>
    </div>
    <div class="grid dash-mid" style="margin-top:16px">
      <div class="card"><div class="card-head"><h3>Your pipeline</h3><button class="btn btn-sm" data-act="go" data-to="pipeline">Open board</button></div>
        <div class="funnel">${PIPELINE_STAGES.map(st => `<div class="funnel-row ${st.id}"><span>${st.label}</span><div class="bar"><i style="width:${(s.counts[st.id] / maxCount) * 100}%;${s.counts[st.id] ? '' : 'opacity:.25'}"></i></div><b>${s.counts[st.id]}</b></div>`).join('')}</div></div>
      <div><div class="card-head" style="margin-bottom:10px"><h3 style="font-size:18px">Best matches for you</h3><span class="muted" style="font-size:13px">Highest score, closest, preferred industries</span></div>
        <div class="opp-list">${picks.length ? picks.map(x => oppCard(x, u)).join('') : `<div class="empty"><h3>Nothing new to claim</h3><p>You have claimed every opportunity that matches your area. Widen your distance or add a city in Settings.</p></div>`}</div></div>
    </div>`);
}

/* ---------- opportunities ---------- */
function ctl(label, key, options, value, locked, need) {
  return `<div class="field"><label for="f-${key}">${label}</label>
    <select class="select" id="f-${key}" data-f="${key}" ${locked ? 'disabled' : ''}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    ${locked ? `<span class="lock-row">${ico('lock')}${need} plan and above</span>` : ''}</div>`;
}
function filtersPanel(u, plan) {
  const f = S.f, p = u.profile, fe = plan.features;
  return `<div class="filters"><button class="btn filter-toggle" data-act="filters-toggle">${ico('filter')} Filters</button>
  <div class="card ${S.filtersOpen ? '' : 'collapsed'}">
    <div class="field"><label for="f-q">Search</label><input class="input" id="f-q" data-f="q" value="${esc(f.q)}" placeholder="Business, address or industry"></div>
    <div class="field"><span class="lbl">City</span><div class="chips">${p.cities.map(c => `<button class="chip ${f.cities.includes(c) ? 'on' : ''}" data-act="f-city" data-v="${esc(c)}">${esc(cityLabel(c))}</button>`).join('')}</div>
      <span class="hint">${f.cities.length ? '' : 'Showing all of your cities.'}</span></div>
    <div class="field"><label for="f-miles">Distance: <b id="miles-out">${f.miles}</b> mi from your ${p.cities.length > 1 ? 'nearest city' : 'city'} center</label><input type="range" id="f-miles" data-f="miles" min="5" max="${p.miles}" step="5" value="${f.miles}"></div>
    ${ctl('Opportunity score', 'minScore', [[0, 'Any score'], [60, '60 and up (Good)'], [75, '75 and up (High)'], [90, '90 and up (Exceptional)']], f.minScore, false)}
    ${ctl('Industry', 'industry', [['all', 'All industries'], ...INDUSTRIES.map(i => [i, i])], f.industry, !fe.industryFilter, 'Growth')}
    ${ctl('Opportunity type', 'type', [['all', 'All signals'], ...Object.entries(SIGNAL_TYPES).map(([k, v]) => [k, v.label])], f.type, !fe.typeFilter, 'Growth')}
    ${ctl('Office size', 'size', [['all', 'Any size'], ['small', 'Under 3,000 sq ft'], ['mid', '3,000 to 7,999 sq ft'], ['large', '8,000 sq ft and up']], f.size, !fe.sizeFilter, 'Growth')}
    ${ctl('Date discovered', 'age', [['all', 'Any time'], ['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days']], f.age, !fe.advancedFilter, 'Pro')}
    ${ctl('Status', 'status', [['all', 'Any status'], ['unclaimed', 'Not claimed'], ...PIPELINE_STAGES.map(s => [s.id, s.label])], f.status, !fe.advancedFilter, 'Pro')}
    ${p.minContract ? `<label class="toggle-row" style="padding:0"><span>Meets my ${money(p.minContract)}/mo minimum</span><span class="sw"><input type="checkbox" data-f="minContractOnly" ${f.minContractOnly ? 'checked' : ''}><i></i></span></label>` : ''}
    <button class="btn btn-sm" data-act="f-reset">Reset filters</button>
  </div></div>`;
}
function oppTable(list, u) {
  const plan = planOf(u);
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Score</th><th>Business</th><th>City</th><th>Signal</th><th>Detected</th><th>Contact</th><th>Est. value</th><th>Status</th></tr></thead><tbody>
  ${list.map(x => `<tr class="click" data-act="view" data-id="${x.opp.id}"><td><span class="t-score tier-${x.opp.tier}">${plan.features.scoreNumber ? x.opp.score : tierOf(x.opp.score).label}</span></td>
    <td><b>${esc(x.biz.name)}</b><br><span class="muted">${esc(x.biz.industry)}</span></td><td>${esc(x.biz.city)}</td><td><span class="signal">${esc(SIG(x.opp.primaryType).label)}</span></td>
    <td>${fmtDate(x.opp.detectedAt)}</td><td>${x.contact ? esc(x.contact.name) + '<br><span class="muted">' + esc(x.contact.company || x.contact.role) + '</span>' : '<span class="muted">None listed</span>'}</td>
    <td class="num">${money(x.opp.estValue)}/mo</td><td>${statusPill(x.lead)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function viewOpportunities(u) {
  ensureFilters(u);
  const plan = planOf(u), f = S.f, matched = matchedFor(u);
  const full = sortList(applyFilters(matched, f, u), f.sort);
  const list = full.slice(0, f.limit);
  const more = full.length > list.length ? `<div style="text-align:center;margin-top:16px"><button class="btn" data-act="f-more">Show ${Math.min(PAGE_SIZE, full.length - list.length)} more</button></div>` : '';
  return appShell(u, `
    <div class="page-head"><div><h1>Opportunities</h1><p>Each one has a reason it was flagged. Scores are estimates, not a guarantee that a business needs cleaning.</p></div>
      <button class="btn ${plan.features.csv ? '' : 'is-locked'}" data-act="export-csv" data-scope="opps">${ico(plan.features.csv ? 'download' : 'lock')} Export CSV</button></div>
    <div class="opps-layout">
      ${filtersPanel(u, plan)}
      <div>
        <div class="toolbar">
          <span class="result-count grow">Showing <b class="num">${fmtNum(list.length)}</b> of <span class="num">${fmtNum(full.length)}</span> that fit these filters (${fmtNum(matched.length)} in your area)</span>
          <div class="field" style="flex-direction:row;align-items:center;gap:8px"><label for="f-sort" style="white-space:nowrap">Sort by</label>
            <select class="select" id="f-sort" data-f="sort" style="width:auto">${[['score', 'Highest score'], ['newest', 'Newest'], ['closest', 'Closest'], ['largest', 'Largest opportunity']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="seg" role="group" aria-label="View"><button class="${f.view === 'cards' ? 'on' : ''}" data-act="f-view" data-v="cards">${ico('grid')}Cards</button><button class="${f.view === 'table' ? 'on' : ''}" data-act="f-view" data-v="table">${ico('rows')}Table</button></div>
        </div>
        ${list.length ? (f.view === 'table' ? oppTable(list, u) : `<div class="opp-list">${list.map(x => oppCard(x, u)).join('')}</div>`) + more
          : `<div class="empty"><h3>No opportunities match these filters</h3><p>Try a wider distance, a lower score or a different signal.</p><button class="btn btn-primary" data-act="f-reset">Reset filters</button></div>`}
      </div>
    </div>`);
}

/* ---------- detail ---------- */
function viewDetail(u) {
  const opp = CATALOG.oppById[S.params.id];
  if (!opp) return go('opportunities');
  const x = decorate(u, opp), { biz, contact, lead } = x, plan = planOf(u), t = tierOf(opp.score);
  const s = userStats(u), left = Math.max(0, s.limit - s.used);
  const acts = activitiesOf(u, opp.id);
  const items = acts.map(a => ({ text: a.text, at: a.at }));
  if (!acts.some(a => a.type === 'detected')) items.push({ text: 'Signal found in public records.', at: new Date(opp.detectedAt).toISOString() });
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  const draft = S.outreach === 'email' ? outreachEmail(u, x) : null;
  const outText = draft ? `Subject: ${draft.subject}\n\n${draft.body}` : outreachCall(u, x);
  const showNum = plan.features.scoreNumber;
  const stageBtns = PIPELINE_STAGES.filter(st => st.id !== 'new').map(st => `<button class="btn ${lead && lead.stageId === st.id ? 'on' : ''}" data-act="stage" data-id="${opp.id}" data-stage="${st.id}">${lead && lead.stageId === st.id ? ico('check') : ''}${st.btn}</button>`).join('');
  return appShell(u, `
    <button class="btn btn-ghost btn-sm" data-act="go" data-to="opportunities" style="margin-bottom:12px">${ico('back')} All opportunities</button>
    <div class="detail-head">
      ${scoreBadge(opp, showNum)}
      <div><div class="sig-row" style="margin-bottom:8px">${signalChips(opp)}${sourceTag()}</div><h1>${esc(biz.name)}</h1><p class="muted" style="margin-top:6px">${esc(biz.address)}, ${esc(biz.city)}, ${esc(biz.state)}</p></div>
      <div class="row"><button class="btn ${x.saved ? 'on' : ''}" data-act="save" data-id="${opp.id}">${ico('bookmark')}${x.saved ? 'Saved' : 'Save'}</button>${statusPill(lead)}</div>
    </div>
    <div class="detail-grid">
      <div>
        <div class="why-box"><h4>Why this was flagged</h4><p>${esc(opp.reason)}</p></div>
        <div class="card"><div class="card-head"><h3>Evidence and notes</h3></div>
          <div class="evidence">${opp.signalIds.map(id => CATALOG.sigById[id]).map(sg => `<div class="ev"><p>${esc(sg.evidence)}</p><small>${esc(SIG(sg.type).label)} · ${fmtDate(sg.detectedAt)} · ${esc(sg.sourceLabel)}${sg.sourceUrl ? ` · <a href="${esc(sg.sourceUrl)}" target="_blank" rel="noopener">View the public record</a>` : ''}</small></div>`).join('')}</div>
          <p class="disclaimer" style="margin-top:14px">Quoted from public records as published. CleanScout has not confirmed that this business is open, still at this address or looking for a cleaning provider.</p></div>
        <div class="card"><div class="card-head"><h3>Recommended action</h3></div><p>${esc(opp.recommendedAction)}</p></div>
        <div class="card"><div class="card-head"><h3>Business information</h3></div>
          <dl class="kv">
            <dt>Industry</dt><dd>${esc(biz.industry)}</dd>
            <dt>Property size</dt><dd class="num">${fmtNum(biz.sqft)} sq ft <span class="hint">${biz.sqftSource === 'permit' ? '(from the permit)' : '(typical for this type of business, not measured)'}</span></dd>
            ${biz.operator && biz.operator !== biz.name ? `<dt>Permit holder</dt><dd>${esc(biz.operator)}</dd>` : ''}
            ${biz.outlets > 1 ? `<dt>Locations</dt><dd class="num">Outlet number ${biz.outlets} for this operator</dd>` : ''}
            ${biz.opensAt ? `<dt>First sales date</dt><dd>${fmtDate(biz.opensAt)}</dd>` : ''}
            ${biz.summary ? `<dt>Permitted work</dt><dd>${esc(biz.summary)}</dd>` : ''}
            <dt>Distance</dt><dd>About ${Math.round(x.miles)} miles from the center of ${esc(x.from.name)}${biz.approxLocation ? ' <span class="hint">(address not mapped, measured from the city center)</span>' : ''}</dd>
            <dt>Look up</dt><dd>${lead ? lookupLinks(biz) : '<span class="muted">Revealed when you claim</span>'}</dd>
            <dt>Estimated contract</dt><dd class="num">${money(opp.estValue)}/month</dd>
          </dl></div>
        ${showNum ? `<div class="card"><div class="card-head"><h3>How the score was built</h3></div>
          <div class="factors">${opp.scoreFactors.map(fc => `<div class="factor"><div><span>${esc(fc.label)}</span><div class="bar"><i style="width:${Math.min(100, fc.points * 4)}%"></i></div></div><b>+${fc.points}</b></div>`).join('')}
            <div class="factor total"><span>Opportunity score (${t.label})</span><b>${opp.score}</b></div></div>
          <p class="disclaimer" style="margin-top:14px">An estimate based on observable signals. It is not a guarantee that this business needs cleaning.</p></div>`
          : `<div class="locked-box"><b>${ico('lock')} Score breakdown</b><span class="muted">See exactly how each score is built on the Growth plan and above.</span><button class="btn btn-sm" data-act="go" data-to="billing" style="align-self:flex-start">Compare plans</button></div>`}
      </div>
      <div>
        <div class="card"><div class="card-head"><h3>Pipeline status</h3>${statusPill(lead)}</div>
          <div class="status-grid">${stageBtns}</div>
          ${lead && lead.stageId !== 'new' ? `<button class="btn btn-ghost btn-sm" style="margin-top:10px" data-act="stage" data-id="${opp.id}" data-stage="new">Move back to New</button>` : ''}
          ${lead ? `<div class="field" style="margin-top:14px"><label for="val-input">Monthly contract value</label><input class="input mono" id="val-input" data-val="${opp.id}" inputmode="numeric" value="${lead.value || opp.estValue}"><span class="hint">Starts at the estimate. Edit it to match your quote.</span></div>` : `<p class="hint" style="margin-top:12px">Choosing a status claims this opportunity and adds it to your pipeline.</p>`}
        </div>
        <div class="card"><div class="card-head"><h3>${contact && contact.kind === 'contractor' ? 'Contact on the permit' : 'Decision maker'}</h3></div>
          ${contact ? `<div class="contact-card"><div><b style="font-size:17px">${esc(contact.name)}</b><br><span class="muted">${esc(contact.role)}</span></div>
            ${lead ? `${contact.email ? `<div class="contact-line">${ico('mail')}<span class="mono">${esc(contact.email)}</span><button class="btn btn-ghost btn-sm" data-act="copy" data-text="${esc(contact.email)}">${ico('copy')}Copy</button></div>` : ''}
            ${contact.phone ? `<div class="contact-line">${ico('phone')}<span class="mono">${esc(contact.phone)}</span><button class="btn btn-ghost btn-sm" data-act="copy" data-text="${esc(contact.phone)}">${ico('copy')}Copy</button></div>` : '<p class="muted">No phone number on the permit.</p>'}
            <div class="contact-line">${ico('globe')}<span>${lookupLinks(biz)}</span></div>`
            : `<div class="locked-box"><span>The phone number and lookup links are revealed when you claim this opportunity. It uses 1 of your ${left} remaining this month.</span><button class="btn btn-primary btn-sm" data-act="claim" data-id="${opp.id}" style="align-self:flex-start">Claim opportunity</button></div>`}</div>
            <p class="hint" style="margin-top:12px">${contact.kind === 'contractor' ? 'Listed on the public permit as the contractor doing the work. They arrange the final clean and usually know who is moving in.' : 'From the public record.'}</p>`
          : `<p class="muted">The public record does not name a contact for this business.</p>
            ${lead ? `<div class="contact-line" style="margin-top:10px">${ico('globe')}<span>${lookupLinks(biz)}</span></div>` : `<button class="btn btn-primary btn-sm" data-act="claim" data-id="${opp.id}" style="margin-top:10px">Claim opportunity</button>
            <p class="hint" style="margin-top:10px">Claiming adds it to your pipeline and gives you lookup links to find the phone number and website.</p>`}`}</div>
        <div class="card"><div class="card-head"><h3>Suggested outreach</h3></div>
          <div class="tabs outreach-tabs"><button class="${S.outreach === 'email' ? 'on' : ''}" data-act="outreach-tab" data-v="email">Email</button><button class="${S.outreach === 'call' ? 'on' : ''}" data-act="outreach-tab" data-v="call">Call script</button></div>
          <div class="pre" id="outreach-text">${esc(outText)}</div>
          <button class="btn btn-sm" style="margin-top:10px" data-act="copy-src" data-src="outreach-text">${ico('copy')}Copy ${S.outreach === 'email' ? 'email' : 'script'}</button></div>
        ${lead ? `<div class="card"><div class="card-head"><h3>Your notes</h3></div><textarea class="textarea" id="notes-input" data-note="${opp.id}" placeholder="Gate code, best time to call, what they said">${esc(lead.notes || '')}</textarea></div>` : ''}
        <div class="card"><div class="card-head"><h3>Activity history</h3></div>
          <ul class="timeline">${items.map(a => `<li><div>${esc(a.text)}<small>${fmtDateTime(a.at)}</small></div></li>`).join('')}</ul></div>
      </div>
    </div>`);
}

/* ---------- pipeline ---------- */
function viewPipeline(u) {
  const s = userStats(u);
  const leads = leadsOf(u).map(l => ({ lead: l, ...decorate(u, CATALOG.oppById[l.oppId]) }));
  const wonAvg = s.won ? s.mrr / s.won : 0;
  const cols = PIPELINE_STAGES.map(st => {
    const items = leads.filter(l => l.lead.stageId === st.id).sort((a, b) => new Date(b.lead.claimedAt) - new Date(a.lead.claimedAt));
    const sum = items.reduce((a, l) => a + (l.lead.value || 0), 0);
    return `<section class="col" data-col="${st.id}" aria-label="${st.label}">
      <div class="col-head"><h3>${st.label}</h3><span class="row" style="gap:8px"><span class="sum">${money(sum)}</span><span class="ct">${items.length}</span></span></div>
      ${items.length ? items.map(l => `<article class="pcard" draggable="true" data-card="${l.opp.id}">
        <h4 data-act="view" data-id="${l.opp.id}">${esc(l.biz.name)}</h4>
        <div class="meta"><span>${esc(l.biz.city)}</span><span class="signal" style="font-size:10.5px">${esc(SIG(l.opp.primaryType).label)}</span></div>
        <div class="meta"><span class="val">${money(l.lead.value || l.opp.estValue)}/mo</span>${l.contact ? `<span>${esc(l.contact.name)}</span>` : ''}</div>
        <div class="mv"><label class="sr" for="mv-${l.opp.id}">Move ${esc(l.biz.name)}</label>
          <select class="select" id="mv-${l.opp.id}" data-move="${l.opp.id}">${PIPELINE_STAGES.map(o => `<option value="${o.id}" ${o.id === st.id ? 'selected' : ''}>${o.id === st.id ? 'Stage: ' : 'Move to '}${o.label}</option>`).join('')}</select></div>
      </article>`).join('') : `<div class="empty-col">${st.id === 'new' ? 'Save an opportunity to start here.' : 'Drag a lead here or use the menu on a card.'}</div>`}
    </section>`;
  }).join('');
  return appShell(u, `
    <div class="page-head"><div><h1>Pipeline</h1><p>Drag a card to move it, or use the menu on the card.</p></div>
      <div class="card" style="padding:12px 18px"><div class="num" style="font-size:14px">${s.won ? `${s.won} won × ${money(wonAvg)}/mo = <b style="font-family:var(--f-display);font-size:22px">${money(s.mrr)} MRR</b>` : '<span class="muted">No won contracts yet</span>'}</div><div class="muted num" style="font-size:12.5px">${money(s.potential)}/mo potential in open deals</div></div></div>
    ${leads.length ? `<div class="board-wrap"><div class="board">${cols}</div></div>`
      : `<div class="empty"><h3>Your pipeline is empty</h3><p>Save or contact an opportunity and it appears here. Then move it through the stages as the conversation progresses.</p><button class="btn btn-primary" data-act="go" data-to="opportunities">Browse opportunities</button></div>`}`);
}

/* ---------- saved ---------- */
function viewSaved(u) {
  const plan = planOf(u);
  const list = savedOf(u).map(x => decorate(u, CATALOG.oppById[x.oppId])).sort((a, b) => b.opp.score - a.opp.score);
  return appShell(u, `
    <div class="page-head"><div><h1>Saved leads</h1><p>Opportunities you bookmarked. Saving one claims it and reveals the contact details.</p></div>
      <button class="btn ${plan.features.csv ? '' : 'is-locked'}" data-act="export-csv" data-scope="saved">${ico(plan.features.csv ? 'download' : 'lock')} Export CSV</button></div>
    ${list.length ? `<div class="opp-list">${list.map(x => oppCard(x, u)).join('')}</div>`
      : `<div class="empty"><h3>No saved leads yet</h3><p>Use Save on any opportunity to keep it here.</p><button class="btn btn-primary" data-act="go" data-to="opportunities">Browse opportunities</button></div>`}`);
}

/* ---------- settings ---------- */
function viewSettings(u) {
  const plan = planOf(u), p = u.profile;
  return appShell(u, `
    <div class="page-head"><div><h1>Settings</h1><p>Changes apply to your opportunity feed right away.</p></div><button class="btn" data-act="go" data-to="billing">${ico('card')} Billing</button></div>
    <div class="grid" style="max-width:820px">
      <div class="card"><div class="card-head"><h3>Account</h3></div>
        <div class="stack">
          <div class="field"><label for="st-name">Your name</label><input class="input" id="st-name" data-acct="name" value="${esc(u.name)}"></div>
          <div class="field"><label for="st-company">Company name</label><input class="input" id="st-company" data-acct="company" value="${esc(u.company)}"><span class="hint">Used in your suggested outreach messages.</span></div>
          <div class="field"><label for="st-email">Email</label><input class="input" id="st-email" value="${esc(u.email)}" disabled></div>
        </div></div>
      <div class="card"><div class="card-head"><h3>Your service profile</h3></div>
        <div class="stack">
          <div><span class="lbl">Type of cleaning</span><div style="margin-top:8px">${ctlType(p)}</div></div>
          <div><span class="lbl">Cities</span><div style="margin-top:8px">${ctlCities(p, plan)}</div></div>
          <div><span class="lbl">Maximum driving distance</span><div style="margin-top:8px">${ctlMiles(p, plan)}</div></div>
          <div><span class="lbl">Minimum contract size</span><div style="margin-top:8px">${ctlMin(p)}</div></div>
          <div><span class="lbl">Preferred businesses</span><div style="margin-top:8px">${ctlInd(p)}</div></div>
          <div><span class="lbl">Crew size</span><div style="margin-top:8px">${ctlCrew(p)}</div></div>
        </div></div>
      <div class="card"><div class="card-head"><h3>Notifications</h3></div>
        <label class="toggle-row"><span>Weekly email with new opportunities</span><span class="sw"><input type="checkbox" data-notify="weekly" ${u.notify.weekly ? 'checked' : ''}><i></i></span></label>
        <label class="toggle-row"><span>Alert when an Exceptional opportunity appears</span><span class="sw"><input type="checkbox" data-notify="highScore" ${u.notify.highScore ? 'checked' : ''}><i></i></span></label>
        <p class="hint">Preview: no emails are sent yet.</p></div>
      <div class="card"><div class="card-head"><h3>Data sources</h3><span class="muted" style="font-size:13px">${fmtNum(CATALOG.opportunities.length)} opportunities · ${fmtNum(CATALOG.signals.length)} signals · refreshed ${feedDate()}</span></div>
        ${PROVIDERS.map(pr => `<div class="provider-row"><div><b>${esc(pr.label)}</b><p>${esc(pr.note)}</p></div><span class="pill ${pr.status === 'active' ? 'live' : 'soon'}">${pr.status === 'active' ? `Live · ${fmtNum((FEED_META.sources.find(x => x.id === pr.id) || {}).records || 0)} records` : 'Not connected'}</span></div>`).join('')}
        <p class="hint" style="margin-top:12px">Every source feeds the same pipeline: records from the last ${FEED_META.windowDays || 90} days are filtered to likely commercial premises, merged by address and scored.</p></div>
      <div class="card"><div class="card-head"><h3>Workspace</h3></div>
        <div class="row">
          <button class="btn" data-act="reset-ask">Clear my pipeline and saved leads</button>
          <button class="btn btn-ghost" data-act="logout">Log out</button>
        </div>
        <p class="hint" style="margin-top:10px">${persisted ? 'Your workspace is stored in this browser only.' : 'This browser blocked storage, so your changes last until you close the page.'}</p></div>
    </div>`);
}

/* ---------- billing ---------- */
function viewBilling(u) {
  const plan = planOf(u), sub = subOf(u), s = userStats(u);
  const canceled = sub && sub.status === 'canceled';
  const trial = inTrial(sub);
  const pct = Math.min(100, s.used / s.limit * 100);
  return appShell(u, `
    <div class="page-head"><div><h1>Billing</h1><p>${stripeOn() ? 'Payments are handled by Stripe. CleanScout never sees your card number.' : 'Billing is simulated in this preview. No card is requested or charged.'}</p></div></div>
    <div class="grid" style="max-width:920px">
      ${stripeOn() && sub.checkout !== 'done' ? `<div class="card" style="border-color:var(--signal)"><div class="row" style="justify-content:space-between"><div><b>Add a card to keep your plan after the trial.</b><div class="muted" style="font-size:14px">You are not charged until ${fmtDate(sub.renewsAt)}.</div></div><button class="btn btn-primary" data-act="checkout" data-plan="${plan.id}">Continue to Stripe</button></div></div>` : ''}
      ${canceled ? `<div class="card" style="border-color:var(--crit)"><div class="row" style="justify-content:space-between"><div><b>Your ${trial ? 'free trial' : 'subscription'} is set to end on ${fmtDate(sub.renewsAt)}${trial ? ' and you will not be charged' : ''}.</b><div class="muted" style="font-size:14px">You keep full access until then.</div></div><button class="btn btn-primary" data-act="reactivate">Keep my plan</button></div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Current plan</h3><span class="pill ${trial && !canceled ? 'st-walkthrough' : 'st-won'}">${canceled ? 'Ending' : trial ? `Free trial · ${trialDaysLeft(sub)} ${trialDaysLeft(sub) === 1 ? 'day' : 'days'} left` : 'Active'}</span></div>
        <div class="row" style="justify-content:space-between;align-items:flex-end"><div><div class="big">${plan.name} <small>$${plan.price}/month</small></div><p class="muted" style="margin-top:8px">${canceled ? 'Ends' : trial ? `Free until ${fmtDate(sub.trialEndsAt)}, then $${plan.price}/month. First charge` : 'Renews'} ${fmtDate(sub.renewsAt)}</p></div></div>
        <div class="meter ${s.used >= s.limit ? 'full' : ''}" style="margin-top:18px"><i style="width:${pct}%"></i></div>
        <p class="num muted" style="margin-top:8px;font-size:14px">${s.used} of ${s.limit} opportunities used this month</p></div>
      <div><h3 style="font-size:20px;margin-bottom:12px">Change plan</h3>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr))">${Object.values(PLANS).map(pl => `<div class="plan-opt ${pl.id === plan.id ? 'cur' : ''}">
          <div class="row" style="justify-content:space-between"><b style="font-family:var(--f-display);font-size:20px">${pl.name}</b>${pl.popular ? '<span class="signal">Most Popular</span>' : ''}</div>
          <div class="amt">$${pl.price}<small>/month</small></div>
          <ul>${pl.bullets.map(b => `<li>${ico('check')}<span>${esc(b)}</span></li>`).join('')}</ul>
          ${pl.id === plan.id ? '<button class="btn" disabled>Current plan</button>' : `<button class="btn ${pl.price > plan.price ? 'btn-primary' : ''}" data-act="plan-ask" data-plan="${pl.id}">${pl.price > plan.price ? 'Upgrade' : 'Downgrade'} to ${pl.name}</button>`}
        </div>`).join('')}</div></div>
      <div class="two">
        <div class="card"><div class="card-head"><h3>Payment method</h3></div>${stripeOn()
          ? `<p class="muted">${sub.checkout === 'done' ? 'Your card is on file with Stripe.' : 'No card added yet.'}</p>${stripePortal() ? `<a class="btn btn-sm" style="margin-top:10px" href="${esc(stripePortal())}" target="_blank" rel="noopener">Manage billing in Stripe</a><p class="hint" style="margin-top:8px">Update your card, download invoices, switch plans or cancel there.</p>` : ''}`
          : '<p class="muted">None on file. Once Stripe is connected, cards are collected on Stripe\'s hosted page so card numbers never touch CleanScout.</p>'}</div>
        <div class="card"><div class="card-head"><h3>Invoices</h3></div><p class="muted">${stripeOn() ? 'Invoices are in the Stripe billing portal.' : 'No invoices in the preview.'}</p>${canceled ? '' : `<button class="btn btn-ghost btn-sm btn-danger" style="margin-top:10px;margin-left:-11px" data-act="cancel-ask">Cancel subscription</button>`}</div>
      </div>
    </div>`);
}

/* ---------- modal ---------- */
function csvFor(list, u) {
  const cols = ['Business name', 'Address', 'City', 'Industry', 'Permit holder', 'Space size (sq ft)', 'Size basis', 'Contact person', 'Contact role', 'Email', 'Phone', 'Public record', 'Opportunity score', 'Opportunity type', 'Reason for opportunity', 'Date detected', 'Recommended action', 'Lead status', 'Data source'];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = list.map(x => [x.biz.name, x.biz.address, x.biz.city + ', ' + x.biz.state, x.biz.industry, x.biz.operator || '', x.biz.sqft, x.biz.sqftSource === 'permit' ? 'permit' : 'typical for type', x.contact ? x.contact.name : '', x.contact ? x.contact.role : '',
    x.lead && x.contact ? x.contact.email || '' : '', x.lead && x.contact ? x.contact.phone || '' : '', (x.opp.signalIds.map(id => CATALOG.sigById[id]).find(g => g.sourceUrl) || {}).sourceUrl || '', x.opp.score, SIG(x.opp.primaryType).label, x.opp.reason,
    new Date(x.opp.detectedAt).toISOString().slice(0, 10), x.opp.recommendedAction, x.lead ? STAGE[x.lead.stageId].label : 'Not claimed', [...new Set(x.opp.signalIds.map(id => CATALOG.sigById[id].sourceLabel))].join('; ') + ' (not verified)']);
  return [cols.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\n');
}
/* The single-file build runs inside a viewer that blocks downloads, so it offers copy only. */
const CAN_DOWNLOAD = !window.CLEANSCOUT_EMBEDDED;
function modalHtml() {
  const m = S.modal, u = currentUser();
  if (!m) return '';
  let body = '';
  if (m.type === 'csv') {
    body = `<h3>Export ${m.count} ${m.count === 1 ? 'lead' : 'leads'} to CSV</h3>
      <p class="muted">${CAN_DOWNLOAD ? 'Download the file, or copy' : 'Copy'} the CSV and paste it into a spreadsheet. Contact details appear only for opportunities you have claimed.</p>
      <textarea class="textarea mono" id="csv-box" readonly style="min-height:200px;font-size:12px;white-space:pre">${esc(m.csv)}</textarea>
      <div class="modal-actions"><button class="btn" data-act="modal-close">Close</button><button class="btn" data-act="copy-src" data-src="csv-box">${ico('copy')}Copy CSV</button>${CAN_DOWNLOAD ? `<button class="btn btn-primary" data-act="csv-download">${ico('download')}Download</button>` : ''}</div>`;
  } else if (m.type === 'upgrade') {
    body = `<h3>${esc(m.title)}</h3><p class="muted">${esc(m.body)}</p>
      <div class="modal-actions"><button class="btn" data-act="modal-close">Not now</button><button class="btn btn-primary" data-act="go" data-to="billing">Compare plans</button></div>`;
  } else if (m.type === 'confirm') {
    body = `<h3>${esc(m.title)}</h3><p class="muted">${esc(m.body)}</p>
      <div class="modal-actions"><button class="btn" data-act="modal-close">Cancel</button><button class="btn ${m.danger ? 'btn-danger' : 'btn-primary'}" data-act="${m.action}" data-plan="${m.plan || ''}">${esc(m.label)}</button></div>`;
  }
  return `<div class="overlay" data-act="modal-bg"><div class="modal" role="dialog" aria-modal="true">${body}</div></div>`;
}

/* ---------- render ---------- */
function render() {
  const root = $('#root');
  const act = document.activeElement;
  const aid = act && act.id, ss = act && act.selectionStart, se = act && act.selectionEnd;
  const u = currentUser();
  if (APP_ROUTES.includes(S.route)) { if (!u) S.route = 'auth'; else if (!u.profile) S.route = 'onboarding'; }
  if (S.route === 'onboarding' && !u) S.route = 'auth';
  if (S.route === 'onboarding' && u && u.profile && !S.ob.building) S.route = 'dashboard';
  if (CATALOG && !S.ob.building) syncCatalog();
  let html = '';
  if (!CATALOG) html = '<div class="loading">Loading…</div>';
  else {
    switch (S.route) {
      case 'landing': html = viewLanding(); break;
      case 'pricing': html = viewPricing(); break;
      case 'auth': html = viewAuth(); break;
      case 'onboarding': html = viewOnboarding(); break;
      case 'dashboard': html = viewDashboard(u); break;
      case 'opportunities': html = viewOpportunities(u); break;
      case 'detail': html = viewDetail(u); break;
      case 'pipeline': html = viewPipeline(u); break;
      case 'saved': html = viewSaved(u); break;
      case 'settings': html = viewSettings(u); break;
      case 'billing': html = viewBilling(u); break;
      default: html = viewLanding();
    }
  }
  if (typeof html !== 'string') return;
  root.innerHTML = html + modalHtml();
  if (aid) {
    const el = document.getElementById(aid);
    if (el && el.tagName !== 'BUTTON') { try { el.focus(); if (ss != null && el.setSelectionRange && /text|search/.test(el.type || 'text')) el.setSelectionRange(ss, se); } catch (e) { /* ignore */ } }
  }
}

/* ---------- actions ---------- */
function claim(u, oppId) {
  if (leadOf(u, oppId)) return true;
  const plan = planOf(u);
  if (claimedCount(u) >= plan.limit) {
    const next = plan.id === 'solo' ? PLANS.growth : plan.id === 'growth' ? PLANS.pro : null;
    S.modal = { type: 'upgrade', title: `You have used all ${plan.limit} opportunities this month`,
      body: next ? `Claiming reveals contact details and adds a lead to your pipeline. ${next.name} includes ${next.limit} per month for $${next.price}.` : 'Your allowance renews at the start of next month.' };
    render(); return false;
  }
  const opp = CATALOG.oppById[oppId];
  DB.snapshots[oppId] = CATALOG.rawByOpp[oppId];
  DB.pipeline.push({ userId: u.id, oppId, stageId: 'new', value: opp.estValue, claimedAt: new Date().toISOString() });
  addActivity(u, oppId, 'claimed', 'Claimed and added to your pipeline.');
  return true;
}
function setStage(u, oppId, stage) {
  if (!claim(u, oppId)) return;
  const lead = leadOf(u, oppId);
  if (lead.stageId !== stage) {
    lead.stageId = stage;
    addActivity(u, oppId, 'stage', `Moved to ${STAGE[stage].label}.`);
  }
  saveStore(); render();
  const b = CATALOG.bizById[CATALOG.oppById[oppId].businessId].name;
  toast(stage === 'won' ? `Won! ${b} adds ${money(lead.value)}/month to your MRR.` : `${b}: ${STAGE[stage].label}`);
}
function toggleSave(u, oppId) {
  const i = DB.saved.findIndex(s => s.userId === u.id && s.oppId === oppId);
  if (i >= 0) {
    DB.saved.splice(i, 1);
    const lead = leadOf(u, oppId);
    if (lead && lead.stageId === 'new') { DB.pipeline.splice(DB.pipeline.indexOf(lead), 1); dropSnapshots(); }
    saveStore(); render(); toast('Removed from saved leads');
    return;
  }
  if (!claim(u, oppId)) return;
  DB.saved.push({ userId: u.id, oppId, at: new Date().toISOString() });
  addActivity(u, oppId, 'saved', 'Saved to your leads.');
  saveStore(); render(); toast('Saved. Contact details are now visible.');
}
function afterProfileChange(u) {
  S.f = null; saveStore();
  if (S.route !== 'onboarding') { render(); toast('Preferences updated'); } else render();
}
async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg || 'Copied'); }
  catch (e) { toast('Copy was blocked here. Select the text and copy it manually.'); }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const d = el.dataset, u = currentUser();
  switch (d.act) {
    case 'go': go(d.to); break;
    case 'scroll': {
      const doScroll = () => { const t = document.getElementById(d.target); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      if (S.route !== 'landing') { go('landing'); setTimeout(doScroll, 60); } else doScroll();
      break;
    }
    case 'auth': S.authTab = d.tab || 'signup'; S.authErr = ''; if (d.plan) S.selPlan = d.plan; go('auth'); break;
    case 'tab': S.authTab = d.tab; S.authErr = ''; render(); break;
    case 'demo': startDemo(); break;
    case 'logout': DB.session = null; saveStore(); S.f = null; go('landing'); break;
    case 'view': go('detail', { id: d.id }); break;
    case 'save': toggleSave(u, d.id); break;
    case 'contacted': setStage(u, d.id, 'contacted'); break;
    case 'claim': if (claim(u, d.id)) { saveStore(); render(); toast('Claimed. Contact details are now visible.'); } break;
    case 'stage': setStage(u, d.id, d.stage); break;
    case 'f-city': { const i = S.f.cities.indexOf(d.v); if (i >= 0) S.f.cities.splice(i, 1); else S.f.cities.push(d.v); S.f.limit = PAGE_SIZE; render(); break; }
    case 'f-more': S.f.limit += PAGE_SIZE; render(); break;
    case 'checkout': if (stripeLink(d.plan)) goToCheckout(u, d.plan); break;
    case 'land-city': setLandingCity(d.v, true); break;
    case 'f-reset': S.f = defaultFilters(u); render(); break;
    case 'f-view': S.f.view = d.v; render(); break;
    case 'filters-toggle': S.filtersOpen = !S.filtersOpen; render(); break;
    case 'export-csv': {
      const plan = planOf(u);
      if (!plan.features.csv) { S.modal = { type: 'upgrade', title: 'CSV export is on Growth and Pro', body: 'Upgrade to export your opportunities and saved leads to a spreadsheet.' }; render(); break; }
      let list;
      if (d.scope === 'saved') list = savedOf(u).map(x => decorate(u, CATALOG.oppById[x.oppId]));
      else { ensureFilters(u); list = sortList(applyFilters(matchedFor(u), S.f, u), S.f.sort); }
      S.modal = { type: 'csv', csv: csvFor(list, u), count: list.length }; render(); break;
    }
    case 'copy': copyText(d.text); break;
    case 'csv-download': {
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([S.modal.csv], { type: 'text/csv' }));
        a.download = `cleanscout-leads-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch (er) { toast('Download was blocked here. Use Copy CSV instead.'); }
      break;
    }
    case 'copy-src': {
      const t = document.getElementById(d.src);
      const text = t ? (t.value != null && t.tagName === 'TEXTAREA' ? t.value : t.textContent) : '';
      copyText(text).then(() => { if (t && t.tagName === 'TEXTAREA') { try { t.select(); } catch (er) { /* ignore */ } } });
      break;
    }
    case 'outreach-tab': S.outreach = d.v; render(); break;
    case 'modal-close': S.modal = null; render(); break;
    case 'modal-bg': if (e.target === el) { S.modal = null; render(); } break;

    case 'p-type': { const p = P(); p.type = d.v; p.industries = CLEANING_TYPES.find(t => t.id === d.v).industries.slice(); u.profile ? afterProfileChange(u) : render(); break; }
    case 'p-city': {
      const p = P(), i = p.cities.indexOf(d.v);
      if (i >= 0) { if (p.cities.length > 1 || S.route === 'onboarding') p.cities.splice(i, 1); else return toast('Keep at least one city.'); }
      else if (p.cities.length < planOf(u).maxCities) p.cities.push(d.v);
      S.cityQ = '';
      u.profile ? afterProfileChange(u) : render(); break;
    }
    case 'p-miles': { P().miles = Number(d.v); u.profile ? afterProfileChange(u) : render(); break; }
    case 'p-min': { P().minContract = Number(d.v); u.profile ? afterProfileChange(u) : render(); break; }
    case 'p-ind': {
      const p = P();
      if (!d.v) p.industries = []; else { const i = p.industries.indexOf(d.v); if (i >= 0) p.industries.splice(i, 1); else p.industries.push(d.v); }
      u.profile ? afterProfileChange(u) : render(); break;
    }
    case 'p-crew': { P().crew = d.v; u.profile ? afterProfileChange(u) : render(); break; }
    case 'ob-next': if (S.ob.step === OB_STEPS.length - 1) finishOnboarding(); else { S.ob.step++; render(); } break;
    case 'ob-back': if (S.ob.step > 0) { S.ob.step--; render(); } break;

    case 'plan-ask': {
      const np = PLANS[d.plan], up = np.price > planOf(u).price;
      S.modal = { type: 'confirm', title: `${up ? 'Upgrade' : 'Downgrade'} to ${np.name}?`, body: `${np.name} is $${np.price}/month with ${np.limit} opportunities, up to ${np.maxCities} ${np.maxCities === 1 ? 'city' : 'cities'} and ${np.maxMiles} miles. ${inTrial(subOf(u)) ? `Your free trial keeps running until ${fmtDate(subOf(u).trialEndsAt)}. ` : ''}${stripeOn() ? (subOf(u).checkout === 'done' ? 'Also switch the plan in the Stripe billing portal so your charge matches.' : 'You will add a card with Stripe next.') : 'This is a simulated change and no card is charged.'}${!up ? ' Cities and distance beyond the new limits are trimmed.' : ''}`, label: `Switch to ${np.name}`, action: 'plan-confirm', plan: d.plan };
      render(); break;
    }
    case 'plan-confirm': {
      const np = PLANS[d.plan];
      if (stripeOn() && subOf(u).checkout !== 'done') { S.modal = null; goToCheckout(u, np.id); break; }
      u.planId = np.id; const sub = subOf(u); sub.planId = np.id; sub.status = 'active';
      u.profile.cities = u.profile.cities.slice(0, np.maxCities);
      u.profile.miles = Math.min(u.profile.miles, np.maxMiles);
      S.modal = null; S.f = null; saveStore(); render(); toast(`You are on the ${np.name} plan.`); break;
    }
    case 'cancel-ask': S.modal = { type: 'confirm', title: inTrial(subOf(u)) ? 'Cancel your free trial?' : 'Cancel your subscription?', body: inTrial(subOf(u)) ? 'You keep full access until the trial ends and you are never charged. You can keep your plan any time before then.' : 'You keep full access until the end of this billing period. You can keep your plan any time before then.', label: 'Cancel subscription', action: 'cancel-confirm', danger: true }; render(); break;
    case 'cancel-confirm': subOf(u).status = 'canceled'; S.modal = null; saveStore(); render(); toast(inTrial(subOf(u)) ? 'Trial will end without a charge.' : 'Subscription set to end at the period close.'); break;
    case 'reactivate': subOf(u).status = 'active'; saveStore(); render(); toast('Your plan will renew as usual.'); break;
    case 'reset-ask': S.modal = { type: 'confirm', title: 'Clear your pipeline and saved leads?', body: 'This removes every claimed lead, status, note and activity entry from this workspace, and resets your monthly usage. Your account and preferences stay.', label: 'Clear everything', action: 'reset-confirm', danger: true }; render(); break;
    case 'reset-confirm':
      DB.pipeline = DB.pipeline.filter(x => x.userId !== u.id); DB.saved = DB.saved.filter(x => x.userId !== u.id); DB.activities = DB.activities.filter(x => x.userId !== u.id);
      dropSnapshots(); S.modal = null; saveStore(); render(); toast('Workspace cleared.'); break;
  }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'form-signup') submitSignup();
  if (e.target.id === 'form-login') submitLogin();
});

let qTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f === 'q') { S.f.q = t.value; S.f.limit = PAGE_SIZE; clearTimeout(qTimer); qTimer = setTimeout(render, 220); }
  if (t.dataset.cityq) { S.cityQ = t.value; clearTimeout(qTimer); qTimer = setTimeout(render, 180); }
  if (t.dataset.f === 'miles') { const o = $('#miles-out'); if (o) o.textContent = t.value; }
});
document.addEventListener('change', e => {
  const t = e.target, u = currentUser();
  if (!u) return;
  if (t.dataset.f && t.dataset.f !== 'q') {
    const k = t.dataset.f;
    if (t.type === 'checkbox') S.f[k] = t.checked;
    else S.f[k] = ['miles', 'minScore'].includes(k) ? Number(t.value) : t.value;
    S.f.limit = PAGE_SIZE;
    render();
  } else if (t.dataset.move) { setStage(u, t.dataset.move, t.value); }
  else if (t.dataset.val) {
    const lead = leadOf(u, t.dataset.val), n = Number(String(t.value).replace(/[^0-9.]/g, ''));
    if (lead && n > 0) { lead.value = Math.round(n); addActivity(u, t.dataset.val, 'value', `Monthly contract value set to ${money(n)}.`); saveStore(); render(); toast('Contract value updated'); }
    else { toast('Enter a monthly amount greater than zero.'); render(); }
  } else if (t.dataset.note) {
    const lead = leadOf(u, t.dataset.note);
    if (lead) { lead.notes = t.value; if (t.value.trim()) addActivity(u, t.dataset.note, 'note', 'Note updated.'); saveStore(); toast('Note saved'); }
  } else if (t.dataset.acct) { u[t.dataset.acct] = t.value.trim() || u[t.dataset.acct]; saveStore(); toast('Saved'); }
  else if (t.dataset.notify) { u.notify[t.dataset.notify] = t.checked; saveStore(); toast('Notification setting saved'); }
});

/* drag and drop between pipeline columns */
let dragId = null;
document.addEventListener('dragstart', e => {
  const c = e.target.closest && e.target.closest('[data-card]');
  if (!c) return;
  dragId = c.dataset.card; c.classList.add('dragging');
  try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* ignore */ }
});
document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.dragging,.over').forEach(n => n.classList.remove('dragging', 'over')); });
document.addEventListener('dragover', e => {
  const col = e.target.closest && e.target.closest('[data-col]');
  if (!col || !dragId) return;
  e.preventDefault();
  document.querySelectorAll('.col.over').forEach(n => { if (n !== col) n.classList.remove('over'); });
  col.classList.add('over');
});
document.addEventListener('drop', e => {
  const col = e.target.closest && e.target.closest('[data-col]');
  if (!col || !dragId) return;
  e.preventDefault();
  const id = dragId; dragId = null;
  setStage(currentUser(), id, col.dataset.col);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modal) { S.modal = null; render(); } });

/* ---------- boot ---------- */
async function boot() {
  loadStore();
  render();
  try { await loadIndex(); } catch (e) { FEED_META.error = e.message || 'unavailable'; }
  const u = currentUser();
  if (u) S.route = u.profile ? 'dashboard' : 'onboarding';
  const ids = activeCityIds();
  S.catKey = ids.slice().sort().join(',');
  CATALOG = await buildCatalog(ids);
  finishCheckout();
  render();
  locateVisitor();
}
if (typeof document !== 'undefined' && document.getElementById('root')) boot();
