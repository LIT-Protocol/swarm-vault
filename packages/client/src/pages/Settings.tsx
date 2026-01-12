import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function Settings() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Handle Twitter OAuth callback results
  useEffect(() => {
    const twitterSuccess = searchParams.get("twitter_success");
    const twitterError = searchParams.get("twitter_error");

    if (twitterSuccess) {
      setMessage({ type: "success", text: "Twitter account connected successfully!" });
      // Clear the URL params
      setSearchParams({});
      // Refresh user data
      window.location.reload();
    } else if (twitterError) {
      let errorText = "Failed to connect Twitter account";
      switch (twitterError) {
        case "already_linked":
          errorText = "This Twitter account is already linked to another user";
          break;
        case "token_exchange_failed":
          errorText = "Failed to authenticate with Twitter. Please try again.";
          break;
        case "user_fetch_failed":
          errorText = "Failed to fetch Twitter user information";
          break;
        case "invalid_state":
          errorText = "Invalid OAuth state. Please try again.";
          break;
        case "expired":
          errorText = "OAuth session expired. Please try again.";
          break;
        case "access_denied":
          errorText = "Access was denied. Please authorize the application.";
          break;
        default:
          errorText = `Twitter connection failed: ${twitterError}`;
      }
      setMessage({ type: "error", text: errorText });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleConnectTwitter = async () => {
    setIsConnecting(true);
    setMessage(null);
    try {
      const { authUrl } = await api.get<{ authUrl: string }>("/api/auth/twitter");
      // Redirect to Twitter
      window.location.href = authUrl;
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to initiate Twitter connection",
      });
      setIsConnecting(false);
    }
  };

  const handleDisconnectTwitter = async () => {
    if (!confirm("Are you sure you want to disconnect your Twitter account? You won't be able to create new swarms until you reconnect.")) {
      return;
    }

    setIsDisconnecting(true);
    setMessage(null);
    try {
      await api.post("/api/auth/twitter/disconnect", {});
      setMessage({ type: "success", text: "Twitter account disconnected" });
      // Refresh the page to update user data
      window.location.reload();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to disconnect Twitter",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account settings</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Twitter Connection */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Twitter Connection</h2>
        <p className="text-gray-600 text-sm mb-4">
          Connect your Twitter account to verify your identity as a swarm manager. This is required
          before you can create swarms.
        </p>

        {user?.twitterUsername ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">@{user.twitterUsername}</p>
                <p className="text-sm text-green-600">Connected</p>
              </div>
            </div>

            <button
              onClick={handleDisconnectTwitter}
              disabled={isDisconnecting}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDisconnecting ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  Disconnecting...
                </span>
              ) : (
                "Disconnect Twitter"
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectTwitter}
            disabled={isConnecting}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isConnecting ? (
              <>
                <LoadingSpinner size="sm" />
                Connecting...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Connect Twitter
              </>
            )}
          </button>
        )}
      </div>

      {/* Wallet Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Wallet</h2>
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-500">Connected Wallet</p>
          <p className="font-mono text-sm text-gray-900 mt-1">{user?.walletAddress}</p>
        </div>
      </div>
    </div>
  );
}
