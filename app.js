// ── Supabase setup ──────────────────────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ztomblmoegchycarlskc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0b21ibG1vZWdjaHljYXJsc2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTUxNTAsImV4cCI6MjA4OTc3MTE1MH0.pDKDGl8t6k6E6TEArsT_hZMdaeY_ZUfbUg1aAG3LKRM';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────
// Extracts IATA code from datalist values like "Manchester (MAN)" or plain "MAN"
function extractIATA(val) {
  if (!val) return '';
  const m = val.match(/\(([A-Z]{3})\)/);
  return m ? m[1] : val.trim().toUpperCase();
}

// Maps IATA code → full display name for datalist autofill
const AIRPORT_NAMES = {"ABZ":"Aberdeen","AUH":"Abu Dhabi","ALC":"Alicante","AMS":"Amsterdam","AYT":"Antalya","ATH":"Athens","ATL":"Atlanta","BCN":"Barcelona","BSL":"Basel","PEK":"Beijing Capital","PKX":"Beijing Daxing","BHD":"Belfast City","BFS":"Belfast International","BER":"Berlin","BHX":"Birmingham","BOG":"Bogotá","BOS":"Boston","BRS":"Bristol","BRU":"Brussels","OTP":"Bucharest","BUD":"Budapest","CAI":"Cairo","YYC":"Calgary","CUN":"Cancún","CPT":"Cape Town","CMN":"Casablanca","CLT":"Charlotte","ORD":"Chicago O'Hare","CPH":"Copenhagen","DFW":"Dallas/Fort Worth","DEN":"Denver","DOH":"Doha","DXB":"Dubai","DUB":"Dublin","DUS":"Düsseldorf","EDI":"Edinburgh","EXT":"Exeter","FAO":"Faro","FRA":"Frankfurt","GVA":"Geneva","GLA":"Glasgow","LPA":"Gran Canaria","CAN":"Guangzhou","HEL":"Helsinki","SGN":"Ho Chi Minh City","HKG":"Hong Kong","IAH":"Houston","HRG":"Hurghada","IST":"Istanbul","CGK":"Jakarta","JFK":"New York JFK","JNB":"Johannesburg","KUL":"Kuala Lumpur","LOS":"Lagos","ACE":"Lanzarote","LBA":"Leeds Bradford","LIS":"Lisbon","LCY":"London City","LGW":"London Gatwick","LHR":"London Heathrow","LTN":"London Luton","STN":"London Stansted","LAX":"Los Angeles","MAD":"Madrid","AGP":"Málaga","MLA":"Malta","MAN":"Manchester","MRU":"Mauritius","MEL":"Melbourne","MEX":"Mexico City","MIA":"Miami","BGY":"Milan Bergamo","MXP":"Milan Malpensa","MSP":"Minneapolis","YUL":"Montréal","DME":"Moscow Domodedovo","SVO":"Moscow Sheremetyevo","MUC":"Munich","NBO":"Nairobi","NAP":"Naples","EWR":"New York Newark","NCE":"Nice","MCO":"Orlando","OSL":"Oslo","YOW":"Ottawa","PMI":"Palma de Mallorca","CDG":"Paris Charles de Gaulle","ORY":"Paris Orly","PHL":"Philadelphia","PHX":"Phoenix","PRG":"Prague","RIX":"Riga","FCO":"Rome Fiumicino","GRU":"São Paulo","SEA":"Seattle","ICN":"Seoul Incheon","SVQ":"Seville","PVG":"Shanghai Pudong","SIN":"Singapore","SOF":"Sofia","SYD":"Sydney","TLV":"Tel Aviv","TFS":"Tenerife South","HND":"Tokyo Haneda","NRT":"Tokyo Narita","YYZ":"Toronto Pearson","YVR":"Vancouver","VCE":"Venice","VIE":"Vienna","WAW":"Warsaw","IAD":"Washington DC","ZAG":"Zagreb","ZRH":"Zurich"};
function iataToDisplay(code) {
  return code && AIRPORT_NAMES[code] ? `${AIRPORT_NAMES[code]} (${code})` : (code || '');
}

// ── App state ────────────────────────────────────────────────────────────────
// Still used for in-memory rendering — Supabase is the source of truth on disk
let S = { user: null, tripId: null, tripStart: '', tripEnd: '', flights: [], parks: [], dining: [], activities: [], settings: {} };
let dragSrc = null;
const aIcons = { attraction: '🎡', shopping: '🛍', show: '🎭', transport: '🚌', hotel: '🏨', other: '📌' };

