/**
 * Local business accounts. This is a prototype account layer: everything lives
 * in localStorage, and passwords are hashed with a fast non-cryptographic
 * digest purely so they are not stored in plain sight. A real deployment must
 * move this to a server with a proper KDF and session cookies.
 */

export type AccountKind = 'player' | 'business';

export type BusinessPlan = 'starter' | 'growth' | 'scale';

export interface Account {
  id: string;
  kind: AccountKind;
  email: string;
  /** Person who owns the login. */
  name: string;
  /** Business/organisation shown across the portal. */
  company: string;
  plan: BusinessPlan;
  role: 'owner' | 'admin';
  passwordHash: string;
  createdAt: number;
  /** Games the business runs arenas for. */
  games: string[];
}

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; error: string };

const ACCOUNTS_KEY = 'rivalry.accounts.v1';
const SESSION_KEY = 'rivalry.session.v1';

export const DEMO_BUSINESS = { email: 'ops@rustopia.gg', password: 'rivalry2026' };

export const PLAN_LABEL: Record<BusinessPlan, string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
};

export const PLAN_LIMITS: Record<BusinessPlan, { servers: number; campaignBudget: number }> = {
  starter: { servers: 2, campaignBudget: 500 },
  growth: { servers: 8, campaignBudget: 5000 },
  scale: { servers: 40, campaignBudget: 50000 },
};

function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let second = 0x9e3779b9;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    second = Math.imul(second ^ text.charCodeAt(index), 0x85ebca6b) >>> 0;
  }
  return `${hash.toString(16)}${second.toString(16)}`;
}

function hashPassword(email: string, password: string): string {
  return digest(`${email.trim().toLowerCase()}::${password}::rivalry-business`);
}

function readAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Account[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: Account[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Storage can be full or blocked; the session then lives only in memory.
  }
}

function seedAccount(): Account {
  return {
    id: 'biz-demo',
    kind: 'business',
    email: DEMO_BUSINESS.email,
    name: 'Ada Whitfield',
    company: 'Rustopia Network',
    plan: 'growth',
    role: 'owner',
    passwordHash: hashPassword(DEMO_BUSINESS.email, DEMO_BUSINESS.password),
    createdAt: Date.now(),
    games: ['valorant', 'cs2', 'rocketleague'],
  };
}

export function accounts(): Account[] {
  const list = readAccounts();
  if (!list.some((account) => account.kind === 'business')) {
    const seeded = [seedAccount(), ...list];
    writeAccounts(seeded);
    return seeded;
  }
  return list;
}

export function currentAccount(): Account | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return accounts().find((account) => account.id === id) ?? null;
  } catch {
    return null;
  }
}

function setSession(account: Account | null): void {
  try {
    if (account) localStorage.setItem(SESSION_KEY, account.id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore: no persistence available.
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function signIn(email: string, password: string): AuthResult {
  const normalized = email.trim().toLowerCase();
  if (!isValidEmail(normalized)) return { ok: false, error: 'Enter a valid work email.' };
  if (!password) return { ok: false, error: 'Enter your password.' };

  const account = accounts().find((entry) => entry.email === normalized);
  if (!account) {
    return { ok: false, error: 'No business account uses that email yet.' };
  }
  if (account.passwordHash !== hashPassword(normalized, password)) {
    return { ok: false, error: 'That password does not match this account.' };
  }
  setSession(account);
  return { ok: true, account };
}

interface SignUpInput {
  email: string;
  password: string;
  company: string;
  name: string;
  plan: BusinessPlan;
}

export function createBusinessAccount(input: SignUpInput): AuthResult {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid work email.' };
  if (input.company.trim().length < 2) return { ok: false, error: 'Add the name of your server network.' };
  if (input.name.trim().length < 2) return { ok: false, error: 'Add your name so we know who owns the account.' };
  if (input.password.length < 8) return { ok: false, error: 'Use at least 8 characters for your password.' };
  if (accounts().some((account) => account.email === email)) {
    return { ok: false, error: 'That email already has an account — sign in instead.' };
  }

  const account: Account = {
    id: `biz-${Date.now()}`,
    kind: 'business',
    email,
    name: input.name.trim(),
    company: input.company.trim(),
    plan: input.plan,
    role: 'owner',
    passwordHash: hashPassword(email, input.password),
    createdAt: Date.now(),
    games: ['valorant'],
  };
  writeAccounts([account, ...readAccounts()]);
  setSession(account);
  return { ok: true, account };
}

export function signInDemo(): AuthResult {
  return signIn(DEMO_BUSINESS.email, DEMO_BUSINESS.password);
}

export function signOut(): void {
  setSession(null);
}

export function updateAccount(id: string, patch: Partial<Account>): Account | null {
  const list = readAccounts();
  const next = list.map((account) => (account.id === id ? { ...account, ...patch } : account));
  writeAccounts(next);
  return next.find((account) => account.id === id) ?? null;
}
