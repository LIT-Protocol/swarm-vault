import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

interface ApiKeyInfo {
  hasApiKey: boolean;
  prefix: string | null;
  createdAt: string | null;
}

interface GeneratedApiKey {
  apiKey: string;
  prefix: string;
  createdAt: string;
}

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // API Key state
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
  const [isRevokingApiKey, setIsRevokingApiKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<GeneratedApiKey | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch API key info
  const fetchApiKeyInfo = useCallback(async () => {
    try {
      const data = await api.get<ApiKeyInfo>("/api/auth/api-key");
      setApiKeyInfo(data);
    } catch (err) {
      console.error("Failed to fetch API key info:", err);
    } finally {
      setIsLoadingApiKey(false);
    }
  }, []);

  useEffect(() => {
    fetchApiKeyInfo();
  }, [fetchApiKeyInfo]);

  // Handle Twitter OAuth callback results
  useEffect(() => {
    const twitterSuccess = searchParams.get("twitter_success");
    const twitterError = searchParams.get("twitter_error");

    if (twitterSuccess) {
      // Clear the URL params
      setSearchParams({});

      // Check for pending action (e.g., user was trying to create a swarm)
      const pendingAction = localStorage.getItem("pendingAction");
      localStorage.removeItem("pendingAction");

      if (pendingAction === "createSwarm") {
        // Redirect to manager dashboard with flag to open create modal
        refreshUser().then(() => {
          navigate("/manager?openCreateModal=true");
        });
      } else {
        // Just refresh user data and stay on settings
        setMessage({ type: "success", text: "Twitter account connected successfully!" });
        refreshUser();
      }
      return;
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
      // Clear any pending action since auth failed
      localStorage.removeItem("pendingAction");
    }
  }, [searchParams, setSearchParams, navigate, refreshUser]);

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

  const handleGenerateApiKey = async () => {
    setIsGeneratingApiKey(true);
    setMessage(null);
    try {
      const data = await api.post<GeneratedApiKey>("/api/auth/api-key/generate", {});
      setGeneratedKey(data);
      setShowGenerateModal(true);
      // Refresh API key info
      await fetchApiKeyInfo();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to generate API key",
      });
    } finally {
      setIsGeneratingApiKey(false);
    }
  };

  const handleRevokeApiKey = async () => {
    setIsRevokingApiKey(true);
    setMessage(null);
    try {
      await api.delete("/api/auth/api-key");
      setMessage({ type: "success", text: "API key revoked successfully" });
      setShowRevokeConfirm(false);
      await fetchApiKeyInfo();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to revoke API key",
      });
    } finally {
      setIsRevokingApiKey(false);
    }
  };

  const handleCopyApiKey = async () => {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const closeGenerateModal = () => {
    setShowGenerateModal(false);
    setGeneratedKey(null);
    setCopied(false);
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

      {/* API Key Management */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">API Key</h2>
        <p className="text-gray-600 text-sm mb-4">
          Generate an API key to programmatically access the Swarm Vault API. Use this instead of
          exporting your wallet private key for automated trading.
        </p>

        {isLoadingApiKey ? (
          <div className="flex items-center gap-2 text-gray-500">
            <LoadingSpinner size="sm" />
            <span>Loading API key info...</span>
          </div>
        ) : apiKeyInfo?.hasApiKey ? (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">API Key</p>
                  <p className="font-mono text-sm text-gray-900 mt-1">
                    {apiKeyInfo.prefix}...
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Created</p>
                  <p className="text-sm text-gray-900 mt-1">
                    {apiKeyInfo.createdAt
                      ? new Date(apiKeyInfo.createdAt).toLocaleDateString()
                      : "Unknown"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleGenerateApiKey}
                disabled={isGeneratingApiKey}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingApiKey ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    Regenerating...
                  </span>
                ) : (
                  "Regenerate Key"
                )}
              </button>
              <button
                onClick={() => setShowRevokeConfirm(true)}
                disabled={isRevokingApiKey}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Revoke Key
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerateApiKey}
            disabled={isGeneratingApiKey}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isGeneratingApiKey ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Generating...
              </span>
            ) : (
              "Generate API Key"
            )}
          </button>
        )}
      </div>

      {/* Generated API Key Modal */}
      {showGenerateModal && generatedKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">API Key Generated</h3>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-amber-800 text-sm font-medium">
                This is the only time you'll see this key!
              </p>
              <p className="text-amber-700 text-sm mt-1">
                Copy it now and store it securely. You won't be able to retrieve it again.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your API Key
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedKey.apiKey}
                  className="flex-1 font-mono text-sm bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900"
                />
                <button
                  onClick={handleCopyApiKey}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    copied
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-gray-700 text-sm font-medium mb-2">Usage</p>
              <p className="text-gray-600 text-sm font-mono">
                Authorization: Bearer {generatedKey.prefix}...
              </p>
            </div>

            <button
              onClick={closeGenerateModal}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Revoke API Key</h3>
            </div>

            <p className="text-gray-600 mb-6">
              Are you sure you want to revoke your API key? Any applications using this key will
              immediately lose access. You can generate a new key at any time.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRevokeConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleRevokeApiKey}
                disabled={isRevokingApiKey}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isRevokingApiKey ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    Revoking...
                  </span>
                ) : (
                  "Revoke Key"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
