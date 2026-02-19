/* ════════════════════════════════════════
   CHARCUTERIE GOEMAERE — admin.js
   Panneau admin · Commandes lues en temps réel depuis Firestore
════════════════════════════════════════ */
'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
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
const app = initializeApp(FB);
const db  = getFirestore(app);

// ── Constantes ──────────────────────────────────────────────────
const ADMIN_CREDS = { login: 'admin', mdp: 'admin2024' };
const LS_SESSION  = 'goemaere_session';
const LS_CLIENTS  = 'goemaere_clients';

const STATUTS = {
  nouvelle       : { label: 'Nouvelle',        emoji: '🔴', css: 'statut-nouvelle' },
  en_preparation : { label: 'En préparation',  emoji: '🟠', css: 'statut-en_preparation' },
  prete          : { label: 'Prête',            emoji: '🟢', css: 'statut-prete' },
  annulee        : { label: 'Annulée',          emoji: '⚫', css: 'statut-annulee' },
};

// ── État global ─────────────────────────────────────────────────
let _commandes      = [];   // cache local mis à jour par onSnapshot
let _unsubscribe    = null; // pour détacher le listener

// ════════════════════════════════════════  AUTH
function getSession() { try { return JSON.parse(localStorage.getItem(LS_SESSION)); } catch { return null; } }
function getClients() { try { return JSON.parse(localStorage.getItem(LS_CLIENTS)) || {}; } catch { return {}; } }
function saveClients(c) { localStorage.setItem(LS_CLIENTS, JSON.stringify(c)); }

function checkAdminAuth() {
  const s = getSession();
  if (s?.role === 'admin') {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminApp').style.display   = 'grid';
    initApp();
  }
}

document.getElementById('loginAdminForm').addEventListener('submit', e => {
  e.preventDefault();
  const login = document.getElementById('aLogin').value.trim();
  const mdp   = document.getElementById('aMdp').value;
  const err   = document.getElementById('loginErr');
  if (login === ADMIN_CREDS.login && mdp === ADMIN_CREDS.mdp) {
    localStorage.setItem(LS_SESSION, JSON.stringify({ email: 'admin', role: 'admin', nom: 'Administrateur' }));
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminApp').style.display   = 'grid';
    initApp();
  } else {
    err.textContent = '❌ Identifiant ou mot de passe incorrect.';
    document.getElementById('aMdp').value = '';
  }
});

function adminLogout() {
  if (_unsubscribe) _unsubscribe();
  localStorage.removeItem(LS_SESSION);
  window.location.href = 'index.html';
}

// ════════════════════════════════════════  INIT
function initApp() {
  document.getElementById('mainDate').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  abonnerCommandes();   // écoute temps réel Firestore
  showPanel('dashboard');
}

// ════════════════════════════════════════  FIRESTORE — LISTENER TEMPS RÉEL
function abonnerCommandes() {
  // Indicateur de chargement
  setLoadingState(true);

  const q = query(collection(db, 'commandes'), orderBy('createdAt', 'desc'));

  _unsubscribe = onSnapshot(q, (snapshot) => {
    _commandes = snapshot.docs.map(d => ({
      _id     : d.id,                                // ID Firestore
      ref     : 'CMD-' + d.id.slice(0, 8).toUpperCase(),
      ...d.data(),
      // Convertir le Timestamp Firestore en ISO string lisible
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    }));

    setLoadingState(false);
    updateBadgeNouvelles();
    refreshCurrentPanel();
  }, (err) => {
    console.error('[Firestore] onSnapshot error:', err);
    setLoadingState(false);
    adminToast('❌ Erreur de connexion Firestore');
  });
}

function setLoadingState(loading) {
  const panels = document.querySelectorAll('.panel');
  if (loading) {
    panels.forEach(p => {
      if (p.classList.contains('active'))
        p.innerHTML = '<div class="fs-loading"><span class="fs-spinner"></span>Connexion à Firestore…</div>';
    });
  }
}

function updateBadgeNouvelles() {
  const n = _commandes.filter(c => c.statut === 'nouvelle').length;
  const badge = document.getElementById('badgeNouvelles');
  if (badge) { badge.textContent = n; badge.style.display = n > 0 ? 'flex' : 'none'; }
}

