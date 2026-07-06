const SUPABASE_URL = 'https://xbicuvlltztukvkibzxe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ikbc6Fwyajjn-o1SUTim5A_wcWCi52G';
const VAPID_PUBLIC_KEY = 'BI7D-mWAaeU3XGX227WG1XWBxQvlF1u91keFpBEpUIaIEkFqrg3bqNkPxdeuyQ4kEOzBPOmMIx4Ljexj4WCN2Xs';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const users = [
  { id: 'jimmy', name: 'Jimmy', password: '284', color: '#f97316' },
  { id: 'emma', name: 'Emma', password: '281', color: '#22c55e' },
  { id: 'celia', name: 'Célia', password: '282', color: '#38bdf8' },
  { id: 'maud', name: 'Maud', password: '283', color: '#a855f7' },
  { id: 'matty', name: 'Matty', password: '285', color: '#cc1414' }
];
const authStoreKey = 'horaire-carrefour-auth';
const today = new Date();
const mondayStart = getMonday(today);
let currentWeek = loadWeekStart() || mondayStart;
let authUser = null;
let selectedUserId = null;
let editPanelOpen = false;
let data = {};
let chatMessages = [];
const elements = {
  loginScreen: document.getElementById('login-screen'),
  appScreen: document.getElementById('app-screen'),
  loginForm: document.getElementById('login-form'),
  loginName: document.getElementById('login-name'),
  loginPassword: document.getElementById('login-password'),
  loginError: document.getElementById('login-error'),
  logoutButton: document.getElementById('logout-button'),
  welcomeText: document.getElementById('welcome-text'),
  weekLabel: document.getElementById('week-label'),
  prevWeek: document.getElementById('prev-week'),
  nextWeek: document.getElementById('next-week'),
  userList: document.getElementById('user-list'),
  scheduleTitle: document.getElementById('schedule-title'),
  userColorDot: document.getElementById('user-color-dot'),
  weekDays: document.getElementById('week-days'),
  scheduleGrid: document.getElementById('schedule-grid'),
  editPanel: document.getElementById('edit-panel'),
  toggleEditPanel: document.getElementById('toggle-edit-panel'),
  sharedGrid: document.getElementById('shared-grid'),
  overlapSummary: document.getElementById('overlap-summary'),
  chatToggle: document.getElementById('chat-toggle'),
  chatPanel: document.getElementById('chat-panel'),
  chatClose: document.getElementById('chat-close'),
  chatMessages: document.getElementById('chat-messages'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input')
};

async function initialize() {
  bindEvents();
  const storedAuth = localStorage.getItem(authStoreKey);
  if (storedAuth) {
    const saved = JSON.parse(storedAuth);
    authUser = users.find(user => user.id === saved.id) || null;
    selectedUserId = authUser?.id || null;
  }
  data = await loadData();
  chatMessages = await loadChat();
  if (authUser) {
    showApp();
  } else {
    showLogin();
  }
  setupRealtime();
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
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutButton.addEventListener('click', handleLogout);
  elements.prevWeek.addEventListener('click', () => changeWeek(-1));
  elements.nextWeek.addEventListener('click', () => changeWeek(1));
  elements.chatToggle.addEventListener('click', toggleChat);
  elements.chatClose.addEventListener('click', toggleChat);
  elements.chatForm.addEventListener('submit', handleChatSubmit);
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
function showLogin() {
  elements.loginScreen.classList.add('active');
  elements.appScreen.classList.remove('active');
  elements.loginError.classList.add('hidden');
}
function showApp() {
  elements.loginScreen.classList.remove('active');
  elements.appScreen.classList.add('active');
  elements.welcomeText.textContent = `Connecté en tant que ${authUser.name}`;
  selectedUserId = selectedUserId || authUser.id;
  renderUsers();
  renderWeek();
  renderSchedule();
  renderSharedSchedule();
  renderChat();
  setupPushNotifications();
}

async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
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
function handleLogin(event) {
  event.preventDefault();
  const name = elements.loginName.value.trim();
  const password = elements.loginPassword.value.trim();
  const user = users.find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!user || user.password !== password) {
    elements.loginError.textContent = 'Identifiant ou mot de passe invalide.';
    elements.loginError.classList.remove('hidden');
    return;
  }
  authUser = user;
  selectedUserId = user.id;
  localStorage.setItem(authStoreKey, JSON.stringify({ id: user.id }));
  showApp();
}
function handleLogout() {
  authUser = null;
  selectedUserId = null;
  localStorage.removeItem(authStoreKey);
  showLogin();
}
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
  users.forEach(user => {
    const item = document.createElement('li');
    item.className = `user-item${selectedUserId === user.id ? ' active' : ''}`;
    const title = document.createElement('span');
    title.innerHTML = `<strong>${user.name}</strong>`;
    const color = document.createElement('span');
    color.className = 'color-dot';
    color.style.backgroundColor = user.color;
    title.appendChild(color);
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
  const user = users.find(u => u.id === selectedUserId);
  if (!user) return;
  elements.scheduleTitle.textContent = `Emploi du temps de ${user.name}`;
  elements.userColorDot.style.backgroundColor = user.color;
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
        card.innerHTML = `
          <strong>${event.title}</strong>
          <div class="event-meta"><span>${event.start} - ${event.end}</span></div>
        `;
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
  } else {
    toggle.classList.add('hidden');
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
  // Ligne d'en-tête avec les jours
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
  users.forEach(user => {
    const row = document.createElement('div');
    row.className = 'shared-row';
    const title = document.createElement('div');
    title.className = 'person-name';
    title.textContent = user.name;
    title.style.border = `2px solid ${user.color}`;
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
          entryEl.style.background = `${user.color}33`;
          entryEl.style.border = `1px solid ${user.color}`;
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

// --- Supabase: emploi du temps ---
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

// --- Supabase: chat ---
async function loadChat() {
  // Suppression automatique des messages de plus de 48h
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
