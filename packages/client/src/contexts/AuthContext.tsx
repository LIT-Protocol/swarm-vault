import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { SiweMessage } from "siwe";
import type { User } from "@swarm-vault/shared";
import { api } from "../lib/api";

const STORAGE_KEY = "swarm_vault_token";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  // Load token from storage and fetch user on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem(STORAGE_KEY);
      if (token) {
        api.setToken(token);
        try {
          const userData = await api.get<User>("/api/auth/me");
          setUser(userData);
        } catch {
          // Token invalid, clear it
          localStorage.removeItem(STORAGE_KEY);
          api.setToken(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!isConnected && user) {
      logout();
    }
  }, [isConnected]);

  const login = useCallback(async () => {
    if (!address || !chainId) {
      setError("Please connect your wallet first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Get nonce from server
      const { nonce } = await api.post<{ nonce: string }>("/api/auth/nonce", {
        address,
      });

      // 2. Create SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Swarm Vault",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });

      const messageString = message.prepareMessage();

      // 3. Sign message
      const signature = await signMessageAsync({ message: messageString });

      // 4. Verify signature and get JWT
      const { token, user: userData } = await api.post<{
        token: string;
        user: User;
      }>("/api/auth/login", {
        message: messageString,
        signature,
      });

      // 5. Store token and update state
      localStorage.setItem(STORAGE_KEY, token);
      api.setToken(token);
      setUser(userData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to sign in";
      setError(errorMessage);
      console.error("Login failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, signMessageAsync]);

  const logout = useCallback(() => {
    console.log('[AuthContext] logout called');
    localStorage.removeItem(STORAGE_KEY);
    api.setToken(null);
    setUser(null);
    setError(null);
    console.log('[AuthContext] calling disconnect()');
    disconnect();
  }, [disconnect]);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      try {
        const userData = await api.get<User>("/api/auth/me");
        setUser(userData);
      } catch {
        // Token invalid, clear it
        localStorage.removeItem(STORAGE_KEY);
        api.setToken(null);
        setUser(null);
      }
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
