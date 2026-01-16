import { useEffect, useRef } from "react";
import { Outlet, Link } from "react-router-dom";
import { useAccount, useConnect, useReconnect } from "wagmi";
import { truncateAddress } from "@swarm-vault/shared";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { address, isConnected } = useAccount();
  const { connect, connectAsync, connectors, isPending: isConnecting, status, reset } = useConnect();
  const { reconnect } = useReconnect();
  const { user, isAuthenticated, isLoading, error, login, logout } = useAuth();
  const pendingConnectRef = useRef(false);
  const pendingLoginRef = useRef(false);

  // Auto-login after successful connect/reconnect
  useEffect(() => {
    if (isConnected && pendingLoginRef.current && !isAuthenticated) {
      pendingLoginRef.current = false;
      login();
    }
  }, [isConnected, isAuthenticated, login, status]);

  // Handle connecting after reset completes
  useEffect(() => {
    if (pendingConnectRef.current && status === 'idle' && connectors[0]) {
      pendingConnectRef.current = false;
      connect({ connector: connectors[0] });
    }
  }, [status, connect, connectors]);

  const handleConnect = async () => {
    if (isConnected || status === 'pending') {
      return;
    }

    // If in error state, try reconnect first then reset if needed
    if (status === 'error') {
      try {
        pendingLoginRef.current = true;
        await reconnect({ connectors: [connectors[0]] });
        // If reconnect succeeds without error, the useEffect will handle login
        return;
      } catch {
        pendingLoginRef.current = false;
        pendingConnectRef.current = true;
        reset();
        return;
      }
    }

    // If in stale success state, reset first
    if (status === 'success') {
      pendingConnectRef.current = true;
      reset();
      return;
    }

    // Normal connect (status is 'idle')
    if (connectors[0]) {
      pendingLoginRef.current = true;

      try {
        await connectAsync({ connector: connectors[0] });
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);

        // If "Connector already connected", the wallet is still authorized - request accounts directly
        if (errorMessage.includes('Connector already connected')) {
          try {
            // Access window.ethereum directly to trigger MetaMask
            const ethereum = window.ethereum as { request?: (args: { method: string }) => Promise<string[]> } | undefined;
            if (ethereum?.request) {
              const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
              if (accounts && accounts.length > 0) {
                // Now try reconnect - wagmi should pick up the active connection
                await reconnect({ connectors: [connectors[0]] });
              }
            } else {
              pendingLoginRef.current = false;
            }
          } catch {
            pendingLoginRef.current = false;
          }
        } else {
          pendingLoginRef.current = false;
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Swarm Vault
            </Link>

            <nav className="flex items-center gap-4">
              <Link
                to="/about"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                About
              </Link>
              <Link
                to="/swarms"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Discover
              </Link>
              {isAuthenticated && user ? (
                <div className="flex items-center gap-4">
                  <Link
                    to="/my-swarms"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    My Swarms
                  </Link>
                  <Link
                    to="/manager"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                  >
                    Manager
                  </Link>
                  <Link
                    to="/settings"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1"
                  >
                    {user.twitterUsername ? (
                      <span className="text-blue-500">@{user.twitterUsername}</span>
                    ) : (
                      <>
                        <span>Settings</span>
                        <span className="w-2 h-2 bg-yellow-400 rounded-full" title="Twitter not connected" />
                      </>
                    )}
                  </Link>
                  <button
                    onClick={logout}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Sign Out
                  </button>
                </div>
              ) : isConnected && !isAuthenticated ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">
                    {truncateAddress(address || "")}
                  </span>
                  <button
                    onClick={login}
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? "Signing..." : "Sign In"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
