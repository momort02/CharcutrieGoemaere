/* ════════════════════════════════════════
   CHARCUTERIE GOEMAERE — main.js
   Auth (localStorage) · Panier · Commandes → Firestore
════════════════════════════════════════ */
'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAnalytics }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js';
import { getFirestore, collection, addDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

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
getAnalytics(app);
const db = getFirestore(app);

// ── Données ──────────────────────────────────────────────────────
const PRODUITS = [
  { id: 1, cat: 'Boucherie',   nom: 'Jambons & Viandes', emoji: '🥩' },
  { id: 2, cat: 'Maison',      nom: 'Saucisses Maison',  emoji: '🌭' },
  { id: 3, cat: 'Charcuterie', nom: 'Pâtés & Terrines',  emoji: '🍖' },
  { id: 4, cat: 'Événements',  nom: 'Service Traiteur',  emoji: '🍽️' },
];
const LS    = { session: 'goemaere_session', clients: 'goemaere_clients' };
const ADMIN = { login: 'admin', mdp: 'admin2024' };

// ════════════════════════════════════════  SESSION
const getSession  = () => { try { return JSON.parse(localStorage.getItem(LS.session)); } catch { return null; } };
const setSession  = d  => localStorage.setItem(LS.session, JSON.stringify(d));
const clearSession= () => localStorage.removeItem(LS.session);
const estConnecte = () => !!getSession();

// ════════════════════════════════════════  CLIENTS (localStorage)
const getClients  = () => { try { return JSON.parse(localStorage.getItem(LS.clients)) || {}; } catch { return {}; } };
const saveClients = c  => localStorage.setItem(LS.clients, JSON.stringify(c));

// ════════════════════════════════════════  PANIER
let panier = [];

function ajouterAuPanier(id) {
  if (!estConnecte()) { ouvrirModal('login'); afficherToast('⚠️ Connectez-vous pour commander'); return; }
  const p = PRODUITS.find(x => x.id === id);
  if (!p) return;
  const ex = panier.find(x => x.id === id);
  ex ? ex.qte++ : panier.push({ ...p, qte: 1 });
  syncPanier();
  afficherToast(`✓ ${p.nom} ajouté`);
}
function retirerDuPanier(id) { panier = panier.filter(x => x.id !== id); syncPanier(); }

function syncPanier() {
  const total = panier.reduce((s, x) => s + x.qte, 0);
  const cnt = document.getElementById('panierCount');
  if (cnt) {
    cnt.textContent = total; cnt.style.display = total > 0 ? 'flex' : 'none';
    cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump');
    setTimeout(() => cnt.classList.remove('bump'), 300);
  }
  renderMiniPanier();
}
function renderMiniPanier() {
  const box = document.getElementById('miniPanierItems'); if (!box) return;
  if (!panier.length) { box.innerHTML = '<p class="mini-panier-vide">Aucun produit — ajoutez-en depuis la carte.</p>'; return; }
  box.innerHTML = panier.map(x =>
    `<div class="mini-panier-item">
      <span>${x.emoji} ${x.nom}${x.qte > 1 ? ` <strong>×${x.qte}</strong>` : ''}</span>
      <button onclick="retirerDuPanier(${x.id})" aria-label="Retirer">✕</button>
    </div>`).join('');
}

// ════════════════════════════════════════  AUTH MODAL
function ouvrirModal(tab = 'login') {
  const m = document.getElementById('authModal'); if (!m) return;
  m.classList.add('open'); document.body.style.overflow = 'hidden';
  basculerOnglet(tab); clearAuthMsg();
}
function fermerModal() { document.getElementById('authModal')?.classList.remove('open'); document.body.style.overflow = ''; }
function basculerOnglet(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
}
function clearAuthMsg() {
  ['authError', 'authSucces'].forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = ''; el.className = 'auth-msg'; } });
}
function setAuthMsg(id, txt, type = 'error') { const el = document.getElementById(id); if (el) { el.textContent = txt; el.className = `auth-msg ${type}`; } }

