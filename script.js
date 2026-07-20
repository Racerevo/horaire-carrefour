// ============================================================
// HORAIRE CARREFOUR — script.js (Phase 1 : Supabase Auth)
// Changements vs l'ancienne version :
//   - Plus de mots de passe en clair dans le code (faille corrigée)
//   - Inscription en autonomie (email + mdp + code équipe)
//   - Validation admin obligatoire avant d'accéder à l'app
//   - Liste des employés chargée depuis la table profiles
// Tout le reste (planning, vue partagée, chat, push) est conservé.
// ============================================================

const SUPABASE_URL = 'https://xbicuvlltztukvkibzxe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ikbc6Fwyajjn-o1SUTim5A_wcWCi52G';
const VAPID_PUBLIC_KEY = 'BI7D-mWAaeU3XGX227WG1XWBxQvlF1u91keFpBEpUIaIEkFqrg3bqNkPxdeuyQ4kEOzBPOmMIx4Ljexj4WCN2Xs';
const CODE_EQUIPE = 'CARREFOUR2026'; // 🔑 à donner oralement aux collègues

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const today = new Date();
const mondayStart = getMonday(today);
let currentWeek = loadWeekStart() || mondayStart;

let authUser = null;      // { id (uuid), name, color } — même forme qu'avant
let monProfil = null;     // ligne complète de la table profiles
let profils = [];         // employés approuvés (remplace l'ancien tableau users)
let selectedUserId = null;
let editPanelOpen = false;
let data = {};
let chatMessages = [];
let authMode = 'connexion'; // 'connexion' | 'inscription'
let canalProfilPerso = null;

const elements = {
  loginScreen: document.getElementById('login-screen'),
  pendingScreen: document.getElementById('pending-screen'),
  appScreen: document.getElementById('app-screen'),
  loginForm: document.getElementById('login-form'),
  tabLogin: document.getElementById('tab-login'),
  tabSignup: document.getElementById('tab-signup'),
  fieldName: document.getElementById('field-name'),
  fieldCode: document.getElementById('field-code'),
  signupName: document.getElementById('signup-name'),
  signupCode: document.getElementById('signup-code'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginError: document.getElementById('login-error'),
  signupNote: document.getElementById('signup-note'),
  authSubmit: document.getElementById('auth-submit'),
  pendingIcon: document.getElementById('pending-icon'),
  pendingTitle: document.getElementById('pending-title'),
  pendingText: document.getElementById('pending-text'),
  pendingPulse: document.getElementById('pending-pulse'),
  pendingLogout: document.getElementById('pending-logout'),
  logoutButton: document.getElementById('logout-button'),
  welcomeText: document.getElementById('welcome-text'),
  weekLabel: document.getElementById('week-label'),
  prevWeek: document.getElementById('prev-week'),
  nextWeek: document.getElementById('next-week'),
  userList: document.getElementById('user-list'),
  adminBlock: document.getElementById('admin-block'),
  adminDemandes: document.getElementById('admin-demandes'),
  adminCount: document.getElementById('admin-count'),
  enablePush: document.getElementById('enable-push'),
  scheduleTitle: document.getElementById('schedule-title'),
  weekDays: document.getElementById('week-days'),
  scheduleGrid: document.getElementById('schedule-grid'),
  editPanel: document.getElementById('edit-panel'),
  toggleEditPanel: document.getElementById('toggle-edit-panel'),
  sharedGrid: document.getElementById('shared-grid'),
  overlapSummary: document.getElementById('overlap-summary'),
  importButton: document.getElementById('import-photo-button'),
  importInput: document.getElementById('import-photo-input'),
  importModal: document.getElementById('import-modal'),
  importClose: document.getElementById('import-close'),
  importStepAnalyse: document.getElementById('import-step-analyse'),
  importStepVerif: document.getElementById('import-step-verif'),
  importPreview: document.getElementById('import-preview'),
  importBarFill: document.getElementById('import-bar-fill'),
  importProgressText: document.getElementById('import-progress-text'),
  importPeriode: document.getElementById('import-periode'),
  importAlertes: document.getElementById('import-alertes'),
  importJours: document.getElementById('import-jours'),
  importValider: document.getElementById('import-valider'),
  importRetry: document.getElementById('import-retry'),
  chatFloat: document.getElementById('chat-float'),
  chatToggle: document.getElementById('chat-toggle'),
  chatPanel: document.getElementById('chat-panel'),
  chatClose: document.getElementById('chat-close'),
  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input')
};

// ============================================================
// INITIALISATION & ROUTAGE (connexion → attente → app)
// ============================================================

async function initialize() {
  bindEvents();

  const { data: { session } } = await supabaseClient.auth.getSession();
  await router(session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    router(session);
  });
}

async function router(session) {
  if (!session) {
    authUser = null;
    monProfil = null;
    showLogin();
    return;
  }

  monProfil = await chargerMonProfil(session.user.id);

  if (!monProfil || monProfil.statut !== 'approuve') {
    showPending();
    ecouterMonProfil(session.user.id); // bascule automatique quand accepté
    return;
  }

  authUser = {
    id: monProfil.id,
    name: monProfil.nom || monProfil.email
  };
  selectedUserId = selectedUserId || authUser.id;

  profils = await chargerProfils();
  data = await loadData();
  chatMessages = await loadChat();
  showApp();
  setupRealtime();
}

