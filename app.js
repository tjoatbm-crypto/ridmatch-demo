(function () {
  'use strict';

  const AUTH_STORAGE_KEY = 'ridematch_users';
  const CURRENT_USER_KEY = 'ridematch_current';

  const SUPABASE_URL = typeof window !== 'undefined' && window.RIDEMATCH_SUPABASE_URL;
  const SUPABASE_ANON_KEY = typeof window !== 'undefined' && window.RIDEMATCH_SUPABASE_ANON_KEY;
  const sb = SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase !== 'undefined'
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  function rowToEvent(r) {
    if (!r) return null;
    return { id: r.id, name: r.name, date: r.date, time: r.time || '', endTime: r.end_time || '', location: r.location || '' };
  }
  function rowToDriver(r) {
    if (!r) return null;
    return { id: r.id, name: r.name, phone: r.phone, eventId: r.event_id, seats: r.seats || 1, notes: r.notes || '', userId: r.user_id, createdAt: r.created_at };
  }
  function rowToStudent(r) {
    if (!r) return null;
    return { id: r.id, name: r.name, phone: r.phone, eventId: r.event_id, pickup: r.pickup || '', notes: r.notes || '', userId: r.user_id, createdAt: r.created_at };
  }
  function rowToMatch(r) {
    if (!r) return null;
    return { driverId: r.driver_id, studentId: r.student_id, eventId: r.event_id, status: r.status || 'pending' };
  }

  const state = {
    view: 'home', // 'home' | 'matches' | 'event' | 'myrides'
    selectedEventId: null,
    currentUser: null, // { id, email, name, phone, pickupLocation }
    users: [],       // { id, email, password, name, phone, pickupLocation } — password stored for demo only
    nextUserId: 1,
    authModal: null, // 'signin' | 'signup'
    events: [
      { id: 'e1', name: 'Spring Band Concert', date: '2025-03-15', time: '6:00 PM', location: 'Main Auditorium' },
      { id: 'e2', name: 'Science Fair', date: '2025-03-22', time: '2:00 PM', location: 'Gym & Cafeteria' },
      { id: 'e3', name: 'Field Day', date: '2025-04-05', time: '9:00 AM', location: 'Sports Field' },
      { id: 'e4', name: 'Parent-Teacher Night', date: '2025-04-12', time: '5:30 PM', location: 'Classrooms' },
    ],
    drivers: [],
    students: [],
    matches: [], // { driverId, studentId, eventId, status: 'pending'|'confirmed' }
    nextDriverId: 1,
    nextStudentId: 1,
    nextEventId: 5,
    pendingEvent: null,   // when adding event, if similar one found
    similarEventId: null,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1, // 1-12
  };

  function getEvent(id) {
    return state.events.find((e) => e.id === id) || null;
  }

  function getEventsForDate(dateStr) {
    const normalized = (dateStr || '').trim();
    return state.events.filter((e) => (e.date || '').trim() === normalized);
  }

  function getCalendarWeeks(year, month) {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const startDay = first.getDay();
    const daysInMonth = last.getDate();
    const weeks = [];
    let week = [];
    const pad = (n) => String(n).padStart(2, '0');
    for (let i = 0; i < startDay; i++) week.push({ dateStr: null, dayNum: null, isCurrentMonth: false, events: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad(month)}-${pad(d)}`;
      week.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        events: getEventsForDate(dateStr),
      });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push({ dateStr: null, dayNum: null, isCurrentMonth: false, events: [] });
      weeks.push(week);
    }
    return weeks;
  }

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const TIME_OPTIONS = (function () {
    const opts = [];
    for (const period of ['AM', 'PM']) {
      for (const h of [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
        opts.push(`${h}:00 ${period}`, `${h}:30 ${period}`);
      }
    }
    return opts;
  })();

  function formatTimeString(str) {
    if (!str || typeof str !== 'string') return '';
    const s = str.trim().replace(/\s+/g, ' ').trim();
    const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?$/i);
    if (!match) return s;
    const hour = parseInt(match[1], 10);
    const min = (match[2] !== undefined && match[2] !== '') ? match[2] : '00';
    const period = (match[3] || '').toUpperCase();
    if (period !== 'AM' && period !== 'PM') return s;
    const h = hour > 12 ? hour % 12 : hour === 0 ? 12 : hour;
    return `${h}:${min.length === 1 ? '0' + min : min} ${period}`;
  }

  function filterTimeOptions(prefix) {
    const p = (prefix || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!p) return TIME_OPTIONS.slice(0, 12);
    return TIME_OPTIONS.filter((opt) => opt.toLowerCase().replace(/\s+/g, ' ').startsWith(p) || opt.toLowerCase().replace(/\s+/g, ' ').includes(p));
  }

  function formatPhone(value) {
    const digits = (value || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function initPhoneInputs(root) {
    root.querySelectorAll('input[type="tel"], input[name="phone"]').forEach((input) => {
      const format = () => {
        const oldVal = input.value;
        const formatted = formatPhone(oldVal);
        if (formatted === oldVal) return;
        input.value = formatted;
        input.setSelectionRange(formatted.length, formatted.length);
      };
      if (input.value) {
        const formatted = formatPhone(input.value);
        if (formatted !== input.value) input.value = formatted;
      }
      input.addEventListener('input', format);
      input.addEventListener('paste', (ev) => {
        ev.preventDefault();
        const pasted = (ev.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 10);
        input.value = formatPhone(pasted);
        input.setSelectionRange(input.value.length, input.value.length);
      });
    });
  }

  function loadAuthLocal() {
    try {
      const usersJson = localStorage.getItem(AUTH_STORAGE_KEY);
      const currentId = localStorage.getItem(CURRENT_USER_KEY);
      if (usersJson) {
        const parsed = JSON.parse(usersJson);
        state.users = Array.isArray(parsed) ? parsed : [];
        state.nextUserId = 1;
        state.users.forEach((u) => {
          const n = parseInt(String(u.id).replace(/^u/, ''), 10);
          if (!isNaN(n)) state.nextUserId = Math.max(state.nextUserId, n + 1);
        });
      }
      if (currentId && state.users.length) {
        const u = state.users.find((x) => x.id === currentId);
        if (u) state.currentUser = { id: u.id, email: u.email, name: u.name || '', phone: u.phone || '', pickupLocation: u.pickupLocation || '' };
      }
    } catch (_) {}
  }

  function saveAuthLocal() {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state.users));
      localStorage.setItem(CURRENT_USER_KEY, state.currentUser ? state.currentUser.id : '');
    } catch (_) {}
  }

  async function initAuth() {
    if (sb) {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        const { data: profile } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
          state.currentUser = {
            id: profile.id,
            email: profile.email || session.user.email,
            name: profile.name || '',
            phone: profile.phone || '',
            pickupLocation: profile.pickup_location || '',
          };
        } else {
          state.currentUser = { id: session.user.id, email: session.user.email || '', name: '', phone: '', pickupLocation: '' };
        }
      }
      return;
    }
    loadAuthLocal();
  }

  async function loadFromSupabase() {
    if (!sb) return;
    try {
      const [eventsRes, driversRes, studentsRes, matchesRes] = await Promise.all([
        sb.from('events').select('*').order('created_at', { ascending: true }),
        sb.from('drivers').select('*').order('created_at', { ascending: true }),
        sb.from('students').select('*').order('created_at', { ascending: true }),
        sb.from('matches').select('*').order('created_at', { ascending: true }),
      ]);
      if (eventsRes.data) state.events = eventsRes.data.map(rowToEvent).filter(Boolean);
      if (driversRes.data) state.drivers = driversRes.data.map(rowToDriver).filter(Boolean);
      if (studentsRes.data) state.students = studentsRes.data.map(rowToStudent).filter(Boolean);
      if (matchesRes.data) state.matches = matchesRes.data.map(rowToMatch).filter(Boolean);
    } catch (_) {
      console.warn('RideMatch: Could not load from Supabase (check setup).');
    }
  }

  function signIn(email, password) {
    if (sb) return null;
    const u = state.users.find((x) => x.email.toLowerCase() === (email || '').trim().toLowerCase() && x.password === password);
    if (!u) return false;
    state.currentUser = { id: u.id, email: u.email, name: u.name || '', phone: u.phone || '', pickupLocation: u.pickupLocation || '' };
    saveAuthLocal();
    return true;
  }

  async function signInSupabase(email, password) {
    if (!sb) return false;
    const { data, error } = await sb.auth.signInWithPassword({ email: (email || '').trim().toLowerCase(), password: password || '' });
    if (error) return false;
    const { data: profile } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
    state.currentUser = {
      id: data.user.id,
      email: profile?.email || data.user.email,
      name: profile?.name || '',
      phone: profile?.phone || '',
      pickupLocation: profile?.pickup_location || '',
    };
    return true;
  }

  function signUp(data) {
    if (sb) return null;
    const email = (data.email || '').trim().toLowerCase();
    if (!email) return null;
    if (state.users.some((x) => x.email.toLowerCase() === email)) return null;
    const id = 'u' + state.nextUserId++;
    const user = { id, email, password: data.password || '', name: (data.name || '').trim(), phone: (data.phone || '').trim(), pickupLocation: (data.pickupLocation || '').trim() };
    state.users.push(user);
    saveAuthLocal();
    signIn(user.email, user.password);
    return state.currentUser;
  }

  async function signUpSupabase(data) {
    if (!sb) return null;
    const email = (data.email || '').trim().toLowerCase();
    if (!email) return null;
    const { data: authData, error } = await sb.auth.signUp({
      email,
      password: data.password || '',
      options: {
        data: { name: (data.name || '').trim(), phone: (data.phone || '').trim(), pickup_location: (data.pickupLocation || '').trim() },
      },
    });
    if (error) return null;
    if (authData.user) {
      const { data: profile } = await sb.from('profiles').select('*').eq('id', authData.user.id).single();
      state.currentUser = {
        id: authData.user.id,
        email: profile?.email || authData.user.email,
        name: profile?.name || '',
        phone: profile?.phone || '',
        pickupLocation: profile?.pickup_location || '',
      };
    }
    return state.currentUser;
  }

  function signOut() {
    state.currentUser = null;
    state.authModal = null;
    if (state.view === 'myrides' || state.view === 'matches') state.view = 'home';
    if (sb) sb.auth.signOut();
    else saveAuthLocal();
  }

  function getDriver(id) {
    return state.drivers.find((d) => d.id === id) || null;
  }

  function getStudent(id) {
    return state.students.find((s) => s.id === id) || null;
  }

  function addDriverLocal(data) {
    const driver = {
      id: 'd' + state.nextDriverId++,
      name: data.name,
      phone: data.phone,
      eventId: data.eventId,
      seats: parseInt(data.seats, 10) || 1,
      notes: data.notes || '',
      userId: data.userId || null,
      createdAt: new Date().toISOString(),
    };
    state.drivers.push(driver);
    return driver;
  }

  async function addDriver(data) {
    if (sb) {
      const { data: row, error } = await sb.from('drivers').insert({
        user_id: data.userId || null,
        event_id: data.eventId,
        name: data.name,
        phone: data.phone,
        seats: parseInt(data.seats, 10) || 1,
        notes: data.notes || '',
      }).select('*').single();
      if (error) return null;
      const driver = rowToDriver(row);
      if (driver) state.drivers.push(driver);
      return driver;
    }
    return addDriverLocal(data);
  }

  function normalizeForCompare(str) {
    return (str || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function findSimilarEvent(data) {
    const date = (data.date || '').trim();
    const name = normalizeForCompare(data.name);
    const time = normalizeForCompare(data.time);
    const endTime = normalizeForCompare(data.endTime);
    const location = normalizeForCompare(data.location);
    if (!date) return null;
    return state.events.find((e) => {
      if ((e.date || '').trim() !== date) return false;
      const eName = normalizeForCompare(e.name);
      const eTime = normalizeForCompare(e.time);
      const eEnd = normalizeForCompare(e.endTime);
      const eLoc = normalizeForCompare(e.location);
      const nameSimilar = name && eName && (eName === name || eName.includes(name) || name.includes(eName));
      const timeSimilar = (!time && !eTime) || time === eTime;
      const endTimeSimilar = (!endTime && !eEnd) || endTime === eEnd;
      const locationSimilar = (!location && !eLoc) || eLoc === location || (eLoc && location && (eLoc.includes(location) || location.includes(eLoc)));
      return nameSimilar || (timeSimilar && (endTimeSimilar || !endTime) && (locationSimilar || !location));
    }) || null;
  }

  function addEventLocal(data) {
    const event = {
      id: 'e' + state.nextEventId++,
      name: data.name.trim(),
      date: data.date || '',
      time: data.time || '',
      endTime: data.endTime || '',
      location: data.location.trim() || '',
    };
    state.events.push(event);
    return event;
  }

  async function addEvent(data) {
    if (sb) {
      const { data: row, error } = await sb.from('events').insert({
        name: data.name.trim(),
        date: data.date || '',
        time: data.time || '',
        end_time: data.endTime || '',
        location: (data.location || '').trim(),
      }).select('*').single();
      if (error) return null;
      const event = rowToEvent(row);
      if (event) state.events.push(event);
      return event;
    }
    return addEventLocal(data);
  }

  function addStudentLocal(data) {
    const student = {
      id: 's' + state.nextStudentId++,
      name: data.name,
      phone: data.phone,
      eventId: data.eventId,
      pickup: data.pickup || '',
      notes: data.notes || '',
      userId: data.userId || null,
      createdAt: new Date().toISOString(),
    };
    state.students.push(student);
    return student;
  }

  async function addStudent(data) {
    if (sb) {
      const { data: row, error } = await sb.from('students').insert({
        user_id: data.userId || null,
        event_id: data.eventId,
        name: data.name,
        phone: data.phone,
        pickup: data.pickup || '',
        notes: data.notes || '',
      }).select('*').single();
      if (error) return null;
      const student = rowToStudent(row);
      if (student) state.students.push(student);
      return student;
    }
    return addStudentLocal(data);
  }

  function createMatchLocal(driverId, studentId, eventId) {
    const existing = state.matches.some(
      (m) => m.driverId === driverId && m.studentId === studentId && m.eventId === eventId
    );
    if (existing) return null;
    const match = { driverId, studentId, eventId, status: 'pending' };
    state.matches.push(match);
    return match;
  }

  async function createMatch(driverId, studentId, eventId) {
    if (sb) {
      const { data: row, error } = await sb.from('matches').insert({
        driver_id: driverId,
        student_id: studentId,
        event_id: eventId,
        status: 'pending',
      }).select('*').single();
      if (error) return null;
      const match = rowToMatch(row);
      if (match) state.matches.push(match);
      return match;
    }
    return createMatchLocal(driverId, studentId, eventId);
  }

  function confirmMatch(driverId, studentId, eventId) {
    const m = state.matches.find(
      (x) => x.driverId === driverId && x.studentId === studentId && x.eventId === eventId
    );
    if (m) m.status = 'confirmed';
  }

  function getMatchesForEvent(eventId) {
    return state.matches.filter((m) => m.eventId === eventId);
  }

  function getAvailableSeats(driver) {
    const used = state.matches.filter(
      (m) => m.driverId === driver.id && m.eventId === driver.eventId && m.status !== 'cancelled'
    ).length;
    return Math.max(0, driver.seats - used);
  }

  function render() {
    const root = document.getElementById('root');
    if (!root) return;

    if (state.view === 'matches' && !state.currentUser) state.view = 'home';

    root.innerHTML = `
      <div class="app">
        <header class="header">
          <div class="logo">Ride<span>Match</span></div>
          <nav class="nav">
            <button class="nav-btn ${state.view === 'home' ? 'active' : ''}" data-view="home">Home</button>
            ${state.currentUser ? `<button class="nav-btn ${state.view === 'matches' ? 'active' : ''}" data-view="matches">Matches</button>` : ''}
            ${state.currentUser ? `<button class="nav-btn ${state.view === 'myrides' ? 'active' : ''}" data-view="myrides">My rides</button>` : ''}
            ${state.currentUser
              ? `<span class="header-user">${escapeHtml(state.currentUser.name || state.currentUser.email)}</span><button type="button" class="btn btn-outline btn-sm header-signout">Sign out</button>`
              : '<button type="button" class="btn btn-outline btn-sm" id="header-signin">Sign in</button><button type="button" class="btn btn-primary btn-sm" id="header-signup">Sign up</button>'}
          </nav>
        </header>

        <main class="main">
          ${state.view === 'home' ? renderHome() : state.view === 'event' ? renderEvent(state.selectedEventId) : state.view === 'myrides' ? renderMyRides() : renderMatches()}
        </main>

        <footer class="footer">
          RideMatch — Connecting drivers with students for school events. Safe, simple, community-driven.
        </footer>

        ${state.authModal ? renderAuthModal() : ''}
      </div>
    `;

    root.querySelectorAll('.nav-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.view = btn.getAttribute('data-view');
        state.selectedEventId = null;
        render();
      });
    });

    const signinBtn = root.querySelector('#header-signin');
    if (signinBtn) signinBtn.addEventListener('click', () => { state.authModal = 'signin'; render(); });
    const signupBtn = root.querySelector('#header-signup');
    if (signupBtn) signupBtn.addEventListener('click', () => { state.authModal = 'signup'; render(); });
    const signoutBtn = root.querySelector('.header-signout');
    if (signoutBtn) signoutBtn.addEventListener('click', () => { signOut(); render(); });

    if (state.authModal) attachAuthModalListeners(root);

    if (state.view === 'home') {
      attachHomeListeners(root);
    } else if (state.view === 'event') {
      attachEventListeners(root);
    } else if (state.view === 'myrides') {
      // no extra listeners
    } else {
      attachMatchesListeners(root);
    }
    initPhoneInputs(root);
  }

  function attachAuthModalListeners(root) {
    const overlay = root.querySelector('#auth-modal-overlay');
    const closeBtn = root.querySelector('#auth-modal-close');
    const switchBtn = root.querySelector('#auth-switch-mode');
    const form = root.querySelector('#auth-form');
    if (overlay) {
      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) { state.authModal = null; render(); }
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', () => { state.authModal = null; render(); });
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        state.authModal = state.authModal === 'signin' ? 'signup' : 'signin';
        render();
      });
    }
    if (form) {
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const data = Object.fromEntries(fd);
        (async () => {
          if (state.authModal === 'signin') {
            const ok = sb ? await signInSupabase(data.email, data.password) : signIn(data.email, data.password);
            if (ok) {
              state.authModal = null;
              render();
            } else {
              form.querySelector('[name="password"]').value = '';
              form.querySelector('[name="password"]').focus();
            }
          } else {
            const user = sb ? await signUpSupabase(data) : signUp(data);
            if (user) {
              state.authModal = null;
              render();
            } else {
              form.querySelector('[name="email"]').focus();
            }
          }
        })();
      });
    }
  }

  function renderHome() {
    return `
      <div class="hero">
        <h1>Get to school events together</h1>
        <p>Drivers offer rides. Students request rides. We match them by event.</p>
      </div>

      <section class="section">
        <h2 class="section-title">Upcoming events <span class="badge">${state.events.length}</span></h2>
        <p class="section-desc">Click an event on the calendar or in the list to offer a ride or request one.</p>
        <div class="calendar-and-list">
          <div class="calendar-wrap">
          <div class="calendar-nav">
            <button type="button" class="btn btn-outline calendar-prev" aria-label="Previous month">← Prev</button>
            <h3 class="calendar-title">${MONTH_NAMES[state.calendarMonth - 1]} ${state.calendarYear}</h3>
            <button type="button" class="btn btn-outline calendar-next" aria-label="Next month">Next →</button>
          </div>
          <div class="calendar">
            <div class="calendar-weekhead">
              ${DAY_NAMES.map((d) => `<span class="calendar-weekday">${d}</span>`).join('')}
            </div>
            ${getCalendarWeeks(state.calendarYear, state.calendarMonth)
              .map(
                (week) => `
              <div class="calendar-week">
                ${week
                  .map(
                    (day) => `
                  <div class="calendar-day ${day.isCurrentMonth ? '' : 'calendar-day-other'}">
                    ${day.dayNum != null ? `<span class="calendar-day-num">${day.dayNum}</span>` : ''}
                    <div class="calendar-day-events">
                      ${(day.events || [])
                        .map(
                          (e) => `
                        <button type="button" class="calendar-event" data-event-id="${e.id}">${escapeHtml(e.name)}</button>
                      `
                        )
                        .join('')}
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
              )
              .join('')}
          </div>
        </div>
          <aside class="event-list-sidebar">
            <h3 class="event-list-title">Event list</h3>
            <p class="event-list-desc">All events by date</p>
            <ul class="event-list">
              ${state.events.length === 0
                ? '<li class="event-list-empty">No events yet. Add one below.</li>'
                : state.events
                    .slice()
                    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                    .map(
                      (e) => `
                <li>
                  <button type="button" class="calendar-event event-list-item" data-event-id="${e.id}">
                    <span class="event-list-name">${escapeHtml(e.name)}</span>
                    <span class="event-list-meta">${e.date}${e.time ? ' · ' + escapeHtml(e.time) + (e.endTime ? ' – ' + escapeHtml(e.endTime) : '') : ''}</span>
                  </button>
                </li>
              `
                    )
                    .join('')}
            </ul>
          </aside>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Add an event</h2>
        <div class="panel panel-event">
          <form id="form-event" class="event-form">
            <div class="form-row">
              <div class="form-group">
                <label>Event name</label>
                <input type="text" name="name" placeholder="e.g. Spring Band Concert" required />
              </div>
              <div class="form-group">
                <label>Date</label>
                <input type="date" name="date" required />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Start time</label>
                <input type="text" name="time" placeholder="e.g. 6:00 PM" />
              </div>
              <div class="form-group">
                <label>End time</label>
                <input type="text" name="endTime" placeholder="e.g. 8:00 PM" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Location</label>
                <input type="text" name="location" placeholder="e.g. Main Auditorium" />
              </div>
            </div>
            <button type="submit" class="btn btn-primary">Add event</button>
          </form>
        </div>
        ${state.pendingEvent && state.similarEventId ? (() => {
          const existing = getEvent(state.similarEventId);
          if (!existing) return '';
          return `
            <div class="duplicate-prompt panel" id="duplicate-prompt">
              <p class="duplicate-prompt-text">An event like this already exists. Did you mean this one?</p>
              <div class="duplicate-prompt-event">
                <strong>${escapeHtml(existing.name)}</strong>
                <span class="meta">${existing.date}${existing.time ? ' · ' + escapeHtml(existing.time) + (existing.endTime ? ' – ' + escapeHtml(existing.endTime) : '') : ''}</span>
                ${existing.location ? `<span class="meta">${escapeHtml(existing.location)}</span>` : ''}
              </div>
              <div class="duplicate-prompt-actions">
                <button type="button" class="btn btn-primary" id="use-existing-event">Yes, that's the one</button>
                <button type="button" class="btn btn-outline" id="add-new-event">No, add as new event</button>
              </div>
            </div>
          `;
        })() : ''}
      </section>
    `;
  }

  function renderMatches() {
    if (!state.currentUser) {
      return `
        <div class="hero">
          <h1>Matches</h1>
          <p>Sign in to view and manage your matches.</p>
        </div>
      `;
    }

    const uid = state.currentUser.id;
    const myDrivers = state.drivers.filter((d) => d.userId === uid);
    const myStudents = state.students.filter((s) => s.userId === uid);
    const eventIdsWithMine = new Set([...myDrivers.map((d) => d.eventId), ...myStudents.map((s) => s.eventId)]);
    const eventsToShow = state.events.filter((e) => eventIdsWithMine.has(e.id));

    const byEvent = {};
    state.events.forEach((e) => {
      byEvent[e.id] = { event: e, drivers: [], students: [], matches: [] };
    });
    state.drivers.forEach((d) => {
      if (byEvent[d.eventId]) byEvent[d.eventId].drivers.push(d);
    });
    state.students.forEach((s) => {
      if (byEvent[s.eventId]) byEvent[s.eventId].students.push(s);
    });
    state.matches.forEach((m) => {
      if (byEvent[m.eventId]) byEvent[m.eventId].matches.push(m);
    });

    let html = `
      <div class="hero">
        <h1>Your matches</h1>
        <p>Manage your ride offers and requests. Only your matches and pending match options are shown.</p>
      </div>
    `;

    if (eventsToShow.length === 0) {
      html += `
        <div class="empty-state">
          <p>You don't have any ride offers or requests yet.</p>
          <p>Click an event on the home page to offer a ride or request one, then return here to match.</p>
        </div>
      `;
      return html;
    }

    eventsToShow.forEach((e) => {
      const data = byEvent[e.id];
      const driversWithSeats = data.drivers.filter((d) => getAvailableSeats(d) > 0);
      const unmatchedStudents = data.students.filter((s) => !data.matches.some((m) => m.studentId === s.id));

      const myDriversHere = myDrivers.filter((d) => d.eventId === e.id);
      const myStudentsHere = myStudents.filter((s) => s.eventId === e.id);

      html += `
        <section class="section">
          <h2 class="section-title">${escapeHtml(e.name)} <span class="badge">${e.date}</span></h2>
          <div class="match-cards">
            ${myDriversHere.map((d) => {
              const seats = getAvailableSeats(d);
              const matchedStudents = data.matches.filter((m) => m.driverId === d.id).map((m) => getStudent(m.studentId)).filter(Boolean);
              return `
                <div class="match-card">
                  <div class="left">
                    <h4>You (driver) · ${seats} seat${seats !== 1 ? 's' : ''} left</h4>
                    <div class="detail">${escapeHtml(d.notes || 'No notes')}</div>
                    ${matchedStudents.length ? `<div class="detail">Matched: ${matchedStudents.map((s) => escapeHtml(s.name)).join(', ')}</div>` : ''}
                  </div>
                  <div class="right">
                    <span class="tag driver">Your offer</span>
                    ${unmatchedStudents
                      .map(
                        (s) => `
                      <span class="tag student">${escapeHtml(s.name)}</span>
                      <button type="button" class="action match-pair" data-driver-id="${d.id}" data-student-id="${s.id}" data-event-id="${e.id}">Match</button>
                    `
                      )
                      .join('')}
                    ${unmatchedStudents.length === 0 ? '<span class="detail">No pending students to match</span>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
            ${myStudentsHere.map((s) => {
              const myMatch = data.matches.find((m) => m.studentId === s.id);
              const matchedDriver = myMatch ? getDriver(myMatch.driverId) : null;
              return `
                <div class="match-card">
                  <div class="left">
                    <h4>You need a ride</h4>
                    <div class="detail">${escapeHtml(s.pickup || 'No pickup specified')} ${s.notes ? ' · ' + escapeHtml(s.notes) : ''}</div>
                    ${matchedDriver ? `<div class="detail">Matched with: ${escapeHtml(matchedDriver.name)}</div>` : ''}
                  </div>
                  <div class="right">
                    <span class="tag student">Your request</span>
                    ${!matchedDriver ? driversWithSeats
                      .map(
                        (d) => `<button type="button" class="action match-pair" data-driver-id="${d.id}" data-student-id="${s.id}" data-event-id="${e.id}">Match with ${escapeHtml(d.name)}</button>`
                      )
                      .join(' ') : ''}
                    ${!matchedDriver && driversWithSeats.length === 0 ? '<span class="detail">No drivers with seats yet</span>' : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    });

    return html;
  }

  function renderAuthModal() {
    const isSignup = state.authModal === 'signup';
    return `
      <div class="modal-overlay" id="auth-modal-overlay">
        <div class="modal auth-modal">
          <div class="modal-header">
            <h2>${isSignup ? 'Sign up' : 'Sign in'}</h2>
            <button type="button" class="modal-close" id="auth-modal-close" aria-label="Close">&times;</button>
          </div>
          <form id="auth-form" class="auth-form">
            <div class="form-group">
              <label>Email</label>
              <input type="email" name="email" placeholder="you@example.com" required autocomplete="email" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" placeholder="••••••••" required autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
            </div>
            ${isSignup ? `
            <div class="form-group">
              <label>Name</label>
              <input type="text" name="name" placeholder="Your name" autocomplete="name" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input type="tel" name="phone" placeholder="(555) 123-4567" autocomplete="tel" />
            </div>
            <div class="form-group">
              <label>Default pickup location</label>
              <input type="text" name="pickupLocation" placeholder="e.g. Oak Street & 5th" autocomplete="off" />
            </div>
            ` : ''}
            <div class="auth-form-actions">
              <button type="submit" class="btn btn-primary">${isSignup ? 'Create account' : 'Sign in'}</button>
              <button type="button" class="btn btn-outline" id="auth-switch-mode">${isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderMyRides() {
    const uid = state.currentUser && state.currentUser.id;
    if (!uid) {
      return `
        <div class="hero">
          <h1>My rides</h1>
          <p>Sign in to see your ride offers and requests.</p>
        </div>
      `;
    }
    const myDrivers = state.drivers.filter((d) => d.userId === uid);
    const myStudents = state.students.filter((s) => s.userId === uid);
    const myDriverMatches = state.matches.filter((m) => myDrivers.some((d) => d.id === m.driverId));
    const myStudentMatches = state.matches.filter((m) => myStudents.some((s) => s.id === m.studentId));
    return `
      <div class="hero">
        <h1>My rides</h1>
        <p>Your ride offers and requests. Only you can see this page.</p>
      </div>
      <section class="section">
        <h2 class="section-title">Rides I'm offering</h2>
        ${myDrivers.length === 0 ? '<div class="empty-state"><p>You haven\'t offered any rides yet. Click an event on the home page to offer one.</p></div>' : `
        <div class="match-cards">
          ${myDrivers.map((d) => {
            const ev = getEvent(d.eventId);
            const matched = myDriverMatches.filter((m) => m.driverId === d.id).map((m) => getStudent(m.studentId)).filter(Boolean);
            return `
              <div class="match-card">
                <div class="left">
                  <h4>${escapeHtml(ev ? ev.name : 'Event')} · ${getAvailableSeats(d)} seat${getAvailableSeats(d) !== 1 ? 's' : ''} left</h4>
                  <div class="detail">${matched.length ? 'Matched with: ' + matched.map((s) => escapeHtml(s.name)).join(', ') : 'No matches yet'}</div>
                </div>
                <div class="right">
                  <span class="tag driver">Driver</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        `}
      </section>
      <section class="section">
        <h2 class="section-title">Rides I need</h2>
        ${myStudents.length === 0 ? '<div class="empty-state"><p>You haven\'t requested any rides yet. Click an event on the home page to request one.</p></div>' : `
        <div class="match-cards">
          ${myStudents.map((s) => {
            const ev = getEvent(s.eventId);
            const match = state.matches.find((m) => m.studentId === s.id);
            const driver = match ? getDriver(match.driverId) : null;
            return `
              <div class="match-card">
                <div class="left">
                  <h4>${escapeHtml(ev ? ev.name : 'Event')}</h4>
                  <div class="detail">${driver ? 'Matched with driver: ' + escapeHtml(driver.name) : 'Waiting for a match'}</div>
                </div>
                <div class="right">
                  <span class="tag student">Student</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        `}
      </section>
    `;
  }

  function renderEvent(eventId) {
    const event = getEvent(eventId);
    if (!event) {
      return `
        <div class="event-detail">
          <a href="#" class="back-link" data-back="home">← Back to events</a>
          <div class="empty-state">
            <p>Event not found.</p>
          </div>
        </div>
      `;
    }
    const eventDrivers = state.drivers.filter((d) => d.eventId === eventId);
    const eventStudents = state.students.filter((s) => s.eventId === eventId);
    return `
      <div class="event-detail">
        <a href="#" class="back-link" data-back="home">← Back to events</a>
        <div class="event-hero">
          <h1>${escapeHtml(event.name)}</h1>
          <div class="event-meta">
            <span>${event.date}</span>
            ${event.time ? `<span>${escapeHtml(event.time)}${event.endTime ? ' – ' + escapeHtml(event.endTime) : ''}</span>` : ''}
            ${event.location ? `<span>${escapeHtml(event.location)}</span>` : ''}
          </div>
        </div>

        <section class="section">
          <h2 class="section-title">Offer or request a ride</h2>
          ${state.currentUser
            ? `
          <p class="section-desc">Sign up as a driver or request a ride for this event.</p>
          <div class="form-grid">
            <div class="panel driver">
              <h3>I'm a driver</h3>
              <form id="form-driver" class="driver-form">
                <input type="hidden" name="eventId" value="${escapeHtml(event.id)}" />
                <div class="form-group">
                  <label>Your name</label>
                  <input type="text" name="name" placeholder="e.g. Jane Smith" value="${escapeHtml(state.currentUser.name)}" required />
                </div>
                <div class="form-group">
                  <label>Phone</label>
                  <input type="tel" name="phone" placeholder="(555) 123-4567" value="${escapeHtml(state.currentUser.phone)}" required />
                </div>
                <div class="form-group">
                  <label>Seats available</label>
                  <input type="number" name="seats" min="1" max="8" value="3" required />
                </div>
                <div class="form-group">
                  <label>Notes (optional)</label>
                  <input type="text" name="notes" placeholder="e.g. Pick up at North lot" />
                </div>
                <button type="submit" class="btn btn-driver">Offer ride</button>
              </form>
            </div>
            <div class="panel student">
              <h3>I need a ride</h3>
              <form id="form-student" class="student-form">
                <input type="hidden" name="eventId" value="${escapeHtml(event.id)}" />
                <div class="form-group">
                  <label>Student / guardian name</label>
                  <input type="text" name="name" placeholder="e.g. Alex Johnson" value="${escapeHtml(state.currentUser.name)}" required />
                </div>
                <div class="form-group">
                  <label>Phone</label>
                  <input type="tel" name="phone" placeholder="(555) 987-6543" value="${escapeHtml(state.currentUser.phone)}" required />
                </div>
                <div class="form-group">
                  <label>Pickup location</label>
                  <input type="text" name="pickup" placeholder="e.g. Oak Street & 5th" value="${escapeHtml(state.currentUser.pickupLocation || '')}" required />
                </div>
                <div class="form-group">
                  <label>Notes (optional)</label>
                  <input type="text" name="notes" placeholder="Any special needs" />
                </div>
                <button type="submit" class="btn btn-student">Request ride</button>
              </form>
            </div>
          </div>
          `
            : `
          <p class="section-desc">You need to sign in to offer a ride or request one for this event.</p>
          <div class="event-signin-required">
            <p>Sign in or create an account to continue.</p>
            <div class="event-signin-actions">
              <button type="button" class="btn btn-primary" id="event-page-signin">Sign in</button>
              <button type="button" class="btn btn-outline" id="event-page-signup">Sign up</button>
            </div>
          </div>
          `}
        </section>

        <section class="section">
          <h2 class="section-title">Signed up for this event <span class="badge">${eventDrivers.length} drivers · ${eventStudents.length} students</span></h2>
          ${eventDrivers.length === 0 && eventStudents.length === 0
            ? '<div class="empty-state"><p>No drivers or students signed up yet. Be the first!</p></div>'
            : `
            <div class="event-signups">
              ${eventDrivers.length > 0 ? `
                <div class="signup-list">
                  <h4>Drivers</h4>
                  <ul>${eventDrivers.map((d) => `<li>${escapeHtml(d.name)} · ${getAvailableSeats(d)} seat${getAvailableSeats(d) !== 1 ? 's' : ''} left</li>`).join('')}</ul>
                </div>
              ` : ''}
              ${eventStudents.length > 0 ? `
                <div class="signup-list">
                  <h4>Needing rides</h4>
                  <ul>${eventStudents.map((s) => `<li>${escapeHtml(s.name)}</li>`).join('')}</ul>
                </div>
              ` : ''}
            </div>
          `}
        </section>
      </div>
    `;
  }

  function attachHomeListeners(root) {
    const eventForm = root.querySelector('#form-event');
    if (eventForm) {
      eventForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(eventForm);
        const data = Object.fromEntries(fd);
        const similar = findSimilarEvent(data);
        if (similar) {
          state.pendingEvent = data;
          state.similarEventId = similar.id;
          render();
          return;
        }
        state.pendingEvent = null;
        state.similarEventId = null;
        (async () => {
          await addEvent(data);
          eventForm.reset();
          render();
        })();
      });
    }
    const useExistingBtn = root.querySelector('#use-existing-event');
    if (useExistingBtn) {
      useExistingBtn.addEventListener('click', () => {
        const eventId = state.similarEventId;
        state.pendingEvent = null;
        state.similarEventId = null;
        state.view = 'event';
        state.selectedEventId = eventId;
        render();
      });
    }
    const addNewBtn = root.querySelector('#add-new-event');
    if (addNewBtn) {
      addNewBtn.addEventListener('click', () => {
        (async () => {
          if (state.pendingEvent) {
            await addEvent(state.pendingEvent);
            state.pendingEvent = null;
            state.similarEventId = null;
            const eventForm = root.querySelector('#form-event');
            if (eventForm) eventForm.reset();
          }
          render();
        })();
      });
    }
    const prevBtn = root.querySelector('.calendar-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (state.calendarMonth === 1) {
          state.calendarMonth = 12;
          state.calendarYear -= 1;
        } else {
          state.calendarMonth -= 1;
        }
        render();
      });
    }
    const nextBtn = root.querySelector('.calendar-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (state.calendarMonth === 12) {
          state.calendarMonth = 1;
          state.calendarYear += 1;
        } else {
          state.calendarMonth += 1;
        }
        render();
      });
    }
    root.querySelectorAll('.calendar-event').forEach((btn) => {
      const eventId = btn.getAttribute('data-event-id');
      if (!eventId) return;
      btn.addEventListener('click', () => {
        state.view = 'event';
        state.selectedEventId = eventId;
        render();
      });
    });
  }

  function attachEventListeners(root) {
    const backLink = root.querySelector('.back-link[data-back="home"]');
    if (backLink) {
      backLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        state.view = 'home';
        state.selectedEventId = null;
        render();
      });
    }
    const eventSigninBtn = root.querySelector('#event-page-signin');
    if (eventSigninBtn) eventSigninBtn.addEventListener('click', () => { state.authModal = 'signin'; render(); });
    const eventSignupBtn = root.querySelector('#event-page-signup');
    if (eventSignupBtn) eventSignupBtn.addEventListener('click', () => { state.authModal = 'signup'; render(); });
    const driverForm = root.querySelector('#form-driver');
    const studentForm = root.querySelector('#form-student');
    if (driverForm) {
      driverForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(driverForm);
        const data = Object.fromEntries(fd);
        if (state.currentUser) data.userId = state.currentUser.id;
        (async () => {
          await addDriver(data);
          driverForm.reset();
          if (state.currentUser) {
            driverForm.querySelector('input[name="name"]').value = state.currentUser.name || '';
            driverForm.querySelector('input[name="phone"]').value = state.currentUser.phone || '';
          }
          render();
        })();
      });
    }
    if (studentForm) {
      studentForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(studentForm);
        const data = Object.fromEntries(fd);
        if (state.currentUser) data.userId = state.currentUser.id;
        (async () => {
          await addStudent(data);
          studentForm.reset();
          if (state.currentUser) {
            studentForm.querySelector('input[name="name"]').value = state.currentUser.name || '';
            studentForm.querySelector('input[name="phone"]').value = state.currentUser.phone || '';
            studentForm.querySelector('input[name="pickup"]').value = state.currentUser.pickupLocation || '';
          }
          render();
        })();
      });
    }
  }

  function attachMatchesListeners(root) {
    root.querySelectorAll('.match-pair').forEach((btn) => {
      btn.addEventListener('click', () => {
        const driverId = btn.getAttribute('data-driver-id');
        const studentId = btn.getAttribute('data-student-id');
        const eventId = btn.getAttribute('data-event-id');
        if (driverId && studentId && eventId) {
          (async () => {
            await createMatch(driverId, studentId, eventId);
            render();
          })();
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  (async function init() {
    await initAuth();
    if (sb) await loadFromSupabase();
    render();
  })();
})();
