export type Qa3atyUser = { id: string; username: string; full_name: string; role: "super_admin" | "tenant_admin" };
export type Qa3atySession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  token_type: string;
  user: Qa3atyUser;
};

export function saveQa3atySession(session: Qa3atySession) {
  window.localStorage.setItem("qa3aty-session", JSON.stringify(session));
}

export function readQa3atySession(): Qa3atySession | null {
  const raw = window.localStorage.getItem("qa3aty-session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Qa3atySession;
  } catch {
    window.localStorage.removeItem("qa3aty-session");
    return null;
  }
}

export function clearQa3atySession() {
  window.localStorage.removeItem("qa3aty-session");
}