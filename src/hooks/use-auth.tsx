import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "technician" | "viewer";
export type ProfileStatus = "pending" | "active" | "disabled";

export type Profile = {
  id: string;
  tenant_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  status: ProfileStatus;
};

export type Tenant = { id: string; name: string; slug: string };

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenant: Tenant | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (rs: AppRole[]) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

async function loadUserData(userId: string): Promise<{ profile: Profile | null; tenant: Tenant | null; roles: AppRole[] }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, email, avatar_url, status")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return { profile: null, tenant: null, roles: [] };

  const [{ data: tenant }, { data: rolesData }] = await Promise.all([
    supabase.from("tenants").select("id, name, slug").eq("id", profile.tenant_id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  return {
    profile: profile as Profile,
    tenant: (tenant as Tenant) ?? null,
    roles: (rolesData ?? []).map((r: { role: AppRole }) => r.role),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (s: Session | null) => {
    setSession(s);
    setUser(s?.user ?? null);
    if (!s?.user) {
      setProfile(null);
      setTenant(null);
      setRoles([]);
      setLoading(false);
      return;
    }
    try {
      const data = await loadUserData(s.user.id);
      setProfile(data.profile);
      setTenant(data.tenant);
      setRoles(data.roles);
    } catch (err) {
      console.error("Failed to load user data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1) Subscribe FIRST (synchronously) to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // Filter to identity transitions only
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        // Defer state updates to next tick to avoid auth-deadlock
        setTimeout(() => { void hydrate(s); }, 0);
      }
    });

    // 2) Then check existing session
    supabase.auth.getSession().then(({ data }) => { void hydrate(data.session); });

    return () => subscription.unsubscribe();
  }, [hydrate]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await hydrate(data.session);
  }, [hydrate]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));

  return (
    <AuthContext.Provider value={{ session, user, profile, tenant, roles, loading, hasRole, hasAnyRole, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}