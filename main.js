/* ════════════════════════════════════════
   CHARCUTERIE GOEMAERE — main.js
   Firebase Auth (email/mdp) + Firestore
════════════════════════════════════════ */
'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAnalytics }
  from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  getFirestore, collection, addDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

// ────────────────────────────────────────
//  CONFIG FIREBASE
// ────────────────────────────────────────
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
getAnalytics(app);
const auth = getAuth(app);
const db   = getFirestore(app);

// UID admin hardcodé — à remplacer par l'UID réel depuis la console Firebase
// Firebase Console → Authentication → Users → copiez l'UID du compte admin
const ADMIN_UID = 'EiifSyyqmaUpmcFJUmSxgO6ixWy1';

// ────────────────────────────────────────
//  PRODUITS
// ────────────────────────────────────────
const PRODUITS = [
  { id: 1, cat: 'Boucherie',   nom: 'Jambons & Viandes', emoji: '🥩' },
  { id: 2, cat: 'Maison',      nom: 'Saucisses Maison',  emoji: '🌭' },
  { id: 3, cat: 'Charcuterie', nom: 'Pâtés & Terrines',  emoji: '🍖' },
  { id: 4, cat: 'Événements',  nom: 'Service Traiteur',  emoji: '🍽️' },
];

// ────────────────────────────────────────
//  ÉTAT UTILISATEUR (mis à jour par onAuthStateChanged)
// ────────────────────────────────────────
let currentUser = null;   // objet Firebase User
let panier      = [];

// ════════════════════════════════════════
//  OBSERVER AUTH — source unique de vérité
// ════════════════════════════════════════
onAuthStateChanged(auth, user => {
  currentUser = user;
  syncNav();
  syncSectionCommande();
  if (user) prefillForm();
});

const estConnecte = () => !!currentUser;
const estAdmin    = () => currentUser?.uid === ADMIN_UID;

// ════════════════════════════════════════
//  PANIER
// ════════════════════════════════════════
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
    cnt.textContent = total;
    cnt.style.display = total > 0 ? 'flex' : 'none';
    cnt.classList.remove('bump'); void cnt.offsetWidth; cnt.classList.add('bump');
    setTimeout(() => cnt.classList.remove('bump'), 300);
  }
  renderMiniPanier();
}
function renderMiniPanier() {
  const box = document.getElementById('miniPanierItems'); if (!box) return;
  if (!panier.length) {
    box.innerHTML = '<p class="mini-panier-vide">Aucun produit — ajoutez-en depuis la carte.</p>';
    return;
  }
  box.innerHTML = panier.map(x =>
    `<div class="mini-panier-item">
      <span>${x.emoji} ${x.nom}${x.qte > 1 ? ` <strong>×${x.qte}</strong>` : ''}</span>
      <button onclick="retirerDuPanier(${x.id})" aria-label="Retirer">✕</button>
    </div>`).join('');
}

// ════════════════════════════════════════
//  MODAL AUTH — ouverture / onglets
// ════════════════════════════════════════
function ouvrirModal(tab = 'login') {
  const m = document.getElementById('authModal'); if (!m) return;
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
  basculerOnglet(tab);
  clearAuthMsg();
}
function fermerModal() {
  document.getElementById('authModal')?.classList.remove('open');
  document.body.style.overflow = '';
}
function basculerOnglet(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
}
function clearAuthMsg() {
  ['authError', 'authSucces', 'authReset'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.className = 'auth-msg'; }
  });
}
function setAuthMsg(id, txt, type = 'error') {
  const el = document.getElementById(id);
  if (el) { el.textContent = txt; el.className = `auth-msg ${type}`; }
}
function setBtnLoading(btnId, loading, label = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn.dataset.orig = btn.textContent; btn.textContent = '…'; }
  else btn.textContent = label || btn.dataset.orig || btn.textContent;
}

// ════════════════════════════════════════
//  INSCRIPTION — Firebase createUser
// ════════════════════════════════════════
async function handleRegister(e) {
  e.preventDefault();
  const nom  = document.getElementById('regNom').value.trim();
  const email= document.getElementById('regEmail').value.trim();
  const mdp  = document.getElementById('regMdp').value;
  const mdp2 = document.getElementById('regMdp2').value;

  clearAuthMsg();
  if (!nom)          { setAuthMsg('authSucces', '❌ Veuillez saisir votre nom.');                    return; }
  if (mdp !== mdp2)  { setAuthMsg('authSucces', '❌ Les mots de passe ne correspondent pas.');       return; }
  if (mdp.length < 6){ setAuthMsg('authSucces', '❌ Mot de passe trop court (6 caractères min.).'); return; }

  setBtnLoading('btnRegister', true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, mdp);
    await updateProfile(cred.user, { displayName: nom });
    // onAuthStateChanged prend le relais → syncNav / syncSectionCommande
    fermerModal();
    afficherToast(`✅ Compte créé ! Bienvenue ${nom} !`);
  } catch (err) {
    setAuthMsg('authSucces', firebaseErrMsg(err));
  } finally {
    setBtnLoading('btnRegister', false);
  }
}

