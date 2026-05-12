// Shared auth + account UI logic for 3Dfidgets.shop
(function(){
  const USERS_KEY = 'fidgets_users';
  const CURRENT_KEY = 'fidgets_current_user';

  function read(key, fallback){
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function write(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function nowIso(){ return new Date().toISOString(); }
  function hash(email, pass){ return btoa(String(email || '').trim().toLowerCase() + String(pass || '')); }

  function getUsers(){ return read(USERS_KEY, []); }
  function setUsers(users){ write(USERS_KEY, users); }
  function getCurrentUser(){ return read(CURRENT_KEY, null); }
  function setCurrentUser(user){ write(CURRENT_KEY, user); }
  function clearCurrentUser(){ localStorage.removeItem(CURRENT_KEY); }

  function showToast(msg){
    if (typeof window.showToast === 'function') return window.showToast(msg);
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function ensureAuthModal(){
    if (document.getElementById('authOverlay')) return;
    const html = `
      <div id="authOverlay" style="position:fixed;inset:0;background:rgba(26,26,46,.6);z-index:240;display:none;align-items:center;justify-content:center;padding:1rem">
        <div style="background:#fff;border:3px solid var(--dark);border-radius:20px;box-shadow:6px 6px 0 var(--dark);width:min(560px,100%);overflow:hidden;position:relative">
          <button id="authClose" style="position:absolute;right:.7rem;top:.6rem;border:2px solid var(--dark);background:#fff;border-radius:100px;padding:.2rem .6rem;cursor:pointer">✕</button>
          <div style="padding:1rem 1rem .8rem">
            <div id="authTabs" style="display:flex;gap:.45rem;background:#f3f1ee;border:2px solid var(--dark);padding:.25rem;border-radius:100px;position:relative">
              <button data-tab="login" class="auth-tab active" style="flex:1;border:0;background:var(--dark);color:var(--blue);font-family:'Fredoka One',cursive;border-radius:100px;padding:.5rem">Log In</button>
              <button data-tab="signup" class="auth-tab" style="flex:1;border:0;background:transparent;color:var(--dark);font-family:'Fredoka One',cursive;border-radius:100px;padding:.5rem">Sign Up</button>
            </div>
          </div>
          <div id="authLoginPane" style="padding:0 1rem 1rem">
            <div style="display:grid;gap:.55rem">
              <input id="loginEmail" type="email" placeholder="Email" style="border:2.5px solid var(--dark);border-radius:12px;padding:.65rem .85rem;font-family:'Nunito',sans-serif"/>
              <input id="loginPass" type="password" placeholder="Password" style="border:2.5px solid var(--dark);border-radius:12px;padding:.65rem .85rem;font-family:'Nunito',sans-serif"/>
              <button id="loginSubmit" style="background:var(--orange);color:#fff;border:2.5px solid var(--dark);border-radius:100px;padding:.7rem;font-family:'Fredoka One',cursive;box-shadow:4px 4px 0 var(--dark)">Log In</button>
              <a href="#" style="font-size:.82rem;color:#666;text-align:center">Forgot password?</a>
            </div>
          </div>
          <div id="authSignupPane" style="padding:0 1rem 1rem;display:none">
            <div style="display:grid;gap:.55rem">
              <input id="signupName" type="text" placeholder="First name" style="border:2.5px solid var(--dark);border-radius:12px;padding:.65rem .85rem;font-family:'Nunito',sans-serif"/>
              <input id="signupEmail" type="email" placeholder="Email" style="border:2.5px solid var(--dark);border-radius:12px;padding:.65rem .85rem;font-family:'Nunito',sans-serif"/>
              <input id="signupPass" type="password" placeholder="Password" style="border:2.5px solid var(--dark);border-radius:12px;padding:.65rem .85rem;font-family:'Nunito',sans-serif"/>
              <input id="signupPass2" type="password" placeholder="Confirm password" style="border:2.5px solid var(--dark);border-radius:12px;padding:.65rem .85rem;font-family:'Nunito',sans-serif"/>
              <button id="signupSubmit" style="background:var(--orange);color:#fff;border:2.5px solid var(--dark);border-radius:100px;padding:.7rem;font-family:'Fredoka One',cursive;box-shadow:4px 4px 0 var(--dark)">Create Account</button>
              <div style="font-size:.8rem;color:#666;text-align:center">By signing up you agree to our returns policy</div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const overlay = document.getElementById('authOverlay');
    const closeBtn = document.getElementById('authClose');
    closeBtn.addEventListener('click', closeAuth);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeAuth(); });

    document.querySelectorAll('.auth-tab').forEach(btn => {
      btn.addEventListener('click', function(){
        const tab = btn.getAttribute('data-tab');
        setTab(tab);
      });
    });

    document.getElementById('loginSubmit').addEventListener('click', login);
    document.getElementById('signupSubmit').addEventListener('click', signup);
  }

  function setTab(tab){
    const loginPane = document.getElementById('authLoginPane');
    const signupPane = document.getElementById('authSignupPane');
    document.querySelectorAll('.auth-tab').forEach(btn => {
      const active = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', active);
      btn.style.background = active ? 'var(--dark)' : 'transparent';
      btn.style.color = active ? 'var(--blue)' : 'var(--dark)';
    });
    loginPane.style.display = tab === 'login' ? 'block' : 'none';
    signupPane.style.display = tab === 'signup' ? 'block' : 'none';
  }

  function openAuth(startTab){
    ensureAuthModal();
    setTab(startTab || 'login');
    document.getElementById('authOverlay').style.display = 'flex';
  }

  function closeAuth(){
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function login(){
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pass = document.getElementById('loginPass').value;
    if (!email || !pass) return showToast('Enter email and password');
    const users = getUsers();
    const hit = users.find(u => u.email.toLowerCase() === email && u.passwordHash === hash(email, pass));
    if (!hit) return showToast('Invalid login details');
    setCurrentUser({ id: hit.id, firstName: hit.firstName, email: hit.email });
    closeAuth();
    renderHeaderUser();
    showToast('Welcome back!');
  }

  function signup(){
    const firstName = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const pass = document.getElementById('signupPass').value;
    const pass2 = document.getElementById('signupPass2').value;
    if (!firstName || !email || !pass || !pass2) return showToast('Please complete all fields');
    if (pass !== pass2) return showToast('Passwords do not match');
    const users = getUsers();
    if (users.some(u => u.email.toLowerCase() === email)) return showToast('Account already exists');
    const user = {
      id: 'u_' + Date.now(),
      firstName,
      email,
      passwordHash: hash(email, pass),
      createdAt: nowIso(),
    };
    users.push(user);
    setUsers(users);
    setCurrentUser({ id: user.id, firstName: user.firstName, email: user.email });
    closeAuth();
    renderHeaderUser();
    showToast('Account created!');
  }

  function bindHeaderAuth(){
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;
    loginBtn.addEventListener('click', function(e){
      e.preventDefault();
      openAuth('login');
    });

    const userBtn = document.getElementById('userBtn');
    if (userBtn) {
      userBtn.addEventListener('click', function(e){
        e.preventDefault();
        const menu = document.getElementById('userMenu');
        if (!menu) return;
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e){
        e.preventDefault();
        clearCurrentUser();
        location.reload();
      });
    }
  }

  function renderHeaderUser(){
    const loginBtn = document.getElementById('loginBtn');
    const userWrap = document.getElementById('userWrap');
    const userName = document.getElementById('userName');
    const user = getCurrentUser();
    if (loginBtn) loginBtn.style.display = user ? 'none' : 'inline-flex';
    if (userWrap) userWrap.style.display = user ? 'inline-block' : 'none';
    if (userName && user) userName.textContent = `Hi, ${user.firstName} 👋`;
  }

  document.addEventListener('click', function(e){
    const menu = document.getElementById('userMenu');
    const wrap = document.getElementById('userWrap');
    if (!menu || !wrap) return;
    if (!wrap.contains(e.target)) menu.style.display = 'none';
  });

  document.addEventListener('DOMContentLoaded', function(){
    ensureAuthModal();
    renderHeaderUser();
    bindHeaderAuth();
  });

  window.fidgetsAuth = {
    openAuth,
    closeAuth,
    getCurrentUser,
    setCurrentUser,
    clearCurrentUser,
    renderHeaderUser,
  };
})();
