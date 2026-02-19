/* ════════════════════════════════════════
   CHARCUTERIE GOEMAERE — admin.js
   Firebase Auth + Firestore temps réel
════════════════════════════════════════ */
'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore, collection, query, orderBy,
  onSnapshot, doc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

// ── Config ──────────────────────────────────────────────────────
const FB = {
  apiKey           : 'AIzaSyDi953QvlkKi1_-zOvE3aS_qgrjos-sU3M',
  authDomain       : 'charcutriegoemaere.firebaseapp.com',
  projectId        : 'charcutriegoemaere',
  storageBucket    : 'charcutriegoemaere.firebasestorage.app',
  messagingSenderId: '124342609548',
  appId            : '1:124342609548:web:e7936e4e9f7ec123513da9',
  measurementId    : 'G-VYY9XX1MRH',
};
const app  = initializeApp(FB);
const auth = getAuth(app);
const db   = getFirestore(app);

// UID admin — à renseigner depuis Firebase Console → Authentication → Users
const ADMIN_UID = 'EiifSyyqmaUpmcFJUmSxgO6ixWy1';

// ── Constantes ──────────────────────────────────────────────────
const STATUTS = {
  nouvelle       : { label: 'Nouvelle',       emoji: '🔴', css: 'statut-nouvelle' },
  en_preparation : { label: 'En préparation', emoji: '🟠', css: 'statut-en_preparation' },
  prete          : { label: 'Prête',           emoji: '🟢', css: 'statut-prete' },
  annulee        : { label: 'Annulée',         emoji: '⚫', css: 'statut-annulee' },
};

let _commandes   = [];
let _unsubscribe = null;
let _adminUser   = null;

// ════════════════════════════════════════
//  AUTH OBSERVER — source unique de vérité
// ════════════════════════════════════════
onAuthStateChanged(auth, user => {
  if (user && user.uid === ADMIN_UID) {
    // ✅ Admin connecté
    _adminUser = user;
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminApp').style.display   = 'grid';
    initApp();
  } else if (user) {
    // Utilisateur connecté mais pas admin
    signOut(auth);
    showLoginError('❌ Ce compte n\'a pas les droits administrateur.');
  } else {
    // Non connecté
    _adminUser = null;
    document.getElementById('adminLogin').style.display = 'flex';
    document.getElementById('adminApp').style.display   = 'none';
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }
});

// ── Formulaire de connexion admin ────────────────────────────────
document.getElementById('loginAdminForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('aLogin').value.trim();
  const mdp   = document.getElementById('aMdp').value;
  const btn   = document.getElementById('btnAdminLogin');
  btn.disabled = true; btn.textContent = 'Connexion…';
  showLoginError('');
  try {
    await signInWithEmailAndPassword(auth, email, mdp);
    // onAuthStateChanged gère la suite
  } catch (err) {
    showLoginError(firebaseErrMsg(err));
    btn.disabled = false; btn.textContent = 'Accéder au panneau →';
  }
});

function showLoginError(msg) {
  const el = document.getElementById('loginErr');
  if (el) el.textContent = msg;
}

function adminLogout() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  signOut(auth);
}

// ════════════════════════════════════════
//  INIT APP
// ════════════════════════════════════════
function initApp() {
  document.getElementById('mainDate').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });
  abonnerCommandes();
  showPanel('dashboard');
}

// ════════════════════════════════════════
//  FIRESTORE — LISTENER TEMPS RÉEL
// ════════════════════════════════════════
function abonnerCommandes() {
  if (_unsubscribe) _unsubscribe();
  setLoadingState(true);

  const q = query(collection(db, 'commandes'), orderBy('createdAt', 'desc'));
  _unsubscribe = onSnapshot(q, snap => {
    _commandes = snap.docs.map(d => ({
      _id      : d.id,
      ref      : 'CMD-' + d.id.slice(0, 8).toUpperCase(),
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    }));
    setLoadingState(false);
    updateBadge();
    refreshCurrentPanel();
  }, err => {
    console.error('[Firestore] onSnapshot:', err);
    setLoadingState(false);
    adminToast('❌ Erreur Firestore : ' + err.message);
  });
}