// ════════════════════════════════════════  NAVIGATION
const PANEL_TITLES = { dashboard: 'Tableau de bord', commandes: 'Gestion des commandes', clients: 'Clients inscrits' };

function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.snav-item').forEach(b => b.classList.remove('active'));
  const p = document.getElementById('panel-' + id); if (p) p.classList.add('active');
  document.querySelector(`[data-panel="${id}"]`)?.classList.add('active');
  document.getElementById('mainTitle').textContent = PANEL_TITLES[id] || '';
  if (id === 'dashboard') renderDashboard();
  if (id === 'commandes') renderCommandes();
  if (id === 'clients')   renderClients();
}

function refreshAll() {
  // Le listener onSnapshot maintient déjà la synchro — on re-render juste l'UI
  refreshCurrentPanel();
  adminToast('✓ Données actualisées');
}
function refreshCurrentPanel() {
  const active = document.querySelector('.snav-item.active')?.dataset.panel || 'dashboard';
  if (active === 'dashboard') renderDashboard();
  if (active === 'commandes') renderCommandes();
  if (active === 'clients')   renderClients();
}

// ════════════════════════════════════════  DASHBOARD
function renderDashboard() {
  const cmds    = _commandes;
  const clients = getClients();
  const today   = new Date().toISOString().split('T')[0];
  const counts  = { nouvelle: 0, en_preparation: 0, prete: 0, annulee: 0 };
  cmds.forEach(c => { if (counts[c.statut] !== undefined) counts[c.statut]++; });

  setText('kpiTotal',     cmds.length);
  setText('kpiNouvelles', counts.nouvelle);
  setText('kpiPrep',      counts.en_preparation);
  setText('kpiDone',      counts.prete + counts.annulee);
  setText('kpiClients',   Object.keys(clients).length);
  updateBadgeNouvelles();

  document.getElementById('dashRecentes').innerHTML = cmds.length
    ? tableHtml(cmds.slice(0, 5), true)
    : emptyState('Aucune commande pour l\'instant');

  const jourCmds = cmds.filter(c => c.dateRetrait === today && c.statut !== 'annulee');
  document.getElementById('dashAujourdhui').innerHTML = jourCmds.length
    ? tableHtml(jourCmds, true)
    : emptyState('Aucun retrait prévu aujourd\'hui');
}

// ════════════════════════════════════════  COMMANDES
function renderCommandes() {
  let cmds  = [..._commandes];
  const q   = (document.getElementById('searchCommandes')?.value || '').toLowerCase();
  const st  = document.getElementById('filtreStatut')?.value  || '';
  const dt  = document.getElementById('filtreDate')?.value    || '';
  const today = new Date(); today.setHours(0,0,0,0);

  if (q)  cmds = cmds.filter(c => (c.client + c.ref + c.produit + (c.telephone||'')).toLowerCase().includes(q));
  if (st) cmds = cmds.filter(c => c.statut === st);
  if (dt === 'today') {
    const t = today.toISOString().split('T')[0];
    cmds = cmds.filter(c => c.createdAt.startsWith(t) || c.dateRetrait === t);
  }
  if (dt === 'week')  { const w = new Date(today); w.setDate(w.getDate()-7);  cmds = cmds.filter(c => new Date(c.createdAt) >= w); }
  if (dt === 'month') { const m = new Date(today); m.setDate(m.getDate()-30); cmds = cmds.filter(c => new Date(c.createdAt) >= m); }

  document.getElementById('listeCommandes').innerHTML = cmds.length
    ? '<div class="table-wrap">' + tableHtml(cmds, false) + '</div>'
    : emptyState('Aucune commande ne correspond aux filtres');
}

