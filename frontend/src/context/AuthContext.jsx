import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../services/api";

const AUTH_STORAGE_KEY = "sgetai.auth";

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const value = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function derivePlanFlags(authUser, profile) {
  const role = authUser?.role || profile?.role;
  const isPro =
    role === "seeker"
      ? Boolean(profile?.isPro)
      : false;

  return { role, isPro };
}

function isAdminRole(role) {
  return role === "SuperAdmin" || role === "Moderator";
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  async function hydrateSession(baseSession) {
    const authPayload = await apiRequest("/auth/me", {
      token: baseSession.accessToken,
    });

    const authUser = authPayload.user || {};
    const role = authUser.role || baseSession.role;

    if (isAdminRole(role)) {
      return {
        ...baseSession,
        role,
        userId: authUser.id || baseSession.userId,
        email: authUser.email || baseSession.email || "",
        username: authUser.username || baseSession.username || "",
        profile: {
          role,
          email: authUser.email || baseSession.email || "",
        },
        isPro: false,
      };
    }

    const profilePayload = await apiRequest("/profile/me", {
      token: baseSession.accessToken,
    });

    const profile = profilePayload.profile || {};
    const { isPro } = derivePlanFlags(authUser, profile);

    return {
      ...baseSession,
      role: role || baseSession.role,
      userId: authUser.id || baseSession.userId,
      email: authUser.email || baseSession.email || "",
      username: authUser.username || baseSession.username || "",
      // Present only for organization sessions issued after multi-user-per-company support
      // shipped — the acting team member, not the company (userId stays the company's own id).
      memberId: authUser.memberId || baseSession.memberId || null,
      memberRole: authUser.memberRole || baseSession.memberRole || null,
      profile,
      isPro,
    };
  }

  useEffect(() => {
    const storedSession = readStoredSession();

    if (!storedSession?.accessToken) {
      setIsBootstrapping(false);
      return;
    }

    hydrateSession(storedSession)
      .then((nextSession) => {
        setSession(nextSession);
        writeStoredSession(nextSession);
      })
      .catch(() => {
        setSession(null);
        writeStoredSession(null);
      })
      .finally(() => {
        setIsBootstrapping(false);
      });
  }, []);

  const value = useMemo(
    () => ({
      session,
      isBootstrapping,
      isAuthenticated: Boolean(session?.accessToken),
      async completeLogin(authResponse) {
        const baseSession = {
          accessToken: authResponse.accessToken,
          refreshToken: authResponse.refreshToken,
          role: authResponse.role,
          userId: authResponse.userId,
          email: authResponse.email || "",
          username: authResponse.username || "",
          memberId: authResponse.memberId || null,
          memberRole: authResponse.memberRole || null,
        };

        const nextSession = await hydrateSession(baseSession);
        setSession(nextSession);
        writeStoredSession(nextSession);
        return nextSession;
      },
      async refreshSession() {
        if (!session?.accessToken) {
          return null;
        }

        const nextSession = await hydrateSession(session);
        setSession(nextSession);
        writeStoredSession(nextSession);
        return nextSession;
      },
      replaceProfile(profile) {
        setSession((current) => {
          if (!current) {
            return current;
          }

          const { role, isPro } = derivePlanFlags(
            {
              role: current.role,
            email: current.email,
            username: current.username,
            id: current.userId,
          },
            profile
          );

          const nextSession = {
            ...current,
            role: role || current.role,
            profile,
            isPro,
          };

          writeStoredSession(nextSession);
          return nextSession;
        });
      },
      logout() {
        setSession(null);
        writeStoredSession(null);
      },
    }),
    [isBootstrapping, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
