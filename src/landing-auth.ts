import { signOutGoogle } from './auth/googleAuth';

interface SignInResponse {
  redirect?: boolean;
  url?: string;
}

const root = document.querySelector<HTMLElement>('[data-auth-root]');
const signInButton = root?.querySelector<HTMLButtonElement>('[data-auth-sign-in]');
const signInLabel = root?.querySelector<HTMLElement>('[data-auth-label]');
const signedInPanel = root?.querySelector<HTMLElement>('[data-auth-ready]');
const signOutButton = root?.querySelector<HTMLButtonElement>('[data-auth-sign-out]');
const message = root?.querySelector<HTMLElement>('[data-auth-message]');

function setAnonymous(messageText?: string): void {
  if (!root || !signInButton || !signInLabel || !signedInPanel || !message) return;
  root.hidden = false;
  root.dataset.authState = 'anonymous';
  signInButton.hidden = false;
  signInButton.disabled = false;
  signInLabel.textContent = 'Přihlásit se přes Google';
  signedInPanel.hidden = true;
  message.hidden = false;
  message.textContent = messageText
    ?? 'Přihlášení vytvoří účet pro budoucí ukládání postupu na více zařízeních.';
}

function setAuthenticated(): void {
  if (!root || !signInButton || !signedInPanel || !message) return;
  root.hidden = false;
  root.dataset.authState = 'authenticated';
  signInButton.hidden = true;
  signedInPanel.hidden = false;
  message.hidden = true;
}

function setUnavailable(): void {
  if (!root) return;
  root.dataset.authState = 'unavailable';
  root.hidden = true;
  if (signInButton) signInButton.disabled = true;
}

async function refreshSession(): Promise<void> {
  try {
    const response = await fetch('/v1/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      setAuthenticated();
      return;
    }
    if (response.status === 401) {
      const authError = new URLSearchParams(window.location.search).has('auth_error');
      setAnonymous(authError ? 'Přihlášení se nepodařilo. Zkus to prosím znovu.' : undefined);
      return;
    }
    setUnavailable();
  } catch {
    setUnavailable();
  }
}

signInButton?.addEventListener('click', async () => {
  signInButton.disabled = true;
  if (signInLabel) signInLabel.textContent = 'Otevírám Google…';

  try {
    const response = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'google',
        callbackURL: '/',
        errorCallbackURL: '/?auth_error=google',
      }),
    });
    const data = await response.json() as SignInResponse;
    if (!response.ok || !data.url) throw new Error('Google authorization URL is missing');
    window.location.assign(data.url);
  } catch {
    setAnonymous('Google přihlášení se nepodařilo otevřít. Zkus to prosím znovu.');
  }
});

signOutButton?.addEventListener('click', async () => {
  signOutButton.disabled = true;
  try {
    await signOutGoogle();
    setAnonymous();
  } catch {
    if (message) {
      message.hidden = false;
      message.textContent = 'Odhlášení se nepodařilo. Zkus to prosím znovu.';
    }
  } finally {
    signOutButton.disabled = false;
  }
});

void refreshSession();