function setLoadingState(on) {
  document.querySelectorAll('.panel.active').forEach(p => {
    if (on) p.innerHTML = '<div class="fs-loading"><span class="fs-spinner"></span>Chargement…</div>';
  });
}
function updateBadge() {
  const n = _commandes.filter(c => c.statut === 'nouvelle').length;
  const b = document.getElementById('badgeNouvelles');
  if (b) { b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none'; }
}

// ════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════
const PANEL_TITLES = {
  dashboard: 'Tableau de bord',
  commandes: 'Gestion des commandes',
  clients  : 'Clients inscrits',
};
function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.snav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + id)?.classList.add('active');
  document.querySelector(`[data-panel="${id}"]`)?.classList.add('active');
  document.getElementById('mainTitle').textContent = PANEL_TITLES[id] || '';
  if (id === 'dashboard') renderDashboard();
  if (id === 'commandes') renderCommandes();
  if (id === 'clients')   renderClients();
}
function refreshAll() { refreshCurrentPanel(); adminToast('✓ Actualisé'); }
function refreshCurrentPanel() {
  const id = document.querySelector('.snav-item.active')?.dataset.panel || 'dashboard';
  if (id === 'dashboard') renderDashboard();
  if (id === 'commandes') renderCommandes();
  if (id === 'clients')   renderClients();
}

// ════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════
function renderDashboard() {
  const cmds  = _commandes;
  const today = new Date().toISOString().split('T')[0];
  const cnt   = { nouvelle:0, en_preparation:0, prete:0, annulee:0 };
  cmds.forEach(c => { if (cnt[c.statut]!==undefined) cnt[c.statut]++; });

  setText('kpiTotal',     cmds.length);
  setText('kpiNouvelles', cnt.nouvelle);
  setText('kpiPrep',      cnt.en_preparation);
  setText('kpiDone',      cnt.prete + cnt.annulee);
  // Nb clients = emails uniques dans les commandes
  const emails = new Set(cmds.map(c => c.email).filter(Boolean));
  setText('kpiClients', emails.size);
  updateBadge();

  document.getElementById('dashRecentes').innerHTML  = cmds.length
    ? tableHtml(cmds.slice(0,5), true) : emptyState('Aucune commande');
  const jour = cmds.filter(c => c.dateRetrait===today && c.statut!=='annulee');
  document.getElementById('dashAujourdhui').innerHTML = jour.length
    ? tableHtml(jour, true) : emptyState('Aucun retrait prévu aujourd\'hui');
}

// ════════════════════════════════════════
//  COMMANDES
// ════════════════════════════════════════
function renderCommandes() {
  let cmds = [..._commandes];
  const q  = (document.getElementById('searchCommandes')?.value||'').toLowerCase();
  const st = document.getElementById('filtreStatut')?.value||'';
  const dt = document.getElementById('filtreDate')?.value||'';
  const now = new Date(); now.setHours(0,0,0,0);

  if (q)  cmds = cmds.filter(c => (c.client+c.ref+(c.telephone||'')+c.email).toLowerCase().includes(q));
  if (st) cmds = cmds.filter(c => c.statut===st);
  if (dt==='today')  { const t=now.toISOString().split('T')[0]; cmds=cmds.filter(c=>c.dateRetrait===t||c.createdAt.startsWith(t)); }
  if (dt==='week')   { const w=new Date(now); w.setDate(w.getDate()-7);  cmds=cmds.filter(c=>new Date(c.createdAt)>=w); }
  if (dt==='month')  { const m=new Date(now); m.setDate(m.getDate()-30); cmds=cmds.filter(c=>new Date(c.createdAt)>=m); }

  document.getElementById('listeCommandes').innerHTML = cmds.length
    ? '<div class="table-wrap">'+tableHtml(cmds,false)+'</div>'
    : emptyState('Aucune commande ne correspond aux filtres');
}