function handleLogin(e) {
  e.preventDefault();
  const login = document.getElementById('loginEmail').value.trim().toLowerCase();
  const mdp   = document.getElementById('loginMdp').value;
  if (login === ADMIN.login && mdp === ADMIN.mdp) {
    setSession({ email: 'admin', role: 'admin', nom: 'Administrateur' }); afterLogin(); return;
  }
  const client = getClients()[login];
  if (!client || client.mdp !== mdp) { setAuthMsg('authError', '❌ Identifiant ou mot de passe incorrect.'); return; }
  setSession({ email: login, role: 'client', nom: client.nom }); afterLogin();
}
function afterLogin() {
  const s = getSession(); fermerModal(); syncNav(); syncSectionCommande(); prefillForm();
  afficherToast(`👋 Bienvenue ${s.nom} !`);
  if (s.role === 'admin') setTimeout(() => { if (confirm('Accéder au panneau admin ?')) window.location.href = 'admin.html'; }, 400);
}
function handleRegister(e) {
  e.preventDefault();
  const nom   = document.getElementById('regNom').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const mdp   = document.getElementById('regMdp').value;
  const mdp2  = document.getElementById('regMdp2').value;
  if (!nom)          { setAuthMsg('authSucces', '❌ Veuillez saisir votre nom.', 'error'); return; }
  if (mdp !== mdp2)  { setAuthMsg('authSucces', '❌ Les mots de passe ne correspondent pas.', 'error'); return; }
  if (mdp.length < 6){ setAuthMsg('authSucces', '❌ Mot de passe trop court (6 car. min).', 'error'); return; }
  const clients = getClients();
  if (clients[email]) { setAuthMsg('authSucces', '❌ Un compte existe déjà avec cet email.', 'error'); return; }
  clients[email] = { nom, mdp }; saveClients(clients);
  setSession({ email, role: 'client', nom }); fermerModal(); syncNav(); syncSectionCommande(); prefillForm();
  afficherToast(`✅ Compte créé ! Bienvenue ${nom} !`);
}
function seDeconnecter() { clearSession(); panier = []; syncPanier(); syncNav(); syncSectionCommande(); afficherToast('👋 À bientôt !'); }

// ════════════════════════════════════════  SYNC UI
function syncNav() {
  const s = getSession();
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v; };
  const text = (id, v) => { const el = document.getElementById(id); if (el) el.textContent   = v; };
  if (s) {
    show('navBtnAuth', 'none'); show('navBtnDeconn', 'flex');
    show('navUserName', 'flex'); text('navUserName', s.nom);
    show('navBtnAdmin', s.role === 'admin' ? 'flex' : 'none');
  } else {
    show('navBtnAuth', 'flex'); show('navBtnDeconn', 'none');
    show('navUserName', 'none'); show('navBtnAdmin', 'none');
  }
}
function syncSectionCommande() {
  const wrap   = document.getElementById('commandeFormWrap');
  const locked = document.getElementById('commandeLocked');
  if (!wrap || !locked) return;
  if (estConnecte()) { wrap.style.display = 'block'; locked.style.display = 'none'; }
  else               { wrap.style.display = 'none';  locked.style.display = 'flex'; }
}
function prefillForm() {
  const s = getSession(); if (!s) return;
  const n = document.getElementById('cmdNom'); if (n && !n.value) n.value = s.nom;
}