async function chargerMonProfil(userId) {
  const { data: profil, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.error(error); return null; }
  return profil;
}

async function chargerProfils() {
  const { data: rows, error } = await supabaseClient
    .from('profiles')
    .select('id, nom, email, role')
    .eq('statut', 'approuve')
    .order('nom');
  if (error) { console.error(error); return []; }
  return rows.map(p => ({
    id: p.id,
    name: p.nom || p.email,
    role: p.role
  }));
}

// Écoute MON profil : dès que l'admin accepte, l'app s'ouvre toute seule
function ecouterMonProfil(userId) {
  if (canalProfilPerso) supabaseClient.removeChannel(canalProfilPerso);
  canalProfilPerso = supabaseClient
    .channel(`profil-${userId}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
      payload => {
        monProfil = payload.new;
        if (monProfil.statut === 'approuve') {
          supabaseClient.auth.getSession().then(({ data: { session } }) => router(session));
        } else {
          showPending();
        }
      })
    .subscribe();
}

function setupRealtime() {
  supabaseClient
    .channel('events-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, async () => {
      data = await loadData();
      if (authUser) {
        renderSchedule();
        renderSharedSchedule();
      }
    })
    .subscribe();

  supabaseClient
    .channel('messages-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async () => {
      chatMessages = await loadChat();
      if (authUser) {
        renderChat();
      }
    })
    .subscribe();

  // Nouveaux profils (demandes) + validations → met à jour listes et badge admin
  supabaseClient
    .channel('profiles-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
      if (!authUser) return;
      profils = await chargerProfils();
      renderUsers();
      renderSharedSchedule();
      if (monProfil?.role === 'admin') renderDemandes();
    })
    .subscribe();
}

// ============================================================
// ÉVÉNEMENTS UI
// ============================================================

function bindEvents() {
  elements.loginForm.addEventListener('submit', handleAuthSubmit);
  elements.tabLogin.addEventListener('click', () => setAuthMode('connexion'));
  elements.tabSignup.addEventListener('click', () => setAuthMode('inscription'));
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.pendingLogout.addEventListener('click', handleLogout);
  elements.enablePush.addEventListener('click', activerPush);
  elements.prevWeek.addEventListener('click', () => changeWeek(-1));
  elements.nextWeek.addEventListener('click', () => changeWeek(1));
  elements.chatToggle.addEventListener('click', toggleChat);
  elements.chatClose.addEventListener('click', toggleChat);
  elements.chatForm.addEventListener('submit', handleChatSubmit);
  elements.importButton?.addEventListener('click', () => elements.importInput.click());
  elements.importInput?.addEventListener('change', analyserPhotoPlanning);
  elements.importClose?.addEventListener('click', fermerImport);
  elements.importRetry?.addEventListener('click', () => {
    fermerImport();
    elements.importInput.click();
  });
  elements.importValider?.addEventListener('click', validerImport);
  elements.toggleEditPanel?.addEventListener('click', () => {
    editPanelOpen = !editPanelOpen;
    renderSchedule();
  });
  document.querySelectorAll('.mobile-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      const workspace = document.getElementById('workspace');
      workspace.classList.remove('view-planning', 'view-shared', 'view-employees');
      workspace.classList.add(`view-${view}`);
      document.querySelectorAll('.mobile-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      window.scrollTo({ top: 0 });
    });
  });
}

function setAuthMode(mode) {
  authMode = mode;
  const inscription = mode === 'inscription';
  elements.tabLogin.classList.toggle('active', !inscription);
  elements.tabSignup.classList.toggle('active', inscription);
  elements.fieldName.classList.toggle('hidden', !inscription);
  elements.fieldCode.classList.toggle('hidden', !inscription);
  elements.signupNote.classList.toggle('hidden', !inscription);
  elements.authSubmit.textContent = inscription ? 'Envoyer ma demande' : 'Se connecter';
  elements.loginError.classList.add('hidden');
}

// ============================================================
// AUTHENTIFICATION (Supabase Auth)
// ============================================================

// Convertit l'identifiant saisi en email synthétique pour Supabase Auth.
// "Emma Dupont" -> "emma.dupont@equipe.local" (minuscules, sans accents)
function identifiantVersEmail(identifiant) {
  const propre = identifiant
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/\s+/g, '.')                                // espaces -> points
    .replace(/[^a-z0-9._-]/g, '');                       // caractères invalides
  return `${propre}@equipe.local`;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  elements.loginError.classList.add('hidden');
  elements.authSubmit.disabled = true;

  const identifiant = elements.loginEmail.value.trim();
  if (!identifiant) return afficherErreur('Indique ton identifiant.');
  const email = identifiantVersEmail(identifiant);
  const password = elements.loginPassword.value;

  try {
    if (authMode === 'connexion') {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        afficherErreur(error.message.includes('Invalid login credentials')
          ? 'Identifiant ou mot de passe incorrect.'
          : 'Connexion impossible. Réessaie dans un instant.');
      }
      // Si OK : onAuthStateChange appelle router() tout seul
    } else {
      const nom = elements.signupName.value.trim();
      const code = elements.signupCode.value.trim().toUpperCase();
      if (nom.length < 2) return afficherErreur('Indique ton prénom (ou prénom + nom).');
      if (code !== CODE_EQUIPE) return afficherErreur('Code équipe incorrect. Demande-le à Matty. 😉');
      if (password.length < 6) return afficherErreur('Le mot de passe doit faire au moins 6 caractères.');

      const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { nom } } // récupéré par le trigger SQL → profiles.nom
      });
      if (error) {
        afficherErreur(error.message.includes('already registered')
          ? 'Un compte existe déjà avec cet identifiant.'
          : 'Inscription impossible. Réessaie avec un autre identifiant.');
      }
      // Si OK : session créée avec statut en_attente → écran d'attente
    }
  } finally {
    elements.authSubmit.disabled = false;
  }
}

function afficherErreur(message) {
  elements.loginError.textContent = message;
  elements.loginError.classList.remove('hidden');
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  authUser = null;
  monProfil = null;
  selectedUserId = null;
  showLogin();
}

// ============================================================
// ÉCRANS
// ============================================================

function montrer(ecran) {
  [elements.loginScreen, elements.pendingScreen, elements.appScreen]
    .forEach(p => p.classList.remove('active'));
  ecran.classList.add('active');
}

function showLogin() {
  montrer(elements.loginScreen);
  elements.chatFloat.classList.add('hidden');
  elements.loginError.classList.add('hidden');
}

function showPending() {
  montrer(elements.pendingScreen);
  elements.chatFloat.classList.add('hidden');
  const refuse = monProfil?.statut === 'refuse';
  elements.pendingIcon.textContent = refuse ? '🚫' : '⏳';
  elements.pendingTitle.textContent = refuse ? 'Demande refusée' : 'Demande envoyée !';
  elements.pendingText.textContent = refuse
    ? "Ta demande d'accès n'a pas été acceptée. Si tu penses que c'est une erreur, parles-en directement à Matty."
    : "Ton compte est en attente de validation par un admin. Cette page se mettra à jour toute seule dès que ta demande est acceptée.";
  elements.pendingPulse.classList.toggle('hidden', refuse);
}

function showApp() {
  montrer(elements.appScreen);
  elements.chatFloat.classList.remove('hidden');
  elements.welcomeText.textContent = `Connecté en tant que ${authUser.name}`;
  renderUsers();
  renderWeek();
  renderSchedule();
  renderSharedSchedule();
  renderChat();
  if (monProfil?.role === 'admin') {
    elements.adminBlock.classList.remove('hidden');
    renderDemandes();
  } else {
    elements.adminBlock.classList.add('hidden');
  }
  setupPushNotifications();
}

// ============================================================
// PANNEAU ADMIN — Accepter / refuser les demandes
// ============================================================

async function renderDemandes() {
  const { data: rows, error } = await supabaseClient
    .from('profiles')
    .select('id, nom, email, created_at')
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }

  elements.adminCount.textContent = rows.length;
  elements.adminCount.classList.toggle('hidden', rows.length === 0);
  elements.adminDemandes.innerHTML = '';

  if (!rows.length) {
    const vide = document.createElement('li');
    vide.style.color = '#64748b';
    vide.textContent = 'Aucune demande en attente.';
    elements.adminDemandes.appendChild(vide);
    return;
  }

  rows.forEach(p => {
    const item = document.createElement('li');
    item.className = 'demande-item';
    const infos = document.createElement('div');
    const nom = document.createElement('strong');
    nom.textContent = p.nom || '(sans nom)';
    const email = document.createElement('small');
    email.textContent = p.email;
    infos.appendChild(nom);
    infos.appendChild(email);
    const actions = document.createElement('div');
    actions.className = 'demande-actions';
    const accepter = document.createElement('button');
    accepter.className = 'demande-accepter';
    accepter.textContent = 'Accepter';
    accepter.addEventListener('click', () => changerStatut(p.id, 'approuve'));
    const refuser = document.createElement('button');
    refuser.className = 'demande-refuser';
    refuser.textContent = 'Refuser';
    refuser.addEventListener('click', () => {
      if (confirm(`Refuser la demande de ${p.nom || p.email} ?`)) {
        changerStatut(p.id, 'refuse');
      }
    });
    actions.appendChild(accepter);
    actions.appendChild(refuser);
    item.appendChild(infos);
    item.appendChild(actions);
    elements.adminDemandes.appendChild(item);
  });
}

async function changerStatut(profilId, statut) {
  const { error } = await supabaseClient
    .from('profiles')
    .update({ statut })
    .eq('id', profilId);
  if (error) {
    console.error(error);
    alert('Impossible de mettre à jour. Réessaie.');
  }
  // Le realtime sur profiles rafraîchit la liste tout seul
}

// ============================================================
// NOTIFICATIONS PUSH (abonnement — l'ENVOI arrive en phase 5)
// ============================================================

async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    elements.enablePush.classList.add('hidden');
    return;
  }
  if (Notification.permission === 'granted') {
    elements.enablePush.classList.add('hidden');
    await enregistrerAbonnement();
  } else if (Notification.permission === 'default') {
    // L'autorisation DOIT venir d'un clic (exigence iOS notamment)
    elements.enablePush.classList.remove('hidden');
  } else {
    elements.enablePush.classList.add('hidden');
  }
}

async function activerPush() {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    elements.enablePush.classList.add('hidden');
    await enregistrerAbonnement();
  }
}

async function enregistrerAbonnement() {
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    await supabaseClient.from('push_subscriptions').upsert(
      { user_id: authUser.id, subscription: subscription.toJSON() },
      { onConflict: 'endpoint' }
    );
  } catch (err) {
    console.error('Notifications push :', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

// ============================================================
// SEMAINE & PLANNING (logique d'origine conservée)
// ============================================================

function changeWeek(direction) {
  currentWeek = new Date(currentWeek.getTime() + direction * 7 * 24 * 60 * 60 * 1000);
  currentWeek = getMonday(currentWeek);
  saveWeekStart(currentWeek);
  renderWeek();
  renderSchedule();
  renderSharedSchedule();
}

function renderWeek() {
  const end = new Date(currentWeek.getTime() + 6 * 24 * 60 * 60 * 1000);
  elements.weekLabel.textContent = `${formatDate(currentWeek)} → ${formatDate(end)}`;
}

function renderUsers() {
  elements.userList.innerHTML = '';
  profils.forEach(user => {
    const item = document.createElement('li');
    item.className = `user-item${selectedUserId === user.id ? ' active' : ''}`;
    const title = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = user.name;
    title.appendChild(strong);
    item.appendChild(title);
    const viewButton = document.createElement('button');
    viewButton.textContent = 'Voir';
    viewButton.addEventListener('click', () => {
      selectedUserId = user.id;
      renderUsers();
      renderSchedule();
      if (window.matchMedia('(max-width: 860px)').matches) {
        document.querySelector('.mobile-tabs .tab[data-view="planning"]')?.click();
      }
    });
    item.appendChild(viewButton);
    elements.userList.appendChild(item);
  });
}

function renderSchedule() {
  const user = profils.find(u => u.id === selectedUserId) ||
    (selectedUserId === authUser?.id ? authUser : null);
  if (!user) return;
  elements.scheduleTitle.textContent = `Emploi du temps de ${user.name}`;
  const editable = authUser && authUser.id === selectedUserId;
  renderEditToggle(editable);
  const weekDays = generateWeekDays(currentWeek);
  elements.weekDays.innerHTML = '';
  weekDays.forEach(day => {
    const card = document.createElement('div');
    card.className = 'day-card';
    card.innerHTML = `<strong>${day.label}</strong><span>${day.date}</span>`;
    elements.weekDays.appendChild(card);
  });
  const weekKey = getWeekKey(currentWeek);
  const events = data[weekKey]?.[user.id] || [];
  elements.scheduleGrid.innerHTML = '';
  for (let index = 0; index < 7; index += 1) {
    const dayColumn = document.createElement('div');
    dayColumn.className = 'day-column';
    const dayLabel = document.createElement('div');
    dayLabel.className = 'day-mobile-label';
    dayLabel.textContent = `${weekDays[index].label} ${weekDays[index].date}`;
    dayColumn.appendChild(dayLabel);
    const dayEvents = events.filter(event => event.dayIndex === index).sort((a, b) => a.start.localeCompare(b.start));
    if (!dayEvents.length) {
      dayColumn.classList.add('empty');
      const emptyText = document.createElement('span');
      emptyText.textContent = 'Aucun événement';
      dayColumn.appendChild(emptyText);
    } else {
      dayEvents.forEach(event => {
        const card = document.createElement('div');
        card.className = 'event-card';
        const titre = document.createElement('strong');
        titre.textContent = event.title;
        const meta = document.createElement('div');
        meta.className = 'event-meta';
        const plage = document.createElement('span');
        plage.textContent = `${event.start} - ${event.end}`;
        meta.appendChild(plage);
        card.appendChild(titre);
        card.appendChild(meta);
        if (authUser && authUser.id === user.id) {
          const actions = document.createElement('div');
          actions.className = 'event-actions';
          const editBtn = document.createElement('button');
          editBtn.textContent = 'Modifier';
          editBtn.addEventListener('click', () => showEditForm(event.id));
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Supprimer';
          deleteBtn.addEventListener('click', () => deleteEvent(event.id));
          actions.appendChild(editBtn);
          actions.appendChild(deleteBtn);
          card.appendChild(actions);
        }
        dayColumn.appendChild(card);
      });
    }
    elements.scheduleGrid.appendChild(dayColumn);
  }
  renderEditPanel(events);
}

function renderEditToggle(editable) {
  const toggle = elements.toggleEditPanel;
  if (!toggle) return;
  if (editable) {
    toggle.classList.remove('hidden');
    toggle.textContent = editPanelOpen ? 'Fermer modification' : "Modifier l'emploi du temps";
    elements.importButton?.classList.remove('hidden');
  } else {
    toggle.classList.add('hidden');
    elements.importButton?.classList.add('hidden');
  }
}

function renderEditPanel(events) {
  const editable = authUser && authUser.id === selectedUserId;
  if (!editable) {
    elements.editPanel.classList.add('hidden');
    elements.editPanel.innerHTML = `<p>Vous pouvez afficher le planning des autres employés mais seul votre planning peut être modifié.</p>`;
    return;
  }
  if (!editPanelOpen) {
    elements.editPanel.classList.add('hidden');
    elements.editPanel.innerHTML = `<p>Appuyez sur "Modifier l'emploi du temps" pour ajouter ou changer une plage horaire.</p>`;
    return;
  }
  elements.editPanel.classList.remove('hidden');
  elements.editPanel.innerHTML = `
    <h3>Modifier votre semaine</h3>
    <form id="event-form">
      <label>
        Jour
        <select id="event-day">
          <option value="0">Lundi</option>
          <option value="1">Mardi</option>
          <option value="2">Mercredi</option>
          <option value="3">Jeudi</option>
          <option value="4">Vendredi</option>
          <option value="5">Samedi</option>
          <option value="6">Dimanche</option>
        </select>
      </label>
      <label>
        Tâche / Poste
        <select id="event-title" required>
          <option value="Caisse">Caisse</option>
          <option value="Panier">Panier</option>
          <option value="Roller">Roller</option>
          <option value="Cadie">Cadie</option>
          <option value="Accueil">Accueil</option>
        </select>
      </label>
      <div class="split-inputs">
        <label>
          Début
          <input id="event-start" type="time" required />
        </label>
        <label>
          Fin
          <input id="event-end" type="time" required />
        </label>
      </div>
      <div class="edit-actions">
        <button type="submit" class="button primary">Ajouter</button>
        <button type="button" id="cancel-edit" class="button secondary">Annuler</button>
      </div>
      <input type="hidden" id="event-id" />
    </form>
  `;
  const eventForm = document.getElementById('event-form');
  const cancelEdit = document.getElementById('cancel-edit');
  eventForm.addEventListener('submit', handleEventSubmit);
  cancelEdit.addEventListener('click', resetEditForm);
}

async function handleEventSubmit(event) {
  event.preventDefault();
  const weekKey = getWeekKey(currentWeek);
  const dayIndex = parseInt(document.getElementById('event-day').value, 10);
  const title = document.getElementById('event-title').value.trim();
  const start = document.getElementById('event-start').value;
  const end = document.getElementById('event-end').value;
  const id = document.getElementById('event-id').value || generateId();
  if (!title || !start || !end || start >= end) {
    alert('Veuillez saisir une tâche valide et une plage horaire correcte.');
    return;
  }
  const newEvent = { id, dayIndex, title, start, end };
  await saveEvent(weekKey, authUser.id, newEvent);
  data = await loadData();
  editPanelOpen = false;
  resetEditForm();
  renderSchedule();
  renderSharedSchedule();
}

function showEditForm(eventId) {
  editPanelOpen = true;
  const weekKey = getWeekKey(currentWeek);
  const events = data[weekKey]?.[authUser.id] || [];
  const eventData = events.find(item => item.id === eventId);
  if (!eventData) return;
  renderSchedule();
  document.getElementById('event-day').value = eventData.dayIndex;
  document.getElementById('event-title').value = eventData.title;
  document.getElementById('event-start').value = eventData.start;
  document.getElementById('event-end').value = eventData.end;
  document.getElementById('event-id').value = eventData.id;
  const primaryBtn = document.querySelector('#event-form button.primary');
  if (primaryBtn) primaryBtn.textContent = 'Mettre à jour';
}

function resetEditForm() {
  const eventForm = document.getElementById('event-form');
  if (eventForm) eventForm.reset();
  const eventId = document.getElementById('event-id');
  if (eventId) eventId.value = '';
  editPanelOpen = false;
  renderSchedule();
}

async function deleteEvent(eventId) {
  if (!confirm('Supprimer cette plage horaire ?')) return;
  await removeEvent(eventId);
  data = await loadData();
  renderSchedule();
  renderSharedSchedule();
}

function renderSharedSchedule() {
  const weekDays = generateWeekDays(currentWeek);
  elements.sharedGrid.innerHTML = '';
  const weekKey = getWeekKey(currentWeek);
  const totalsByDay = Array(7).fill(0);
  const headerRow = document.createElement('div');
  headerRow.className = 'shared-row shared-header';
  const corner = document.createElement('div');
  corner.className = 'shared-corner';
  headerRow.appendChild(corner);
  weekDays.forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'shared-day-label';
    cell.innerHTML = `<strong>${day.label}</strong><span>${day.date}</span>`;
    headerRow.appendChild(cell);
  });
  elements.sharedGrid.appendChild(headerRow);
  profils.forEach(user => {
    const row = document.createElement('div');
    row.className = 'shared-row';
    const title = document.createElement('div');
    title.className = 'person-name';
    title.textContent = user.name;
    row.appendChild(title);
    const events = data[weekKey]?.[user.id] || [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const cell = document.createElement('div');
      cell.className = 'shared-cell';
      const dayEvents = events
        .filter(event => event.dayIndex === dayIndex)
        .sort((a, b) => a.start.localeCompare(b.start));
      if (!dayEvents.length) {
        cell.innerHTML = '<span style="color:#64748b;">Libre</span>';
      } else {
        totalsByDay[dayIndex] += 1;
        dayEvents.forEach(entry => {
          const entryEl = document.createElement('div');
          entryEl.className = 'shared-entry';
          entryEl.textContent = `${entry.start}-${entry.end} ${entry.title}`;
          cell.appendChild(entryEl);
        });
      }
      row.appendChild(cell);
    }
    elements.sharedGrid.appendChild(row);
  });
  elements.overlapSummary.innerHTML = `
    <p class="summary-caption">Employés actifs par jour</p>
    <div class="summary-chips">
      ${totalsByDay.map((count, index) => `<span class="summary-chip"><strong>${weekDays[index].label}</strong>${count}</span>`).join('')}
    </div>
  `;
}

// ============================================================
// CHAT (logique d'origine conservée)
// ============================================================

function toggleChat() {
  const nowHidden = elements.chatPanel.classList.toggle('hidden');
  document.body.classList.toggle('chat-open', !nowHidden);
  if (!nowHidden) {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const message = elements.chatInput.value.trim();
  if (!message) return;
  const author = authUser ? authUser.name : 'Invité';
  await sendMessage(author, message);
  elements.chatInput.value = '';
}

function renderChat() {
  elements.chatMessages.innerHTML = '';
  chatMessages.slice(-40).forEach(item => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    const author = document.createElement('strong');
    author.textContent = item.author;
    const text = document.createElement('p');
    text.className = 'chat-text';
    text.textContent = item.message;
    const stamp = document.createElement('small');
    stamp.className = 'chat-stamp';
    stamp.textContent = formatStamp(item.stamp);
    bubble.appendChild(author);
    bubble.appendChild(text);
    bubble.appendChild(stamp);
    elements.chatMessages.appendChild(bubble);
  });
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function formatStamp(iso) {
  const d = new Date(iso);
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return `${days[d.getDay()]} ${formatDate(d)} · ${formatTime(iso)}`;
}

// ============================================================
// SUPABASE : données (logique d'origine conservée)
// ============================================================

async function loadData() {
  const { data: rows, error } = await supabaseClient.from('events').select('*');
  if (error) { console.error(error); return {}; }
  const grouped = {};
  rows.forEach(row => {
    grouped[row.week_key] = grouped[row.week_key] || {};
    grouped[row.week_key][row.user_id] = grouped[row.week_key][row.user_id] || [];
    grouped[row.week_key][row.user_id].push({
      id: row.id,
      dayIndex: row.day_index,
      title: row.title,
      start: row.start_time,
      end: row.end_time
    });
  });
  return grouped;
}

async function saveEvent(weekKey, userId, event) {
  const { error } = await supabaseClient.from('events').upsert({
    id: event.id,
    week_key: weekKey,
    user_id: userId,
    day_index: event.dayIndex,
    title: event.title,
    start_time: event.start,
    end_time: event.end
  });
  if (error) console.error(error);
}

async function removeEvent(eventId) {
  const { error } = await supabaseClient.from('events').delete().eq('id', eventId);
  if (error) console.error(error);
}

async function loadChat() {
  // Purge des messages > 48h (la RLS n'autorise que ceux-là à la suppression)
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await supabaseClient.from('messages').delete().lt('created_at', cutoff);
  const { data: rows, error } = await supabaseClient
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) { console.error(error); return []; }
  return rows.map(row => ({ author: row.author, message: row.message, stamp: row.created_at }));
}

async function sendMessage(author, message) {
  const { error } = await supabaseClient.from('messages').insert({ author, message });
  if (error) console.error(error);
}


// ============================================================
// IMPORT PHOTO DU PLANNING (OCR Tesseract.js, gratuit, dans le navigateur)
// Photo du ticket papier -> lecture -> corrections auto -> vérification -> events
// ============================================================

let importResultat = null; // { periode, weekKey, jours: [{dayIndex, repos, creneaux:[{start,end,title}]}], alertes }

const CODES_POSTES = { CAI: 'Caisse', CAISSE: 'Caisse', PANIER: 'Panier', PANIERS: 'Panier', ACC: 'Accueil', ACCUEIL: 'Accueil', ROLLER: 'Roller', CADIE: 'Cadie' };
const JOURS_LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JOURS_NOMS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

async function analyserPhotoPlanning(event) {
  const fichier = event.target.files?.[0];
  event.target.value = '';
  if (!fichier) return;

  ouvrirImport('analyse');
  elements.importPreview.src = URL.createObjectURL(fichier);
  majProgression(0, 'Lecture des horaires…');

  try {
    const { data } = await Tesseract.recognize(fichier, 'fra', {
      logger: m => {
        if (m.status === 'recognizing text') {
          majProgression(Math.round(m.progress * 100), `Lecture des horaires… ${Math.round(m.progress * 100)}%`);
        } else if (m.status === 'loading language traineddata') {
          majProgression(0, 'Chargement du moteur de lecture…');
        }
      }
    });

    importResultat = parsePlanningOcr(data.text);
    if (!importResultat.jours.some(j => j.repos || j.creneaux.length)) {
      alert("Aucun horaire reconnu sur cette photo. Reprends-la bien à plat, avec un bon éclairage et le ticket entier dans le cadre.");
      fermerImport();
      return;
    }
    afficherVerification();
  } catch (err) {
    console.error('Import photo :', err);
    alert("L'analyse a échoué. Réessaie avec une autre photo.");
    fermerImport();
  }
}

function majProgression(pct, texte) {
  elements.importBarFill.style.width = `${pct}%`;
  elements.importProgressText.textContent = texte;
}

function ouvrirImport(etape) {
  elements.importModal.classList.remove('hidden');
  elements.importStepAnalyse.classList.toggle('hidden', etape !== 'analyse');
  elements.importStepVerif.classList.toggle('hidden', etape !== 'verif');
}

function fermerImport() {
  elements.importModal.classList.add('hidden');
  if (elements.importPreview.src) URL.revokeObjectURL(elements.importPreview.src);
  elements.importPreview.src = '';
  importResultat = null;
}

// ---------- Parseur du texte OCR ----------

function corrigerLigneOcr(ligne) {
  let l = ligne;
  l = l.replace(/^[\s"'`.,;:|_\-]+/, '');                    // ponctuation parasite en tête
  l = l.replace(/^[$5]\s+(\d{1,2}\b)/, 'S $1');             // $ ou 5 -> S (samedi)
  l = l.replace(/^0\s+(\d{1,2}\s+\d{1,2}[:h])/, 'D $1');   // 0 -> D (dimanche)
  l = l.replace(/(?<=\d)[Oo](?=[:h\d])/g, '0');              // O -> 0 dans les heures
  l = l.replace(/\b[lI](\d[:h]\d{2})/g, '1$1');             // l/I -> 1
  l = l.replace(/(\d{1,2})[hH](\d{2})/g, '$1:$2');           // 9h30 -> 9:30
  return l.trim();
}

