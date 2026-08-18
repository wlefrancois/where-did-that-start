(() => {
  const STORAGE_KEY = 'argument_autopsy_session_v1';
  let config;
  let session;
  let account;

  const $ = (selector) => document.querySelector(selector);

  function setError(message = '') {
    const element = $('#auth-error');
    if (element) element.textContent = message;
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  }

  async function api(path, options = {}) {
    if (!config) {
      const response = await fetch('/api/auth-config', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Login is not configured.');
      config = payload;
    }

    const headers = {
      apikey: config.publishableKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    return fetch(config.url + path, { ...options, headers });
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    const response = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      saveSession(null);
      return null;
    }
    saveSession({
      ...payload,
      expires_at_ms: Date.now() + Number(payload.expires_in || 3600) * 1000
    });
    return session;
  }

  async function activeSession() {
    session = session || readSession();
    if (!session?.access_token) return null;
    if (Number(session.expires_at_ms || 0) < Date.now() + 60000) {
      return refreshSession();
    }
    return session;
  }

  async function loadAccount() {
    const current = await activeSession();
    if (!current) return null;
    const response = await api(
      `/rest/v1/entitlements?select=free_reports_remaining,paid_report_credits,unlimited_until&user_id=eq.${encodeURIComponent(current.user.id)}`,
      { headers: { Authorization: `Bearer ${current.access_token}` } }
    );
    const payload = await response.json().catch(() => []);
    account = response.ok && Array.isArray(payload) ? payload[0] || null : null;
    return account;
  }

  function availableReports() {
    if (!account) return 0;
    if (account.unlimited_until && new Date(account.unlimited_until) > new Date()) return Number.MAX_SAFE_INTEGER;
    return Number(account.free_reports_remaining || 0) + Number(account.paid_report_credits || 0);
  }

  function creditText() {
    if (!account) return 'Account ready';
    const total = availableReports();
    if (total === Number.MAX_SAFE_INTEGER) return 'Unlimited reports';
    return total === 1 ? '1 report available' : `${total} reports available`;
  }

  function render() {
    const signedIn = Boolean(session?.access_token && session?.user);
    $('#auth-signed-out').hidden = signedIn;
    $('#auth-signed-in').hidden = !signedIn;
    if (signedIn) {
      $('#auth-email').textContent = session.user.email || 'Signed in';
      $('#auth-credit').textContent = creditText();
    }
    window.dispatchEvent(new CustomEvent('argument-autopsy:account', {
      detail: { signedIn, available: signedIn ? availableReports() : null }
    }));
  }

  async function initialize() {
    try {
      await api('/auth/v1/settings', { method: 'GET' });
      session = readSession();
      await activeSession();
      if (session) await loadAccount();
    } catch (error) {
      setError(error.message || 'Login could not be initialized.');
    }
    render();
  }

  async function sendCode() {
    const email = $('#auth-email-input').value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    $('#auth-send-code').disabled = true;
    try {
      const response = await api('/auth/v1/otp', {
        method: 'POST',
        body: JSON.stringify({ email, create_user: true })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.msg || payload.message || 'The sign-in code could not be sent.');
      $('#auth-code-email').textContent = email;
      $('#auth-code-panel').hidden = false;
      $('#auth-code').focus();
    } catch (error) {
      setError(error.message || 'The sign-in code could not be sent.');
    } finally {
      $('#auth-send-code').disabled = false;
    }
  }

  async function verifyCode() {
    const email = $('#auth-email-input').value.trim().toLowerCase();
    const token = $('#auth-code').value.replace(/\D/g, '');
    if (token.length !== 6) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    setError('');
    $('#auth-verify-code').disabled = true;
    try {
      const response = await api('/auth/v1/verify', {
        method: 'POST',
        body: JSON.stringify({ email, token, type: 'email' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.access_token) throw new Error(payload.msg || 'That code is invalid or expired.');
      saveSession({
        ...payload,
        expires_at_ms: Date.now() + Number(payload.expires_in || 3600) * 1000
      });
      $('#auth-code-panel').hidden = true;
      await loadAccount();
      render();
    } catch (error) {
      setError(error.message || 'That code is invalid or expired.');
    } finally {
      $('#auth-verify-code').disabled = false;
    }
  }

  async function signOut() {
    const current = await activeSession();
    if (current) {
      await api('/auth/v1/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${current.access_token}` }
      }).catch(() => {});
    }
    saveSession(null);
    account = null;
    render();
  }

  async function requireSession() {
    const current = await activeSession();
    if (!current) {
      setError('Sign in with your email before beginning a case.');
      $('#auth-email-input').focus();
      return null;
    }
    return current;
  }

  async function acceptUnfilteredTerms() {
    const current = await requireSession();
    if (!current) return false;
    const timestamp = new Date().toISOString();
    const response = await api(
      `/rest/v1/profiles?user_id=eq.${encodeURIComponent(current.user.id)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${current.access_token}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          age_18_confirmed_at: timestamp,
          unfiltered_terms_accepted_at: timestamp
        })
      }
    );
    return response.ok;
  }

  $('#auth-send-code').addEventListener('click', sendCode);
  $('#auth-verify-code').addEventListener('click', verifyCode);
  $('#auth-sign-out').addEventListener('click', signOut);
  $('#auth-code').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') verifyCode();
  });

  window.ArgumentAutopsyAuth = {
    initialize,
    requireSession,
    acceptUnfilteredTerms,
    refreshAccount: async () => {
      await loadAccount();
      render();
    }
  };

  initialize();
})();