// ── Auth tab toggle ──────────────────────────────────────────────────────────
function switchTab(t) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', (i === 0 && t === 'login') || (i === 1 && t === 'signup')));
  document.getElementById('loginForm').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = t === 'signup' ? 'block' : 'none';
  const c = document.querySelector('.auth-card');
  c.querySelector('h2').textContent = t === 'login' ? 'Welcome back' : 'Create account';
  c.querySelectorAll('p')[0].textContent = t === 'login' ? 'Sign in to your trip planner' : 'Start planning your Orlando trip';
}

// ── Sign in ──────────────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  if (!email || !password) { toast('Please enter your email and password'); return; }

  const btn = document.querySelector('#loginForm .btn-accent');
  btn.textContent = 'Signing in…'; btn.disabled = true;

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  btn.textContent = 'Sign in →'; btn.disabled = false;

  if (error) { toast(error.message); return; }

  S.user = { name: data.user.user_metadata?.name || email.split('@')[0], email: data.user.email };
  await loadFromDB();
  showApp();
}

// ── Sign up ──────────────────────────────────────────────────────────────────
async function doSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPass').value;
  if (!name || !email || !password) { toast('Please fill in all fields'); return; }
  if (password.length < 6) { toast('Password must be at least 6 characters'); return; }

  const btn = document.querySelector('#signupForm .btn-accent');
  btn.textContent = 'Creating account…'; btn.disabled = true;

  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { name } }
  });

  btn.textContent = 'Create account →'; btn.disabled = false;

  if (error) { toast(error.message); return; }

  // Supabase sends a confirmation email by default — let the user know
  if (data.user && !data.session) {
    toast('Check your email to confirm your account, then sign in');
    switchTab('login');
    return;
  }

  S.user = { name, email };
  await loadFromDB();
  showApp();
}

