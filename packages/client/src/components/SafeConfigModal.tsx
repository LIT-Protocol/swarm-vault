import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface SafeConfigModalProps {
  swarmId: string;
  currentSafeAddress: string | null;
  currentRequireSafeSignoff: boolean;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export default function SafeConfigModal({
  swarmId,
  currentSafeAddress,
  currentRequireSafeSignoff,
  isOpen,
  onClose,
  onUpdated,
}: SafeConfigModalProps) {
  const [safeAddress, setSafeAddress] = useState(currentSafeAddress || "");
  const [requireSafeSignoff, setRequireSafeSignoff] = useState(currentRequireSafeSignoff);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSafeAddress(currentSafeAddress || "");
      setRequireSafeSignoff(currentRequireSafeSignoff);
      setError(null);
    }
  }, [isOpen, currentSafeAddress, currentRequireSafeSignoff]);

  // Strip network prefix from SAFE address (e.g., "base:0x..." -> "0x...")
  const parseSafeAddress = (address: string): string => {
    if (!address) return "";
    // Handle format like "base:0x..." or "eth:0x..."
    const colonIndex = address.indexOf(":");
    if (colonIndex !== -1) {
      return address.slice(colonIndex + 1);
    }
    return address;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Parse and validate address format
    const cleanAddress = parseSafeAddress(safeAddress.trim());

    if (cleanAddress && !cleanAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError("Invalid SAFE address format");
      return;
    }

    // Can't require signoff without address
    if (requireSafeSignoff && !cleanAddress) {
      setError("Please enter a SAFE address to enable sign-off requirement");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await api.patch(`/api/swarms/${swarmId}/safe`, {
        safeAddress: cleanAddress || null,
        requireSafeSignoff,
      });

      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update SAFE configuration");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm("Are you sure you want to disable SAFE sign-off? Managers will be able to execute actions directly.")) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await api.patch(`/api/swarms/${swarmId}/safe`, {
        safeAddress: null,
        requireSafeSignoff: false,
      });

      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable SAFE");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black bg-opacity-25"
          onClick={onClose}
        />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">
              Gnosis SAFE Configuration
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Multi-sig Approval</p>
                  <p>
                    When enabled, manager actions (swaps, transactions) will require
                    approval from your Gnosis SAFE before execution.
                  </p>
                </div>
              </div>
            </div>

            {/* SAFE Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SAFE Address
              </label>
              <input
                type="text"
                value={safeAddress}
                onChange={(e) => setSafeAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter your Gnosis SAFE address on Base
              </p>
            </div>

            {/* Require Sign-off Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Require SAFE Sign-off
                </label>
                <p className="text-xs text-gray-500">
                  All actions must be approved by SAFE before execution
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequireSafeSignoff(!requireSafeSignoff)}
                disabled={!safeAddress}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  requireSafeSignoff ? "bg-blue-600" : "bg-gray-200"
                } ${!safeAddress ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    requireSafeSignoff ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              {currentRequireSafeSignoff && (
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 rounded-lg disabled:opacity-50"
                >
                  Disable SAFE
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