// ════════════════════════════════════════  FORMULAIRE → FIRESTORE
function initFormCommande() {
  const form = document.getElementById('formuCommande'); if (!form) return;
  const dateInput = document.getElementById('cmdDate');
  if (dateInput) {
    const demain = new Date(); demain.setDate(demain.getDate() + 1);
    dateInput.min = demain.toISOString().split('T')[0];
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!estConnecte()) { ouvrirModal('login'); return; }

    const btn = form.querySelector('.form-submit');
    btn.textContent = 'Envoi en cours…'; btn.disabled = true;

    const s = getSession();
    const doc = {
      createdAt   : serverTimestamp(),
      dateRetrait : document.getElementById('cmdDate').value,
      heureRetrait: document.getElementById('cmdHeure').value,
      client      : s.nom,
      email       : s.email,
      telephone   : document.getElementById('cmdTel').value,
      produit     : document.getElementById('cmdProduit').value,
      panier      : panier.map(({ id, nom, emoji, cat, qte }) => ({ id, nom, emoji, cat, qte })),
      message     : document.getElementById('cmdMessage').value,
      statut      : 'nouvelle',
    };

    try {
      const ref = await addDoc(collection(db, 'commandes'), doc);
      const ref_short = 'CMD-' + ref.id.slice(0, 8).toUpperCase();

      form.style.display = 'none';
      const ok = document.getElementById('formuSucces');
      if (ok) {
        ok.style.display = 'block';
        const idEl = ok.querySelector('.succes-id');
        if (idEl) idEl.textContent = ref_short;
      }
      panier = []; syncPanier();
    } catch (err) {
      console.error('[Firestore] addDoc error:', err);
      btn.textContent = 'Envoyer ma commande →'; btn.disabled = false;
      afficherToast('❌ Erreur lors de l\'envoi — vérifiez votre connexion.');
    }
  });
}

// ════════════════════════════════════════  HORAIRES
function initHoraires() {
  const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const now   = new Date(); const jour = JOURS[now.getDay()]; const min = now.getHours() * 60 + now.getMinutes();
  let ouvert  = false; const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  document.querySelectorAll('#horaires-table tbody tr').forEach(tr => {
    const j = tr.dataset.jour; const td = tr.querySelector('td');
    if (j === jour) tr.classList.add('jour-actuel');
    if (!td?.dataset.plages) return;
    const plages = td.dataset.plages.split('|');
    td.innerHTML = plages.map(p => `<span class="horaire-badge">${p.replace('-', '&nbsp;–&nbsp;')}</span>`).join(' ');
    if (j === jour) plages.forEach(p => { const [d, f] = p.split('-'); if (min >= hm(d) && min <= hm(f)) ouvert = true; });
  });
  const badge = document.getElementById('statut-badge'); const texte = document.getElementById('statut-texte');
  if (ouvert && badge) { badge.classList.replace('ferme', 'ouvert'); if (texte) texte.textContent = 'Ouvert maintenant'; }
  const navS = document.getElementById('navStatut');
  if (navS && ouvert) { navS.classList.replace('ferme', 'ouvert'); navS.textContent = 'Ouvert'; }
}

// ════════════════════════════════════════  NAV / BURGER / REVEAL / TOAST
function initNavScroll() {
  const nb = document.getElementById('navbar'); if (!nb) return;
  window.addEventListener('scroll', () => nb.classList.toggle('scrolled', scrollY > 60), { passive: true });
}
function toggleMenu() { document.getElementById('navLinks')?.classList.toggle('open'); }
function closeMenu()  { document.getElementById('navLinks')?.classList.remove('open'); }

function initReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => { if (e.isIntersecting) { setTimeout(() => e.target.classList.add('visible'), i * 70); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

let _toastTimer;
function afficherToast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ════════════════════════════════════════  GLOBALS (HTML inline handlers)
window.ajouterAuPanier = ajouterAuPanier;
window.retirerDuPanier = retirerDuPanier;
window.ouvrirModal     = ouvrirModal;
window.fermerModal     = fermerModal;
window.basculerOnglet  = basculerOnglet;
window.seDeconnecter   = seDeconnecter;
window.toggleMenu      = toggleMenu;
window.closeMenu       = closeMenu;

// ════════════════════════════════════════  INIT
document.addEventListener('DOMContentLoaded', () => {
  initHoraires(); initNavScroll(); initReveal(); renderMiniPanier();
  syncNav(); syncSectionCommande(); prefillForm(); initFormCommande();
  document.getElementById('formLogin')?.addEventListener('submit', handleLogin);
  document.getElementById('formRegister')?.addEventListener('submit', handleRegister);
  document.getElementById('authModal')?.addEventListener('click', e => { if (e.target.id === 'authModal') fermerModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fermerModal(); });
});
