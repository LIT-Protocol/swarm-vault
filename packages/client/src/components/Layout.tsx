import { useEffect, useRef } from "react";
import { Outlet, Link } from "react-router-dom";
import { useAccount, useConnect, useReconnect } from "wagmi";
import { truncateAddress } from "@swarm-vault/shared";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting, status, reset, error: connectError } = useConnect();
  const { reconnect } = useReconnect();
  const { user, isAuthenticated, isLoading, error, login, logout } = useAuth();
  const pendingConnectRef = useRef(false);
  const pendingLoginRef = useRef(false);

  // Debug: log state changes
  useEffect(() => {
    console.log('[Layout] State changed:', { isConnected, status, connectors: connectors.length, pendingConnect: pendingConnectRef.current, pendingLogin: pendingLoginRef.current, connectError: connectError?.message });
  }, [isConnected, status, connectors, connectError]);

  // Auto-login after successful connect/reconnect
  useEffect(() => {
    // Wait for connection to fully settle (not pending) before triggering login
    if (isConnected && pendingLoginRef.current && !isAuthenticated && status !== 'pending') {
      console.log('[Layout] Connected with pending login, status settled, triggering login now');
      pendingLoginRef.current = false;
      login();
    }
  }, [isConnected, isAuthenticated, login, status]);

  // Handle connecting after reset completes
  useEffect(() => {
    console.log('[Layout] Reset effect check:', { pendingConnect: pendingConnectRef.current, status, hasConnector: !!connectors[0] });
    if (pendingConnectRef.current && status === 'idle' && connectors[0]) {
      console.log('[Layout] Triggering connect after reset');
      pendingConnectRef.current = false;
      connect({ connector: connectors[0] });
    }
  }, [status, connect, connectors]);

  const handleConnect = async () => {
    console.log('[Layout] handleConnect called:', { isConnected, status, connectors: connectors.length });

    if (isConnected || status === 'pending') {
      console.log('[Layout] Early return: isConnected or pending');
      return;
    }

    // If in error state (e.g., "connector already connected"), try reconnect first
    if (status === 'error') {
      console.log('[Layout] In error state, trying reconnect first');
      try {
        pendingLoginRef.current = true;
        const reconnectResult = await reconnect();
        console.log('[Layout] Reconnect result (error state):', reconnectResult);
        // reconnect() returns undefined or an array - check if we got connections
        if (!reconnectResult || reconnectResult.length === 0) {
          console.log('[Layout] Reconnect returned empty/undefined, resetting');
          pendingLoginRef.current = false;
          pendingConnectRef.current = true;
          reset();
        } else {
          console.log('[Layout] Reconnect succeeded, pending login will trigger via useEffect');
        }
        return;
      } catch (e) {
        console.log('[Layout] Reconnect failed, resetting:', e);
        pendingLoginRef.current = false;
        pendingConnectRef.current = true;
        reset();
        return;
      }
    }

    // If in stale success state, reset first
    if (status === 'success') {
      console.log('[Layout] Resetting stale success state');
      pendingConnectRef.current = true;
      reset();
      return;
    }

    // Normal connect (status is 'idle')
    console.log('[Layout] Normal connect path, status is idle');
    if (connectors[0]) {
      console.log('[Layout] Calling connect with connector:', connectors[0].name, connectors[0].id);
      // Try reconnect first in case wallet is still authorized
      pendingLoginRef.current = true;
      try {
        console.log('[Layout] Trying reconnect first...');
        const reconnectResult = await reconnect();
        console.log('[Layout] Reconnect result:', reconnectResult);
        // reconnect() returns undefined or an array - check if we got connections
        if (!reconnectResult || reconnectResult.length === 0) {
          console.log('[Layout] Reconnect returned empty/undefined, trying fresh connect');
          connect({ connector: connectors[0] });
        } else {
          console.log('[Layout] Reconnect succeeded, pending login will trigger via useEffect');
        }
      } catch (e) {
        console.log('[Layout] Reconnect failed, trying fresh connect:', e);
        connect({ connector: connectors[0] });
        // pendingLoginRef stays true, will trigger after connect succeeds
      }
    } else {
      console.log('[Layout] No connector available!');
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