// ── Sign out ─────────────────────────────────────────────────────────────────
let loggingOut = false;
async function logout() {
  if (loggingOut) return;
  loggingOut = true;
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

function confirmDeleteAccount() {
  const modal = document.getElementById('deleteModal');
  document.getElementById('deleteConfirmInput').value = '';
  modal.style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
}

async function doDeleteAccount() {
  const input = document.getElementById('deleteConfirmInput').value.trim();
  if (input !== 'DELETE') { toast('Type DELETE to confirm'); return; }

  const btn = document.getElementById('deleteConfirmBtn');
  btn.textContent = 'Deleting…'; btn.disabled = true;

  try {
    const { data: sessionData } = await sb.auth.getSession();
    const session = sessionData?.session;
    if (!session) { toast('Please sign out and sign back in, then try again'); return; }

    const res = await fetch('https://ztomblmoegchycarlskc.supabase.co/functions/v1/delete-account', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0b21ibG1vZWdjaHljYXJsc2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTUxNTAsImV4cCI6MjA4OTc3MTE1MH0.pDKDGl8t6k6E6TEArsT_hZMdaeY_ZUfbUg1aAG3LKRM',
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    const error = res.ok ? null : data;

    if (error || data?.error) throw new Error(error?.message || data?.error);

    await sb.auth.signOut();
    window.location.href = 'index.html';
  } catch (err) {
    toast('Delete failed: ' + err.message);
    btn.textContent = 'Delete account'; btn.disabled = false;
  }
}
// ── Show the main app UI ─────────────────────────────────────────────────────
function showApp() {
  document.getElementById('authWrap').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  const ini = S.user.name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('topAv').textContent = ini;
  document.getElementById('topName').textContent = S.user.name.split(' ')[0];
  if (S.tripStart) document.getElementById('tStart').value = S.tripStart;
  if (S.tripEnd) document.getElementById('tEnd').value = S.tripEnd;
  if (S.settings.name) document.getElementById('sName').value = S.settings.name;
  if (S.settings.party) document.getElementById('sParty').value = S.settings.party;
  if (S.settings.airport) document.getElementById('sAirport').value = iataToDisplay(S.settings.airport);
  onDirChange(document.getElementById('fDir').value, false);
  renderAll(); startCd();
}

// ── Load all data from Supabase ──────────────────────────────────────────────
async function loadFromDB() {
  // Get or create the user's trip
  let { data: trips } = await sb.from('trips').select('*').order('created_at', { ascending: true }).limit(1);

  if (!trips || trips.length === 0) {
    // First time user — create their trip record
    const { data: newTrip } = await sb.from('trips').insert({ user_id: (await sb.auth.getUser()).data.user.id }).select().single();
    trips = [newTrip];
  }

  const trip = trips[0];
  S.tripId = trip.id;
  S.tripStart = trip.start_date || '';
  S.tripEnd = trip.end_date || '';

  // Load all events for this trip
  const { data: events } = await sb.from('events').select('*').eq('trip_id', S.tripId).order('date').order('time');

  S.flights = [];
  S.parks = [];
  S.dining = [];
  S.activities = [];

  (events || []).forEach(e => {
    const item = { id: e.id, date: e.date, time: e.time, ...e.metadata };
    if (e.type === 'flight') S.flights.push(item);
    else if (e.type === 'park') S.parks.push(item);
    else if (e.type === 'dining') S.dining.push(item);
    else if (e.type === 'activity') S.activities.push(item);
  });
}

// ── Save trip dates to Supabase ──────────────────────────────────────────────
async function saveDates() {
  S.tripStart = document.getElementById('tStart').value;
  S.tripEnd = document.getElementById('tEnd').value;

  if (S.tripId) {
    await sb.from('trips').update({ start_date: S.tripStart || null, end_date: S.tripEnd || null }).eq('id', S.tripId);
  }

  updateDash(); updateCd(); toast('Trip dates saved');
}

// ── Save settings (stored in trip metadata for now) ──────────────────────────
async function saveSettings() {
  S.settings = {
    name: document.getElementById('sName').value,
    party: document.getElementById('sParty').value,
    airport: extractIATA(document.getElementById('sAirport').value)
  };
  // Store settings as extra columns on the trip or just keep local for now
  toast('Settings saved');
}

// ── Generic event save to Supabase ───────────────────────────────────────────
async function saveEvent(type, metadata, date, time, sortOrder = 0) {
  const { data, error } = await sb.from('events').insert({
    trip_id: S.tripId,
    type,
    date: date || null,
    time: time || null,
    metadata,
    sort_order: sortOrder
  }).select().single();

  if (error) { toast('Save failed: ' + error.message); return null; }
  return data.id; // return the Supabase-generated UUID
}

// ── Generic event delete from Supabase ───────────────────────────────────────
async function deleteEvent(id) {
  await sb.from('events').delete().eq('id', id);
}

// ── Update sort order for parks (after drag/drop) ────────────────────────────
async function updateParkOrder() {
  for (let i = 0; i < S.parks.length; i++) {
    await sb.from('events').update({ sort_order: i }).eq('id', S.parks[i].id);
  }
}

// ── Flight lookup via Supabase Edge Function (key stays server-side) ─────────
async function lookupFlight() {
  const raw = document.getElementById('fLookup').value.trim().toUpperCase();
  if (!raw) { toast('Enter a flight number first'); return; }

  const match = raw.match(/^([A-Z]{2,3})(\d+)$/);
  if (!match) { toast('Format: airline code + number, e.g. BA2099'); return; }

  const btn = document.querySelector('.lookup-row .btn');
  btn.textContent = 'Searching…'; btn.disabled = true;

  try {
    const { data, error } = await sb.functions.invoke('flight-lookup', {
      body: { flightNumber: raw }
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error.info || data.error.message);

    const flights = data?.data;
    if (!flights || !flights.length) { toast('No flight found for ' + raw); return; }

    const f = flights[0];
    document.getElementById('fNum').value = raw;
    document.getElementById('fAir').value = f.airline?.name || match[1];
    if (f.departure?.scheduled) document.getElementById('fDep').value = toLocalDTInput(new Date(f.departure.scheduled));
    if (f.arrival?.scheduled) document.getElementById('fArr').value = toLocalDTInput(new Date(f.arrival.scheduled));

    const arrIata = (f.arrival?.iata || '').toUpperCase();
    const dir = ['MCO', 'SFB', 'ISM', 'ORL', 'MLB'].includes(arrIata) ? 'out' : 'ret';
    document.getElementById('fDir').value = dir;
    onDirChange(dir, false);
    document.getElementById('fFrom').value = iataToDisplay(f.departure?.iata) || '';
    document.getElementById('fTo').value = iataToDisplay(f.arrival?.iata) || '';

    toast('Flight details filled in ✦ Check and confirm before saving');
  } catch (err) {
    toast('Lookup failed: ' + err.message);
  } finally {
    btn.textContent = 'Look up'; btn.disabled = false;
  }
}

function toLocalDTInput(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ── Direction toggle — auto-set To field ─────────────────────────────────────
function onDirChange(dir, clearFields = true) {
  const fromEl = document.getElementById('fFrom');
  const toEl   = document.getElementById('fTo');
  if (dir === 'out') {
    // Outbound: From = any airport, To = Orlando area
    fromEl.setAttribute('list', 'airportList');
    fromEl.placeholder = 'Search airport or IATA code…';
    toEl.setAttribute('list', 'orlandoList');
    toEl.placeholder = 'Select Orlando airport…';
    toEl.readOnly = false;
    if (clearFields) { fromEl.value = ''; toEl.value = ''; }
  } else {
    // Return: From = Orlando area, To = any airport
    fromEl.setAttribute('list', 'orlandoList');
    fromEl.placeholder = 'Select Orlando airport…';
    toEl.setAttribute('list', 'airportList');
    toEl.placeholder = 'Search airport or IATA code…';
    toEl.readOnly = false;
    if (clearFields) { fromEl.value = ''; toEl.value = ''; }
  }
}

// ── Add flight ───────────────────────────────────────────────────────────────
async function addFlight() {
  const f = {
    dir: document.getElementById('fDir').value,
    num: document.getElementById('fNum').value.toUpperCase(),
    from: extractIATA(document.getElementById('fFrom').value),
    to: extractIATA(document.getElementById('fTo').value),
    dep: document.getElementById('fDep').value,
    arr: document.getElementById('fArr').value,
    airline: document.getElementById('fAir').value
  };
  if (!f.from || !f.dep) { toast('From airport and departure are required'); return; }

  const id = await saveEvent('flight', f, f.dep.split('T')[0], f.dep.split('T')[1]?.slice(0, 5));
  if (!id) return;

  f.id = id;
  S.flights.push(f);
  renderFlights();
  toast('Flight added ✦');
  ['fNum', 'fDep', 'fArr', 'fAir'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fDir').value = 'out';
  onDirChange('out', true);
  updateStats();
}

async function delFlight(id) {
  await deleteEvent(id);
  S.flights = S.flights.filter(x => x.id !== id);
  renderFlights(); updateStats();
}

// ── Add park ─────────────────────────────────────────────────────────────────
async function addPark() {
  const name = document.getElementById('pName').value;
  const date = document.getElementById('pDate').value;
  const time = document.getElementById('pTime').value;
  if (!name || !date) { toast('Select a park and date'); return; }

  const id = await saveEvent('park', { name, time }, date, time, S.parks.length);
  if (!id) return;

  S.parks.push({ id, name, date, time });
  S.parks.sort((a, b) => a.date.localeCompare(b.date));
  renderParks();
  toast('Park day added ✦');
  document.getElementById('pName').value = '';
  document.getElementById('pDate').value = '';
  updateStats();
}

async function delPark(id) {
  await deleteEvent(id);
  S.parks = S.parks.filter(x => x.id !== id);
  renderParks(); updateStats();
}

// ── Add dining ───────────────────────────────────────────────────────────────
async function addDining() {
  const r = {
    name: document.getElementById('dName').value,
    loc: document.getElementById('dLoc').value,
    date: document.getElementById('dDate').value,
    time: document.getElementById('dTime').value,
    size: document.getElementById('dSize').value,
    conf: document.getElementById('dConf').value
  };
  if (!r.name || !r.date || !r.time) { toast('Name, date and time required'); return; }

  const id = await saveEvent('dining', r, r.date, r.time);
  if (!id) return;

  r.id = id;
  S.dining.push(r);
  S.dining.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  renderDining();
  toast('Reservation added ✦');
  ['dName', 'dLoc', 'dDate', 'dTime', 'dSize', 'dConf'].forEach(id => document.getElementById(id).value = '');
  updateStats();
}

async function delDining(id) {
  await deleteEvent(id);
  S.dining = S.dining.filter(x => x.id !== id);
  renderDining(); updateStats();
}

// ── Add activity ─────────────────────────────────────────────────────────────
async function addActivity() {
  const a = {
    name: document.getElementById('aName').value,
    type: document.getElementById('aType').value,
    date: document.getElementById('aDate').value,
    time: document.getElementById('aTime').value,
    notes: document.getElementById('aNotes').value
  };
  if (!a.name || !a.date) { toast('Name and date required'); return; }

  const id = await saveEvent('activity', a, a.date, a.time);
  if (!id) return;

  a.id = id;
  S.activities.push(a);
  S.activities.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  renderActivities();
  toast('Activity added ✦');
  ['aName', 'aDate', 'aTime', 'aNotes'].forEach(id => document.getElementById(id).value = '');
  updateStats();
}

async function delActivity(id) {
  await deleteEvent(id);
  S.activities = S.activities.filter(x => x.id !== id);
  renderActivities(); updateStats();
}

// ── Clear all data ────────────────────────────────────────────────────────────
async function clearAll() {
  if (!confirm('Clear all trip data? This cannot be undone.')) return;
  await sb.from('events').delete().eq('trip_id', S.tripId);
  await sb.from('trips').update({ start_date: null, end_date: null }).eq('id', S.tripId);
  S.flights = []; S.parks = []; S.dining = []; S.activities = [];
  S.tripStart = ''; S.tripEnd = '';
  document.getElementById('tStart').value = '';
  document.getElementById('tEnd').value = '';
  renderAll(); toast('All data cleared');
}

// ── Drag and drop (parks) ────────────────────────────────────────────────────
function ds(e, i) { dragSrc = i; e.currentTarget.classList.add('dragging'); }
function dov(e) { e.preventDefault(); e.currentTarget.classList.add('dov'); }
function dl(e) { e.currentTarget.classList.remove('dov'); }
async function dp(e, i) {
  e.preventDefault(); e.currentTarget.classList.remove('dov');
  if (dragSrc === null || dragSrc === i) return;
  const p = [...S.parks]; const [m] = p.splice(dragSrc, 1); p.splice(i, 0, m);
  S.parks = p; dragSrc = null;
  renderParks();
  await updateParkOrder(); // persist new order to Supabase
}

// ── Navigation ───────────────────────────────────────────────────────────────
function nav(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sideitem').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById('sec-' + id); if (sec) sec.classList.add('active');
  document.querySelectorAll('.sideitem').forEach(s => {
    const t = s.textContent.toLowerCase().trim();
    if ((id === 'dashboard' && t.startsWith('dashboard')) || (id === 'flights' && t.startsWith('flights')) || (id === 'parks' && t.startsWith('theme')) || (id === 'dining' && t.startsWith('dining')) || (id === 'activities' && t.startsWith('activities')) || (id === 'timeline' && t.startsWith('timeline')) || (id === 'conflicts' && t.startsWith('conflicts')) || (id === 'share' && t.startsWith('share')) || (id === 'settings' && t.startsWith('settings')))
      s.classList.add('active');
  });
  if (id === 'timeline') renderTimeline();
  if (id === 'share') renderShare();
  if (id === 'conflicts') renderConflictsFull();
}

// ── Countdown ────────────────────────────────────────────────────────────────
function startCd() { updateCd(); setInterval(updateCd, 60000); }

function updateCd() {
  if (!S.tripStart) return;
  const now = new Date(), trip = new Date(S.tripStart + 'T00:00:00'), diff = trip - now;
  if (diff <= 0) {
    document.getElementById('cdD').textContent = '✦';
    document.getElementById('cdH').textContent = '0';
    document.getElementById('cdM').textContent = '0';
    document.getElementById('cdInfo').textContent = "You're there!";
    return;
  }
  document.getElementById('cdD').textContent = Math.floor(diff / 864e5);
  document.getElementById('cdH').textContent = Math.floor((diff % 864e5) / 36e5);
  document.getElementById('cdM').textContent = Math.floor((diff % 36e5) / 6e4);
  document.getElementById('cdTrip').textContent = 'Orlando trip';
  document.getElementById('cdInfo').textContent = 'Departing ' + fmtL(S.tripStart);
}

function updateDash() {
  if (S.tripStart && S.tripEnd) document.getElementById('dashDates').textContent = fmtL(S.tripStart) + ' → ' + fmtL(S.tripEnd);
}

// ── Render functions (unchanged from original) ────────────────────────────────
function renderFlights() {
  const el = document.getElementById('flightsList');
  if (!S.flights.length) { el.innerHTML = ''; return; }
  el.innerHTML = S.flights.map(f => `
    <div class="card">
      <div class="card-hd">
        <div class="card-title">${f.dir === 'out' ? 'Outbound' : 'Return'} flight${f.airline ? ' · ' + f.airline : ''}</div>
        <button class="del-btn" onclick="delFlight('${f.id}')">✕</button>
      </div>
      <div class="flight-route">
        <div>
          <div class="r-ap">${f.from || '—'}</div>
          <div class="r-time">${f.dep ? fmtDT(f.dep) : '—'}</div>
        </div>
        <div class="r-mid">
          <span class="r-arrow">→</span>
          <div class="r-fn">${f.num}</div>
        </div>
        <div style="text-align:right">
          <div class="r-ap" style="color:var(--green)">${f.to || '—'}</div>
          <div class="r-time">${f.arr ? fmtDT(f.arr) : '—'}</div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderParks() {
  const el = document.getElementById('parksList');
  if (!S.parks.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">⊛</div><p>No parks added yet</p></div>'; return; }

  // Group parks by date
  const byDate = {};
  S.parks.forEach((p, i) => {
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push({ ...p, idx: i });
  });

  let dayNum = 0;
  el.innerHTML = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).map(([date, parks]) => {
    dayNum++;
    if (parks.length === 1) {
      const p = parks[0];
      return `
        <div class="item" draggable="true" ondragstart="ds(event,${p.idx})" ondragover="dov(event)" ondrop="dp(event,${p.idx})" ondragleave="dl(event)">
          <span class="drag-h">⠿</span>
          <div class="item-icon ico-green">🎢</div>
          <div class="item-body">
            <div class="item-name">${p.name}</div>
            <div class="item-meta">${fmtL(p.date)}${p.time ? ' · from ' + p.time : ''}</div>
          </div>
          <span class="badge b-green">Day ${dayNum}</span>
          <button class="del-btn" onclick="delPark('${p.id}')">✕</button>
        </div>`;
    } else {
      // Park split — same day, multiple parks
      const sorted = [...parks].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
      const parkRows = sorted.map(p => `
          <div class="split-row">
            <div class="item-icon ico-green" style="width:28px;height:28px;font-size:13px;border-radius:7px;flex-shrink:0">🎢</div>
            <div class="item-body">
              <div class="item-name">${p.name}</div>
              ${p.time ? `<div class="item-meta">from ${p.time}</div>` : ''}
            </div>
            <button class="del-btn" onclick="delPark('${p.id}')">✕</button>
          </div>`).join('<div class="split-divider">→</div>');
      return `
        <div class="item item-split" draggable="true" ondragstart="ds(event,${parks[0].idx})" ondragover="dov(event)" ondrop="dp(event,${parks[0].idx})" ondragleave="dl(event)">
          <span class="drag-h">⠿</span>
          <div class="split-body">
            <div class="split-header">
              <span class="split-date">${fmtL(date)}</span>
              <span class="badge b-amber">Park split · Day ${dayNum}</span>
            </div>
            <div class="split-parks">${parkRows}</div>
          </div>
        </div>`;
    }
  }).join('');
}

function renderDining() {
  const el = document.getElementById('diningList');
  if (!S.dining.length) { el.innerHTML = ''; return; }
  el.innerHTML = S.dining.map(d => `
    <div class="item">
      <div class="item-icon ico-amber">🍽</div>
      <div class="item-body">
        <div class="item-name">${d.name}</div>
        <div class="item-meta">${fmtL(d.date)} at ${d.time}${d.loc ? ' · ' + d.loc : ''}${d.size ? ' · party of ' + d.size : ''}${d.conf ? '<br><span style="color:var(--green);font-size:0.72rem">✓ ' + d.conf + '</span>' : ''}</div>
      </div>
      <button class="del-btn" onclick="delDining('${d.id}')">✕</button>
    </div>
  `).join('');
}

function renderActivities() {
  const el = document.getElementById('activitiesList');
  if (!S.activities.length) { el.innerHTML = ''; return; }
  el.innerHTML = S.activities.map(a => `
    <div class="item">
      <div class="item-icon ico-purple">${aIcons[a.type] || '📌'}</div>
      <div class="item-body">
        <div class="item-name">${a.name}</div>
        <div class="item-meta">${fmtL(a.date)}${a.time ? ' at ' + a.time : ''}${a.notes ? '<br><em style="color:var(--text3)">' + a.notes + '</em>' : ''}</div>
      </div>
      <button class="del-btn" onclick="delActivity('${a.id}')">✕</button>
    </div>
  `).join('');
}

function renderTimeline() {
  const el = document.getElementById('timelineContent');
  const evs = [];
  S.flights.forEach(f => {
    if (f.dep) evs.push({ date: f.dep.split('T')[0], time: f.dep.split('T')[1]?.slice(0, 5) || '', type: 'flight', label: '✈ ' + f.from + ' → ' + f.to + (f.num ? ' (' + f.num + ')' : '') });
    if (f.arr) evs.push({ date: f.arr.split('T')[0], time: f.arr.split('T')[1]?.slice(0, 5) || '', type: 'flight', label: '✈ Lands ' + f.to });
  });
  S.parks.forEach(p => evs.push({ date: p.date, time: p.time || '09:00', type: 'park', label: '🎢 ' + p.name }));
  S.dining.forEach(d => evs.push({ date: d.date, time: d.time, type: 'dining', label: '🍽 ' + d.name }));
  S.activities.forEach(a => evs.push({ date: a.date, time: a.time || '', type: 'activity', label: (aIcons[a.type] || '📌') + ' ' + a.name }));
  if (!evs.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">✦</div><p>Add events to see your timeline</p></div>'; return; }
  evs.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const days = {}; evs.forEach(e => { if (!days[e.date]) days[e.date] = []; days[e.date].push(e); });
  let html = '', dn = 1;
  Object.keys(days).sort().forEach(date => {
    html += `<div class="tl-day"><div class="tl-dhead"><span class="day-chip">Day ${dn++}</span><span class="day-label">${fmtL(date)}</span></div><div class="tl-evs">${days[date].map(e => `<div class="tl-ev ${e.type}">${e.time ? `<div class="tl-time">${e.time}</div>` : ''}<div class="tl-name">${e.label}</div></div>`).join('')}</div></div>`;
  });
  el.innerHTML = html;
}

function detectConflicts() {
  const cs = [];
  if (S.tripStart && S.tripEnd) {
    S.parks.forEach(p => { if (p.date < S.tripStart || p.date > S.tripEnd) cs.push({ sev: 'error', title: 'Park outside trip dates', detail: p.name + ' on ' + fmtL(p.date) + ' falls outside your trip' }); });
    S.dining.forEach(d => { if (d.date < S.tripStart || d.date > S.tripEnd) cs.push({ sev: 'error', title: 'Dining outside trip dates', detail: d.name + ' on ' + fmtL(d.date) + ' falls outside your trip' }); });
  }
  const pd = {}; S.parks.forEach(p => { if (!pd[p.date]) pd[p.date] = []; pd[p.date].push(p.name); });
  for (let i = 0; i < S.dining.length; i++) for (let j = i + 1; j < S.dining.length; j++) {
    if (S.dining[i].date === S.dining[j].date && Math.abs(t2m(S.dining[i].time) - t2m(S.dining[j].time)) < 60)
      cs.push({ sev: 'error', title: 'Dining overlap', detail: S.dining[i].name + ' (' + S.dining[i].time + ') and ' + S.dining[j].name + ' (' + S.dining[j].time + ') on ' + fmtL(S.dining[i].date) + ' are less than 1 hr apart' });
  }
  S.flights.forEach(f => {
    if (!f.arr) return;
    const ad = f.arr.split('T')[0], at = t2m(f.arr.split('T')[1]?.slice(0, 5) || '00:00');
    [...S.dining, ...S.activities].forEach(x => { if (x.date === ad && x.time && t2m(x.time) - at < 120 && t2m(x.time) > at) cs.push({ sev: 'warning', title: 'Tight arrival window', detail: x.name + ' at ' + x.time + ' is within 2 hrs of your flight landing' }); });
  });
  return cs;
}

function updateConflicts() {
  const cs = detectConflicts();
  const b = document.getElementById('confBadge');
  b.style.display = cs.length ? 'inline' : 'none'; b.textContent = cs.length;
  const stC = document.getElementById('stC'); if (stC) stC.textContent = cs.length;
}

function renderConflictsFull() {
  const cs = detectConflicts();
  const el = document.getElementById('conflictsList');
  if (!cs.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">✦</div><p>No conflicts — your plan looks great!</p></div>'; return; }
  el.innerHTML = cs.map(c => `<div class="conf-it ${c.sev === 'error' ? 'conf-error' : 'conf-warn'}"><div class="conf-ico">${c.sev === 'error' ? '●' : '◐'}</div><div class="conf-body"><div class="conf-ttl">${c.title}</div><div class="conf-det">${c.detail}</div></div></div>`).join('');
}

function updateStats() {
  document.getElementById('stF').textContent = S.flights.length;
  document.getElementById('stP').textContent = S.parks.length;
  document.getElementById('stD').textContent = S.dining.length;
  document.getElementById('stA').textContent = S.activities.length;
  updateDash(); renderDashUpcoming(); updateConflicts();
}

function renderDashUpcoming() {
  const el = document.getElementById('dashUpcoming');
  const all = [];
  S.parks.forEach(p => all.push({ date: p.date, time: p.time || '09:00', label: '🎢 ' + p.name }));
  S.dining.forEach(d => all.push({ date: d.date, time: d.time, label: '🍽 ' + d.name }));
  S.activities.forEach(a => all.push({ date: a.date, time: a.time || '', label: (aIcons[a.type] || '📌') + ' ' + a.name }));
  all.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-ico">◈</div><p>Add events to see your upcoming plans here</p></div>'; return; }
  el.innerHTML = all.slice(0, 6).map(e => `<div style="display:flex;align-items:center;gap:12px;padding:0.6rem 0;border-bottom:1px solid var(--border)"><span style="font-size:0.72rem;color:var(--text3);min-width:86px">${fmtS(e.date)}${e.time ? ' ' + e.time : ''}</span><span style="font-size:0.85rem;color:var(--text)">${e.label}</span></div>`).join('');
}

function renderShare() {
  document.getElementById('shareSummary').innerHTML = `<p style="font-size:0.85rem;margin-bottom:0.75rem;color:var(--text2)"><strong style="color:var(--text)">Trip:</strong> ${S.tripStart ? fmtL(S.tripStart) + ' → ' + fmtL(S.tripEnd) : 'Not set'}</p><p style="font-size:0.85rem;color:var(--text2)"><strong style="color:var(--text)">${S.flights.length}</strong> flight(s) · <strong style="color:var(--text)">${S.parks.length}</strong> park day(s) · <strong style="color:var(--text)">${S.dining.length}</strong> dining · <strong style="color:var(--text)">${S.activities.length}</strong> activit${S.activities.length === 1 ? 'y' : 'ies'}</p>`;
}

function copyLink() { navigator.clipboard.writeText(location.href).then(() => toast('Link copied!')).catch(() => toast('Try JSON export instead')); }
function exportJSON() { const b = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'orlando-magic-planner.json'; a.click(); toast('Trip exported!'); }
function dlPDF() { toast('PDF export coming soon'); }
function emailIt() { toast('Email sharing coming soon'); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function t2m(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }
function fmtL(d) { if (!d) return '—'; return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtS(d) { if (!d) return '—'; return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
function fmtDT(dt) { if (!dt) return '—'; return new Date(dt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }

function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }

function renderAll() { renderFlights(); renderParks(); renderDining(); renderActivities(); updateStats(); updateDash(); }

// ── Boot ──────────────────────────────────────────────────────────────────────
// Check if user is already logged in (persisted Supabase session)
async function init() {
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    S.user = {
      name: session.user.user_metadata?.name || session.user.email.split('@')[0],
      email: session.user.email
    };
    await loadFromDB();
    showApp();
  } else {
    document.getElementById('authWrap').style.display = 'grid';
  }

  // Session state is handled by page redirect on logout
}

init();

// Expose functions to global scope so HTML onclick attributes work with type="module"
Object.assign(window, {
  switchTab, doLogin, doSignup, logout, nav,
  saveDates, saveSettings, clearAll,
  lookupFlight, addFlight, delFlight,
  addPark, delPark, ds, dov, dl, dp,
  addDining, delDining,
  addActivity, delActivity,
  copyLink, exportJSON, dlPDF, emailIt,
  onDirChange,
  confirmDeleteAccount, closeDeleteModal, doDeleteAccount
});