function corrigerHeureOcr(hhmm) {
  let [h, m] = hhmm.split(':').map(Number);
  if (h > 23) {
    const dizaine = Math.floor(h / 10), unite = h % 10;
    h = (dizaine === 4 || dizaine === 7) ? 10 + unite : unite; // 44->14, 71->11, 99->9
  }
  if (m > 59) m = m % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parsePlanningOcr(texte) {
  const alertes = [];

  // Période "Du 06/07/2026 au 12/07/2026" -> semaine cible
  const mPeriode = texte.match(/[Dd]u\s+(\d{2})\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/);
  let lundiImport = null;
  if (mPeriode) {
    lundiImport = getMonday(new Date(`${mPeriode[3]}-${mPeriode[2]}-${mPeriode[1]}T00:00:00`));
  } else {
    lundiImport = currentWeek;
    alertes.push("Période introuvable sur la photo : import dans la semaine affichée actuellement.");
  }
  const weekKey = getWeekKey(lundiImport);

  const jours = [];
  const regexJour = /^([LMJVSD])\s+(\d{1,2})\s*(.*)$/;
  const regexCreneau = /(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*([A-ZÀ-Ü][A-ZÀ-Ü0-9]{1,15})?/g;

  let ordreM = 0; // pour distinguer mardi / mercredi si pas de dates fiables
  for (const brute of texte.split('\n')) {
    const ligne = corrigerLigneOcr(brute);
    const m = ligne.match(regexJour);
    if (!m) continue;

    const [, lettre, numeroJourStr, reste] = m;
    const numeroJour = parseInt(numeroJourStr, 10);

    // dayIndex : via la date si période connue, sinon via la lettre
    let dayIndex;
    if (mPeriode) {
      dayIndex = Math.round((numeroJour - lundiImport.getDate() + 31) % 31);
      if (dayIndex < 0 || dayIndex > 6) dayIndex = null;
    }
    if (dayIndex === null || dayIndex === undefined) {
      if (lettre === 'M') { dayIndex = ordreM === 0 ? 1 : 2; }
      else dayIndex = { L: 0, J: 3, V: 4, S: 5, D: 6 }[lettre];
    }
    if (lettre === 'M') ordreM += 1;
    if (dayIndex === undefined || dayIndex === null) continue;

    const jour = { dayIndex, repos: /repos|cp|congé/i.test(reste) && !/\d{1,2}:\d{2}/.test(reste), creneaux: [] };

    let c;
    while ((c = regexCreneau.exec(reste)) !== null) {
      const start = corrigerHeureOcr(c[1]);
      const end = corrigerHeureOcr(c[2]);
      const codeBrut = (c[3] || '').toUpperCase();
      const title = CODES_POSTES[codeBrut] || codeBrut || 'Caisse';
      if (c[1] !== start || c[2] !== end) {
        alertes.push(`${JOURS_NOMS[dayIndex]} : "${c[1]}-${c[2]}" corrigé en "${start}-${end}".`);
      }
      if (start >= end) {
        alertes.push(`${JOURS_NOMS[dayIndex]} : créneau ${start}-${end} incohérent, à corriger.`);
      }
      jour.creneaux.push({ start, end, title });
    }

    if (!jour.repos && jour.creneaux.length === 0) {
      alertes.push(`${JOURS_NOMS[dayIndex]} : aucun horaire lu, à compléter à la main si besoin.`);
    }
    jours.push(jour);
  }

  // Complète les jours manquants (affichés vides dans la vérification)
  for (let i = 0; i < 7; i += 1) {
    if (!jours.some(j => j.dayIndex === i)) jours.push({ dayIndex: i, repos: true, creneaux: [] });
  }
  jours.sort((a, b) => a.dayIndex - b.dayIndex);

  if (jours.filter(j => j.creneaux.length || j.repos).length < 7) {
    alertes.push('Certains jours n\u2019ont pas été reconnus : vérifie que rien ne manque.');
  }

  return { weekKey, lundiImport, jours, alertes };
}

// ---------- Écran de vérification ----------

function afficherVerification() {
  ouvrirImport('verif');
  const { lundiImport, alertes } = importResultat;
  const fin = new Date(lundiImport.getTime() + 6 * 24 * 60 * 60 * 1000);
  elements.importPeriode.textContent = `Semaine du ${formatDate(lundiImport)} au ${formatDate(fin)}`;

  elements.importAlertes.classList.toggle('hidden', alertes.length === 0);
  elements.importAlertes.innerHTML = '';
  alertes.forEach(a => {
    const p = document.createElement('p');
    p.textContent = `⚠️ ${a}`;
    elements.importAlertes.appendChild(p);
  });

  renderJoursImport();
}

function renderJoursImport() {
  elements.importJours.innerHTML = '';
  importResultat.jours.forEach(jour => {
    const bloc = document.createElement('div');
    bloc.className = 'import-jour';

    const entete = document.createElement('div');
    entete.className = 'import-jour-entete';
    const titre = document.createElement('strong');
    titre.textContent = JOURS_NOMS[jour.dayIndex];
    entete.appendChild(titre);
    bloc.appendChild(entete);

    if (jour.creneaux.length === 0) {
      const repos = document.createElement('p');
      repos.className = 'import-repos';
      repos.textContent = 'Repos';
      bloc.appendChild(repos);
    }

    jour.creneaux.forEach((creneau, iC) => {
      const ligne = document.createElement('div');
      ligne.className = 'import-creneau';

      const debut = document.createElement('input');
      debut.type = 'time';
      debut.value = creneau.start;
      debut.addEventListener('change', () => { creneau.start = debut.value; });

      const fleche = document.createElement('span');
      fleche.textContent = '→';

      const finInput = document.createElement('input');
      finInput.type = 'time';
      finInput.value = creneau.end;
      finInput.addEventListener('change', () => { creneau.end = finInput.value; });

      const poste = document.createElement('input');
      poste.type = 'text';
      poste.className = 'import-poste';
      poste.value = creneau.title;
      poste.placeholder = 'Poste';
      poste.addEventListener('change', () => { creneau.title = poste.value.trim() || 'Caisse'; });

      const suppr = document.createElement('button');
      suppr.type = 'button';
      suppr.className = 'import-suppr';
      suppr.textContent = '✕';
      suppr.setAttribute('aria-label', 'Supprimer ce créneau');
      suppr.addEventListener('click', () => {
        jour.creneaux.splice(iC, 1);
        renderJoursImport();
      });

      ligne.appendChild(debut);
      ligne.appendChild(fleche);
      ligne.appendChild(finInput);
      ligne.appendChild(poste);
      ligne.appendChild(suppr);
      bloc.appendChild(ligne);
    });

    const ajouter = document.createElement('button');
    ajouter.type = 'button';
    ajouter.className = 'import-ajouter';
    ajouter.textContent = '+ Ajouter un créneau';
    ajouter.addEventListener('click', () => {
      const dernier = jour.creneaux[jour.creneaux.length - 1];
      jour.creneaux.push({ start: dernier ? dernier.end : '09:00', end: dernier ? '19:00' : '12:00', title: 'Caisse' });
      renderJoursImport();
    });
    bloc.appendChild(ajouter);

    elements.importJours.appendChild(bloc);
  });
}

// ---------- Validation -> table events ----------

async function validerImport() {
  const { weekKey, lundiImport, jours } = importResultat;

  const invalides = jours.flatMap(j => j.creneaux.filter(c => !c.start || !c.end || c.start >= c.end));
  if (invalides.length > 0) {
    alert('Certains créneaux ont une fin avant le début : corrige-les avant de valider.');
    return;
  }

  elements.importValider.disabled = true;
  elements.importValider.textContent = 'Enregistrement…';

  try {
    // Remplace les créneaux existants de cette semaine
    const { error: errDelete } = await supabaseClient
      .from('events')
      .delete()
      .eq('user_id', authUser.id)
      .eq('week_key', weekKey);
    if (errDelete) throw errDelete;

    const lignes = jours.flatMap(jour =>
      jour.creneaux.map(c => ({
        id: generateId(),
        week_key: weekKey,
        user_id: authUser.id,
        day_index: jour.dayIndex,
        title: c.title,
        start_time: c.start,
        end_time: c.end
      }))
    );

    if (lignes.length > 0) {
      const { error: errInsert } = await supabaseClient.from('events').insert(lignes);
      if (errInsert) throw errInsert;
    }

    // Navigue vers la semaine importée et rafraîchit
    currentWeek = lundiImport;
    saveWeekStart(currentWeek);
    data = await loadData();
    fermerImport();
    renderWeek();
    renderSchedule();
    renderSharedSchedule();
  } catch (err) {
    console.error('Validation import :', err);
    alert("L'enregistrement a échoué. Vérifie ta connexion et réessaie.");
  } finally {
    elements.importValider.disabled = false;
    elements.importValider.textContent = 'Valider le planning';
  }
}

// ============================================================
// UTILITAIRES (logique d'origine conservée)
// ============================================================

function saveWeekStart(date) {
  localStorage.setItem('horaire-carrefour-week', date.toISOString());
}

function loadWeekStart() {
  const raw = localStorage.getItem('horaire-carrefour-week');
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed) ? null : parsed;
}

function generateWeekDays(monday) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(monday.getTime() + i * 24 * 60 * 60 * 1000);
    days.push({ label: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][i], date: formatDate(date) });
  }
  return days;
}

function getWeekKey(date) {
  return date.toISOString().split('T')[0];
}

function getMonday(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setDate(copy.getDate() - diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDate(date) {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function generateId() {
  return `evt_${Math.random().toString(36).slice(2, 10)}`;
}

initialize();