// ════════════════════════════════════════  TABLE HTML
function tableHtml(cmds, compact) {
  const rows = cmds.map(c => {
    const s = STATUTS[c.statut] || STATUTS.nouvelle;
    const panierStr = c.panier?.map(p => `${p.nom}${p.qte > 1 ? ` ×${p.qte}` : ''}`).join(', ') || c.produit || '—';
    return `<tr>
      <td class="id-cell">${esc(c.ref)}</td>
      <td><strong>${esc(c.client)}</strong>${!compact ? `<br><span class="client-email">${esc(c.email||'')}</span>` : ''}</td>
      <td>${esc(panierStr)}</td>
      ${!compact ? `<td><strong>${formatDate(c.dateRetrait)}</strong>${c.heureRetrait ? ` à ${c.heureRetrait}` : ''}</td>` : ''}
      <td><span class="statut-badge ${s.css}"><span class="statut-dot"></span>${s.label}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn action-btn-detail"  onclick="ouvrirCommande('${c._id}')">Détail</button>
          ${c.statut === 'nouvelle'        ? `<button class="action-btn action-btn-prep"    onclick="setStatut('${c._id}','en_preparation')">Préparer</button>` : ''}
          ${c.statut === 'en_preparation'  ? `<button class="action-btn action-btn-prete"   onclick="setStatut('${c._id}','prete')">Marquer prête</button>` : ''}
          ${['nouvelle','en_preparation'].includes(c.statut) ? `<button class="action-btn action-btn-annuler" onclick="setStatut('${c._id}','annulee')">Annuler</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<table class="admin-table">
    <thead><tr>
      <th>Référence</th><th>Client</th><th>Produits</th>
      ${!compact ? '<th>Retrait</th>' : ''}
      <th>Statut</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ════════════════════════════════════════  MODAL DÉTAIL
function ouvrirCommande(firestoreId) {
  const c = _commandes.find(x => x._id === firestoreId);
  if (!c) return;
  const s = STATUTS[c.statut] || STATUTS.nouvelle;
  const panierHtml = (c.panier?.length)
    ? c.panier.map(p => `<div class="cmd-panier-item"><span>${p.emoji || '📦'} ${esc(p.nom)}</span><strong>×${p.qte}</strong></div>`).join('')
    : `<div class="cmd-panier-item"><span>📦 ${esc(c.produit||'—')}</span></div>`;

  document.getElementById('cmdModalContent').innerHTML = `
    <div class="cmd-modal-header">
      <div class="cmd-modal-ref">${esc(c.ref)} · Reçue le ${formatDateHeure(c.createdAt)}</div>
      <div class="cmd-modal-titre">${esc(c.client)}</div>
      <span class="statut-badge ${s.css}"><span class="statut-dot"></span>${s.label}</span>
    </div>
    <div class="cmd-modal-body">
      <div class="cmd-detail-grid">
        <div class="cmd-detail-item">
          <div class="cmd-detail-label">📞 Téléphone</div>
          <div class="cmd-detail-value">${esc(c.telephone||'—')}</div>
        </div>
        <div class="cmd-detail-item">
          <div class="cmd-detail-label">📧 Email</div>
          <div class="cmd-detail-value">${esc(c.email||'—')}</div>
        </div>
        <div class="cmd-detail-item">
          <div class="cmd-detail-label">📅 Date de retrait</div>
          <div class="cmd-detail-value">${formatDate(c.dateRetrait)}${c.heureRetrait ? ' à ' + c.heureRetrait : ''}</div>
        </div>
        <div class="cmd-detail-item">
          <div class="cmd-detail-label">🏷 Produit principal</div>
          <div class="cmd-detail-value">${esc(c.produit||'—')}</div>
        </div>
        <div class="cmd-detail-item cmd-detail-full">
          <div class="cmd-detail-label">💬 Message</div>
          <div class="cmd-detail-value" style="font-weight:400;font-size:.88rem;line-height:1.6">${esc(c.message||'—')}</div>
        </div>
      </div>
      <div class="cmd-panier-titre">🛒 Panier</div>
      ${panierHtml}
    </div>
    <div class="cmd-modal-footer">
      <div style="font-size:.7rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);align-self:center">Changer statut :</div>
      <select class="statut-select" onchange="setStatutEtReload('${firestoreId}', this.value)">
        ${Object.entries(STATUTS).map(([k, v]) => `<option value="${k}" ${c.statut === k ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}
      </select>
      <button class="action-btn action-btn-annuler" style="margin-left:auto" onclick="fermerCmdModal()">Fermer</button>
    </div>
  `;
  document.getElementById('cmdModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function fermerCmdModal() { document.getElementById('cmdModal').classList.remove('open'); document.body.style.overflow = ''; }

// ════════════════════════════════════════  STATUT → FIRESTORE updateDoc
async function setStatut(firestoreId, newStatut) {
  try {
    await updateDoc(doc(db, 'commandes', firestoreId), {
      statut    : newStatut,
      updatedAt : serverTimestamp(),
    });
    const labels = { en_preparation: 'En préparation', prete: 'Prête', annulee: 'Annulée', nouvelle: 'Nouvelle' };
    adminToast(`✓ Statut → ${labels[newStatut]}`);
    // Le listener onSnapshot va automatiquement mettre à jour _commandes et l'UI
  } catch (err) {
    console.error('[Firestore] updateDoc error:', err);
    adminToast('❌ Erreur lors de la mise à jour');
  }
}
async function setStatutEtReload(id, newStatut) {
  await setStatut(id, newStatut);
  // Attendre que onSnapshot rafraîchisse _commandes (~100 ms) puis rouvrir le modal
  setTimeout(() => ouvrirCommande(id), 300);
}

// ════════════════════════════════════════  CLIENTS (localStorage)
function renderClients() {
  const clients = getClients();
  const q = (document.getElementById('searchClients')?.value || '').toLowerCase();
  let entries = Object.entries(clients);
  if (q) entries = entries.filter(([email, c]) => (c.nom + email).toLowerCase().includes(q));
  document.getElementById('clientsCount').textContent = `${entries.length} client${entries.length > 1 ? 's' : ''}`;

  if (!entries.length) { document.getElementById('listeClients').innerHTML = emptyState('Aucun client inscrit'); return; }

  const rows = entries.map(([email, client]) => {
    const nbCmds = _commandes.filter(c => c.email === email).length;
    return `<tr>
      <td><strong>${esc(client.nom)}</strong><br><span class="client-email">${esc(email)}</span></td>
      <td><span class="client-cmds-count">${nbCmds}</span></td>
      <td><button class="btn-del-client" onclick="supprimerClient('${esc(email)}')">Supprimer</button></td>
    </tr>`;
  }).join('');

  document.getElementById('listeClients').innerHTML = `
    <div class="table-wrap">
      <table class="admin-table">
        <thead><tr><th>Client</th><th>Commandes</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function supprimerClient(email) {
  if (!confirm(`Supprimer le compte de ${email} ?`)) return;
  const clients = getClients(); delete clients[email]; saveClients(clients);
  adminToast('✓ Client supprimé'); renderClients();
}

// ════════════════════════════════════════  EXPORT CSV
function exportCSV() {
  const cmds = _commandes;
  if (!cmds.length) { adminToast('⚠ Aucune commande à exporter'); return; }
  const headers = ['Référence','Date commande','Client','Email','Téléphone','Produit','Date retrait','Heure retrait','Statut','Message'];
  const rows = cmds.map(c => [
    c.ref, formatDateHeure(c.createdAt), c.client, c.email||'', c.telephone||'',
    c.produit||'', c.dateRetrait||'', c.heureRetrait||'',
    STATUTS[c.statut]?.label || c.statut,
    (c.message||'').replace(/\n/g,' '),
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'));
  const csv  = [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `commandes-goemaere-${new Date().toISOString().split('T')[0]}.csv` });
  a.click(); URL.revokeObjectURL(url);
  adminToast('✓ Export CSV téléchargé');
}

// ════════════════════════════════════════  HELPERS
function formatDate(iso) { if (!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function formatDateHeure(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  return dt.toLocaleDateString('fr-FR') + ' ' + dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function esc(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function emptyState(msg) { return `<div class="empty-state"><div class="empty-state-icon">📭</div><p>${msg}</p></div>`; }

let _toastTimer;
function adminToast(msg) {
  const t = document.getElementById('adminToast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ════════════════════════════════════════  GLOBALS
window.showPanel       = showPanel;
window.refreshAll      = refreshAll;
window.ouvrirCommande  = ouvrirCommande;
window.fermerCmdModal  = fermerCmdModal;
window.setStatut       = setStatut;
window.setStatutEtReload = setStatutEtReload;
window.supprimerClient = supprimerClient;
window.exportCSV       = exportCSV;
window.adminLogout     = adminLogout;
window.renderCommandes = renderCommandes;
window.renderClients   = renderClients;

// ════════════════════════════════════════  CLAVIER + BOOT
document.addEventListener('keydown', e => { if (e.key === 'Escape') fermerCmdModal(); });
checkAdminAuth();