// ════════════════════════════════════════
//  CONNEXION — Firebase signIn
// ════════════════════════════════════════
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const mdp   = document.getElementById('loginMdp').value;

  clearAuthMsg();
  setBtnLoading('btnLogin', true);
  try {
    await signInWithEmailAndPassword(auth, email, mdp);
    // onAuthStateChanged prend le relais
    fermerModal();
    const nom = auth.currentUser?.displayName || email.split('@')[0];
    afficherToast(`👋 Bienvenue ${nom} !`);

    // Redirection admin si UID correspond
    if (auth.currentUser?.uid === ADMIN_UID) {
      setTimeout(() => { if (confirm('Accéder au panneau admin ?')) window.location.href = 'admin.html'; }, 400);
    }
  } catch (err) {
    setAuthMsg('authError', firebaseErrMsg(err));
  } finally {
    setBtnLoading('btnLogin', false);
  }
}

// ════════════════════════════════════════
//  MOT DE PASSE OUBLIÉ
// ════════════════════════════════════════
async function handleReset(e) {
  e.preventDefault();
  const email = document.getElementById('resetEmail').value.trim();
  clearAuthMsg();
  if (!email) { setAuthMsg('authReset', '❌ Saisissez votre adresse email.'); return; }
  setBtnLoading('btnReset', true);
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMsg('authReset', '✅ Email envoyé ! Vérifiez votre boîte de réception.', 'success');
    document.getElementById('resetEmail').value = '';
  } catch (err) {
    setAuthMsg('authReset', firebaseErrMsg(err));
  } finally {
    setBtnLoading('btnReset', false);
  }
}

// ════════════════════════════════════════
//  DÉCONNEXION
// ════════════════════════════════════════
async function seDeconnecter() {
  await signOut(auth);
  panier = []; syncPanier();
  afficherToast('👋 À bientôt !');
}

// ════════════════════════════════════════
//  TRADUCTION ERREURS FIREBASE → FR
// ════════════════════════════════════════
function firebaseErrMsg(err) {
  const map = {
    'auth/email-already-in-use'    : '❌ Un compte existe déjà avec cet email.',
    'auth/invalid-email'           : '❌ Adresse email invalide.',
    'auth/weak-password'           : '❌ Mot de passe trop faible (6 caractères min.).',
    'auth/user-not-found'          : '❌ Aucun compte trouvé avec cet email.',
    'auth/wrong-password'          : '❌ Mot de passe incorrect.',
    'auth/invalid-credential'      : '❌ Email ou mot de passe incorrect.',
    'auth/too-many-requests'       : '❌ Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/network-request-failed'  : '❌ Erreur réseau. Vérifiez votre connexion.',
    'auth/user-disabled'           : '❌ Ce compte a été désactivé.',
    'auth/missing-email'           : '❌ Veuillez saisir votre adresse email.',
    'auth/popup-closed-by-user'    : '❌ Connexion annulée.',
  };
  return map[err?.code] || `❌ Erreur : ${err?.message || err?.code || 'inconnue'}`;
}