// ════════════════════════════════════════
//  TABLE HTML
// ════════════════════════════════════════
function tableHtml(cmds, compact) {
  const rows = cmds.map(c => {
    const s = STATUTS[c.statut] || STATUTS.nouvelle;
    const prod = c.panier?.map(p=>`${p.nom}${p.qte>1?` ×${p.qte}`:''}`).join(', ')||c.produit||'—';
    return `<tr>
      <td class="id-cell">${esc(c.ref)}</td>
      <td><strong>${esc(c.client)}</strong>${!compact?`<br><span class="client-email">${esc(c.email||'')}</span>`:''}</td>
      <td>${esc(prod)}</td>
      ${!compact?`<td><strong>${formatDate(c.dateRetrait)}</strong>${c.heureRetrait?' à '+c.heureRetrait:''}</td>`:''}
      <td><span class="statut-badge ${s.css}"><span class="statut-dot"></span>${s.label}</span></td>
      <td><div class="action-btns">
        <button class="action-btn action-btn-detail" onclick="ouvrirCommande('${c._id}')">Détail</button>
        ${c.statut==='nouvelle'       ?`<button class="action-btn action-btn-prep"    onclick="setStatut('${c._id}','en_preparation')">Préparer</button>`:''}
        ${c.statut==='en_preparation' ?`<button class="action-btn action-btn-prete"   onclick="setStatut('${c._id}','prete')">Prête</button>`:''}
        ${['nouvelle','en_preparation'].includes(c.statut)?`<button class="action-btn action-btn-annuler" onclick="setStatut('${c._id}','annulee')">Annuler</button>`:''}
      </div></td>
    </tr>`;
  }).join('');
  return `<table class="admin-table"><thead><tr>
    <th>Référence</th><th>Client</th><th>Produits</th>
    ${!compact?'<th>Retrait</th>':''}
    <th>Statut</th><th>Actions</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

// ════════════════════════════════════════
//  MODAL DÉTAIL
// ════════════════════════════════════════
function ouvrirCommande(firestoreId) {
  const c = _commandes.find(x => x._id===firestoreId); if (!c) return;
  const s = STATUTS[c.statut] || STATUTS.nouvelle;
  const panierHtml = c.panier?.length
    ? c.panier.map(p=>`<div class="cmd-panier-item"><span>${p.emoji||'📦'} ${esc(p.nom)}</span><strong>×${p.qte}</strong></div>`).join('')
    : `<div class="cmd-panier-item"><span>📦 ${esc(c.produit||'—')}</span></div>`;

  document.getElementById('cmdModalContent').innerHTML = `
    <div class="cmd-modal-header">
      <div class="cmd-modal-ref">${esc(c.ref)} · Reçue le ${formatDateHeure(c.createdAt)}</div>
      <div class="cmd-modal-titre">${esc(c.client)}</div>
      <span class="statut-badge ${s.css}"><span class="statut-dot"></span>${s.label}</span>
    </div>
    <div class="cmd-modal-body">
      <div class="cmd-detail-grid">
        <div class="cmd-detail-item"><div class="cmd-detail-label">📞 Téléphone</div><div class="cmd-detail-value">${esc(c.telephone||'—')}</div></div>
        <div class="cmd-detail-item"><div class="cmd-detail-label">📧 Email</div><div class="cmd-detail-value">${esc(c.email||'—')}</div></div>
        <div class="cmd-detail-item"><div class="cmd-detail-label">📅 Retrait</div><div class="cmd-detail-value">${formatDate(c.dateRetrait)}${c.heureRetrait?' à '+c.heureRetrait:''}</div></div>
        <div class="cmd-detail-item"><div class="cmd-detail-label">🏷 Produit</div><div class="cmd-detail-value">${esc(c.produit||'—')}</div></div>
        <div class="cmd-detail-item cmd-detail-full"><div class="cmd-detail-label">💬 Message</div><div class="cmd-detail-value" style="font-weight:400;font-size:.88rem;line-height:1.6">${esc(c.message||'—')}</div></div>
      </div>
      <div class="cmd-panier-titre">🛒 Panier</div>${panierHtml}
    </div>
    <div class="cmd-modal-footer">
      <div style="font-size:.7rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);align-self:center">Changer statut :</div>
      <select class="statut-select" onchange="setStatutEtReload('${firestoreId}',this.value)">
        ${Object.entries(STATUTS).map(([k,v])=>`<option value="${k}" ${c.statut===k?'selected':''}>${v.emoji} ${v.label}</option>`).join('')}
      </select>
      <button class="action-btn action-btn-annuler" style="margin-left:auto" onclick="fermerCmdModal()">Fermer</button>
    </div>`;
  document.getElementById('cmdModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function fermerCmdModal() { document.getElementById('cmdModal').classList.remove('open'); document.body.style.overflow=''; }

// ════════════════════════════════════════
//  STATUTS → FIRESTORE
// ════════════════════════════════════════
async function setStatut(id, newStatut) {
  try {
    await updateDoc(doc(db,'commandes',id), { statut:newStatut, updatedAt:serverTimestamp() });
    const l = {en_preparation:'En préparation',prete:'Prête',annulee:'Annulée',nouvelle:'Nouvelle'};
    adminToast(`✓ Statut → ${l[newStatut]}`);
  } catch(err) { adminToast('❌ Erreur : '+err.message); }
}
async function setStatutEtReload(id, newStatut) {
  await setStatut(id, newStatut);
  setTimeout(() => ouvrirCommande(id), 300);
}

// ════════════════════════════════════════
//  CLIENTS (déduits des commandes Firestore)
// ════════════════════════════════════════
function renderClients() {
  const q = (document.getElementById('searchClients')?.value||'').toLowerCase();
  // Regrouper par email
  const map = {};
  _commandes.forEach(c => {
    if (!c.email) return;
    if (!map[c.email]) map[c.email] = { nom: c.client, email: c.email, cmds: 0 };
    map[c.email].cmds++;
  });
  let entries = Object.values(map);
  if (q) entries = entries.filter(c => (c.nom+c.email).toLowerCase().includes(q));
  document.getElementById('clientsCount').textContent = `${entries.length} client${entries.length>1?'s':''}`;

  if (!entries.length) { document.getElementById('listeClients').innerHTML = emptyState('Aucun client'); return; }

  const rows = entries.map(c => `<tr>
    <td><strong>${esc(c.nom)}</strong><br><span class="client-email">${esc(c.email)}</span></td>
    <td><span class="client-cmds-count">${c.cmds}</span></td>
  </tr>`).join('');

  document.getElementById('listeClients').innerHTML = `
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Client</th><th>Commandes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

// ════════════════════════════════════════
//  EXPORT CSV
// ════════════════════════════════════════
function exportCSV() {
  if (!_commandes.length) { adminToast('⚠ Aucune commande'); return; }
  const headers = ['Référence','Date','Client','Email','Téléphone','Produit','Date retrait','Heure','Statut','Message'];
  const rows = _commandes.map(c => [
    c.ref, formatDateHeure(c.createdAt), c.client, c.email||'', c.telephone||'',
    c.produit||'', c.dateRetrait||'', c.heureRetrait||'',
    STATUTS[c.statut]?.label||c.statut, (c.message||'').replace(/\n/g,' '),
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';'));
  const blob = new Blob(['\ufeff'+[headers.join(';'),...rows].join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`commandes-${new Date().toISOString().split('T')[0]}.csv`});
  a.click(); adminToast('✓ Export CSV');
}

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function firebaseErrMsg(err) {
  const map = {
    'auth/invalid-credential'  : '❌ Email ou mot de passe incorrect.',
    'auth/user-not-found'      : '❌ Aucun compte trouvé.',
    'auth/wrong-password'      : '❌ Mot de passe incorrect.',
    'auth/too-many-requests'   : '❌ Trop de tentatives. Réessayez plus tard.',
    'auth/network-request-failed':'❌ Erreur réseau.',
    'auth/user-disabled'       : '❌ Ce compte est désactivé.',
  };
  return map[err?.code] || `❌ ${err?.message||'Erreur inconnue'}`;
}
function formatDate(iso) { if(!iso) return '—'; const[y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function formatDateHeure(iso) {
  if(!iso) return '—';
  const dt=new Date(iso);
  return dt.toLocaleDateString('fr-FR')+' '+dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function setText(id,v) { const el=document.getElementById(id); if(el) el.textContent=v; }
function emptyState(msg) { return `<div class="empty-state"><div class="empty-state-icon">📭</div><p>${msg}</p></div>`; }
let _tt;
function adminToast(msg) {
  const t=document.getElementById('adminToast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(_tt); _tt=setTimeout(()=>t.classList.remove('show'),3000);
}

// ════════════════════════════════════════
//  GLOBALS
// ════════════════════════════════════════
window.showPanel        = showPanel;
window.refreshAll       = refreshAll;
window.ouvrirCommande   = ouvrirCommande;
window.fermerCmdModal   = fermerCmdModal;
window.setStatut        = setStatut;
window.setStatutEtReload= setStatutEtReload;
window.exportCSV        = exportCSV;
window.adminLogout      = adminLogout;
window.renderCommandes  = renderCommandes;
window.renderClients    = renderClients;

document.addEventListener('keydown', e => { if(e.key==='Escape') fermerCmdModal(); });