// ════════════════════════════════════════
//  SYNC UI
// ════════════════════════════════════════
function syncNav() {
  const u = currentUser;
  const show = (id, v) => { const el = document.getElementById(id); if (el) el.style.display = v; };
  const text = (id, v) => { const el = document.getElementById(id); if (el) el.textContent   = v; };
  if (u) {
    const nom = u.displayName || u.email.split('@')[0];
    show('navBtnAuth',  'none');   show('navBtnDeconn', 'flex');
    show('navUserName', 'flex');   text('navUserName', nom);
    show('navBtnAdmin', u.uid === ADMIN_UID ? 'flex' : 'none');
  } else {
    show('navBtnAuth',  'flex');   show('navBtnDeconn', 'none');
    show('navUserName', 'none');   show('navBtnAdmin',  'none');
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
  const u = currentUser; if (!u) return;
  const n = document.getElementById('cmdNom');
  if (n && !n.value) n.value = u.displayName || u.email.split('@')[0];
}

// ════════════════════════════════════════
//  FORMULAIRE COMMANDE → FIRESTORE
// ════════════════════════════════════════
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

    const u = currentUser;
    const commande = {
      createdAt   : serverTimestamp(),
      dateRetrait : document.getElementById('cmdDate').value,
      heureRetrait: document.getElementById('cmdHeure').value,
      client      : u.displayName || u.email.split('@')[0],
      email       : u.email,
      uid         : u.uid,
      telephone   : document.getElementById('cmdTel').value,
      produit     : document.getElementById('cmdProduit').value,
      panier      : panier.map(({ id, nom, emoji, cat, qte }) => ({ id, nom, emoji, cat, qte })),
      message     : document.getElementById('cmdMessage').value,
      statut      : 'nouvelle',
    };

    try {
      const ref = await addDoc(collection(db, 'commandes'), commande);
      form.style.display = 'none';
      const ok = document.getElementById('formuSucces');
      if (ok) {
        ok.style.display = 'block';
        const idEl = ok.querySelector('.succes-id');
        if (idEl) idEl.textContent = 'CMD-' + ref.id.slice(0, 8).toUpperCase();
      }
      panier = []; syncPanier();
    } catch (err) {
      console.error('[Firestore] addDoc:', err);
      btn.textContent = 'Envoyer ma commande →'; btn.disabled = false;
      afficherToast('❌ Erreur lors de l\'envoi — réessayez.');
    }
  });
}

// ════════════════════════════════════════
//  HORAIRES
// ════════════════════════════════════════
function initHoraires() {
  const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const now = new Date(); const jour = JOURS[now.getDay()]; const min = now.getHours()*60+now.getMinutes();
  let ouvert = false; const hm = s => { const [h,m]=s.split(':').map(Number); return h*60+m; };
  document.querySelectorAll('#horaires-table tbody tr').forEach(tr => {
    const j=tr.dataset.jour; const td=tr.querySelector('td');
    if (j===jour) tr.classList.add('jour-actuel');
    if (!td?.dataset.plages) return;
    const plages=td.dataset.plages.split('|');
    td.innerHTML=plages.map(p=>`<span class="horaire-badge">${p.replace('-','&nbsp;–&nbsp;')}</span>`).join(' ');
    if (j===jour) plages.forEach(p=>{ const[d,f]=p.split('-'); if(min>=hm(d)&&min<=hm(f)) ouvert=true; });
  });
  const badge=document.getElementById('statut-badge'); const texte=document.getElementById('statut-texte');
  if (ouvert&&badge){ badge.classList.replace('ferme','ouvert'); if(texte) texte.textContent='Ouvert maintenant'; }
  const navS=document.getElementById('navStatut');
  if (navS&&ouvert){ navS.classList.replace('ferme','ouvert'); navS.textContent='Ouvert'; }
}

// ════════════════════════════════════════
//  NAV / BURGER / REVEAL / TOAST
// ════════════════════════════════════════
function initNavScroll() {
  const nb=document.getElementById('navbar'); if (!nb) return;
  window.addEventListener('scroll',()=>nb.classList.toggle('scrolled',scrollY>60),{passive:true});
}
function toggleMenu() { document.getElementById('navLinks')?.classList.toggle('open'); }
function closeMenu()  { document.getElementById('navLinks')?.classList.remove('open'); }
function initReveal() {
  const io=new IntersectionObserver((entries)=>{
    entries.forEach((e,i)=>{ if(e.isIntersecting){ setTimeout(()=>e.target.classList.add('visible'),i*70); io.unobserve(e.target); } });
  },{threshold:0.1});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
}
let _toastTimer;
function afficherToast(msg) {
  const t=document.getElementById('toast'); if (!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(_toastTimer); _toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
}

// ════════════════════════════════════════
//  GLOBALS (handlers HTML inline)
// ════════════════════════════════════════
window.ajouterAuPanier = ajouterAuPanier;
window.retirerDuPanier = retirerDuPanier;
window.ouvrirModal     = ouvrirModal;
window.fermerModal     = fermerModal;
window.basculerOnglet  = basculerOnglet;
window.seDeconnecter   = seDeconnecter;
window.toggleMenu      = toggleMenu;
window.closeMenu       = closeMenu;

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initHoraires(); initNavScroll(); initReveal(); renderMiniPanier(); initFormCommande();

  document.getElementById('formLogin')?.addEventListener('submit', handleLogin);
  document.getElementById('formRegister')?.addEventListener('submit', handleRegister);
  document.getElementById('formReset')?.addEventListener('submit', handleReset);
  document.getElementById('authModal')?.addEventListener('click', e => { if (e.target.id==='authModal') fermerModal(); });
  document.addEventListener('keydown', e => { if (e.key==='Escape') fermerModal(); });
});
