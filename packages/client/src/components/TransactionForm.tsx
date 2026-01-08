import { useState } from "react";
import { api } from "../lib/api";

interface TransactionFormProps {
  swarmId: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

type Mode = "abi" | "raw";

interface ABIFunction {
  name: string;
  inputs: { name: string; type: string }[];
}

const PLACEHOLDER_OPTIONS = [
  { label: "Wallet Address", value: "{{walletAddress}}", description: "Agent wallet address" },
  { label: "ETH Balance", value: "{{ethBalance}}", description: "Full ETH balance in wei" },
  { label: "Block Timestamp", value: "{{blockTimestamp}}", description: "Current block timestamp" },
];

const COMMON_ABIS: Record<string, unknown[]> = {
  "ERC20 Transfer": [
    {
      name: "transfer",
      type: "function",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ],
  "ERC20 Approve": [
    {
      name: "approve",
      type: "function",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ name: "", type: "bool" }],
    },
  ],
  "WETH Deposit": [
    {
      name: "deposit",
      type: "function",
      inputs: [],
      outputs: [],
    },
  ],
  "WETH Withdraw": [
    {
      name: "withdraw",
      type: "function",
      inputs: [{ name: "wad", type: "uint256" }],
      outputs: [],
    },
  ],
};

export default function TransactionForm({
  swarmId,
  isOpen,
  onClose,
  onSubmitted,
}: TransactionFormProps) {
  const [mode, setMode] = useState<Mode>("abi");
  const [contractAddress, setContractAddress] = useState("");
  const [value, setValue] = useState("0");

  // ABI mode state
  const [abiText, setAbiText] = useState("");
  const [parsedFunctions, setParsedFunctions] = useState<ABIFunction[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<string>("");
  const [args, setArgs] = useState<string[]>([]);

  // Raw mode state
  const [rawData, setRawData] = useState("0x");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPlaceholderHelp, setShowPlaceholderHelp] = useState(false);

  const handleAbiChange = (text: string) => {
    setAbiText(text);
    setError(null);

    if (!text.trim()) {
      setParsedFunctions([]);
      setSelectedFunction("");
      setArgs([]);
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const abiArray = Array.isArray(parsed) ? parsed : [parsed];

      const functions = abiArray
        .filter((item: { type?: string }) => item.type === "function")
        .map((item: { name: string; inputs?: { name: string; type: string }[] }) => ({
          name: item.name,
          inputs: item.inputs || [],
        }));

      setParsedFunctions(functions);
      if (functions.length > 0 && !selectedFunction) {
        setSelectedFunction(functions[0].name);
        setArgs(functions[0].inputs.map(() => ""));
      }
    } catch (err) {
      setError("Invalid JSON format");
      setParsedFunctions([]);
    }
  };

  const handleFunctionSelect = (funcName: string) => {
    setSelectedFunction(funcName);
    const func = parsedFunctions.find((f) => f.name === funcName);
    if (func) {
      setArgs(func.inputs.map(() => ""));
    }
  };

  const handleArgChange = (index: number, value: string) => {
    const newArgs = [...args];
    newArgs[index] = value;
    setArgs(newArgs);
  };

  const loadCommonAbi = (name: string) => {
    const abi = COMMON_ABIS[name];
    if (abi) {
      setAbiText(JSON.stringify(abi, null, 2));
      handleAbiChange(JSON.stringify(abi));
    }
  };

  const insertPlaceholder = (placeholder: string, targetIndex?: number) => {
    if (mode === "raw") {
      setRawData((prev) => prev + placeholder);
    } else if (targetIndex !== undefined) {
      const newArgs = [...args];
      newArgs[targetIndex] = (newArgs[targetIndex] || "") + placeholder;
      setArgs(newArgs);
    }
  };

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (!contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      setError("Invalid contract address");
      return;
    }

    let template;

    if (mode === "abi") {
      if (!abiText.trim()) {
        setError("ABI is required");
        return;
      }
      if (!selectedFunction) {
        setError("Please select a function");
        return;
      }

      try {
        const parsedAbi = JSON.parse(abiText);
        template = {
          mode: "abi" as const,
          contractAddress,
          abi: Array.isArray(parsedAbi) ? parsedAbi : [parsedAbi],
          functionName: selectedFunction,
          args: args,
          value,
        };
      } catch {
        setError("Invalid ABI JSON");
        return;
      }
    } else {
      if (!rawData.match(/^0x[a-fA-F0-9]*$/)) {
        setError("Invalid hex data");
        return;
      }

      template = {
        mode: "raw" as const,
        contractAddress,
        data: rawData,
        value,
      };
    }

    setIsSubmitting(true);

    try {
      await api.post(`/api/swarms/${swarmId}/transactions`, { template });
      onSubmitted();
      onClose();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setMode("abi");
    setContractAddress("");
    setValue("0");
    setAbiText("");
    setParsedFunctions([]);
    setSelectedFunction("");
    setArgs([]);
    setRawData("0x");
    setError(null);
  };

  if (!isOpen) return null;

  const selectedFunc = parsedFunctions.find((f) => f.name === selectedFunction);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              New Transaction
            </h2>
            <button
              onClick={() => {
                onClose();
                resetForm();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Mode Toggle */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mode
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("abi")}
                className={`px-4 py-2 text-sm font-medium rounded-lg ${
                  mode === "abi"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                ABI Mode
              </button>
              <button
                type="button"
                onClick={() => setMode("raw")}
                className={`px-4 py-2 text-sm font-medium rounded-lg ${
                  mode === "raw"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Raw Calldata
              </button>
            </div>
          </div>

          {/* Contract Address */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contract Address
            </label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>

          {/* ETH Value */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ETH Value (wei)
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0 or {{ethBalance}}"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use 0 for no ETH. Use placeholders like {"{{ethBalance}}"} for dynamic values.
            </p>
          </div>

          {mode === "abi" ? (
            <>
              {/* Common ABIs */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick Load
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(COMMON_ABIS).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => loadCommonAbi(name)}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* ABI Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contract ABI (JSON)
                </label>
                <textarea
                  value={abiText}
                  onChange={(e) => handleAbiChange(e.target.value)}
                  rows={4}
                  placeholder='[{"name": "transfer", "type": "function", "inputs": [...]}]'
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
                />
              </div>

              {/* Function Selector */}
              {parsedFunctions.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Function
                  </label>
                  <select
                    value={selectedFunction}
                    onChange={(e) => handleFunctionSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    {parsedFunctions.map((func) => (
                      <option key={func.name} value={func.name}>
                        {func.name}({func.inputs.map((i) => i.type).join(", ")})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Function Arguments */}
              {selectedFunc && selectedFunc.inputs.length > 0 && (
                <div className="mb-4 space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Arguments
                  </label>
                  {selectedFunc.inputs.map((input, index) => (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs text-gray-500">
                          {input.name} ({input.type})
                        </label>
                        <div className="flex gap-1">
                          {PLACEHOLDER_OPTIONS.slice(0, 2).map((p) => (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => insertPlaceholder(p.value, index)}
                              className="text-xs text-blue-600 hover:text-blue-700"
                              title={p.description}
                            >
                              +{p.label.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={args[index] || ""}
                        onChange={(e) => handleArgChange(index, e.target.value)}
                        placeholder={`${input.type} value or placeholder`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Raw Calldata */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calldata (hex)
                </label>
                <textarea
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  rows={3}
                  placeholder="0x..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />
              </div>
            </>
          )}

          {/* Placeholder Help */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowPlaceholderHelp(!showPlaceholderHelp)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {showPlaceholderHelp ? "Hide" : "Show"} placeholder reference
            </button>
            {showPlaceholderHelp && (
              <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                <p><code className="text-blue-600">{"{{walletAddress}}"}</code> - Agent wallet address</p>
                <p><code className="text-blue-600">{"{{ethBalance}}"}</code> - ETH balance in wei</p>
                <p><code className="text-blue-600">{"{{tokenBalance:0x...}}"}</code> - Token balance for address</p>
                <p><code className="text-blue-600">{"{{percentage:ethBalance:50}}"}</code> - 50% of ETH balance</p>
                <p><code className="text-blue-600">{"{{percentage:tokenBalance:0x...:100}}"}</code> - 100% of token balance</p>
                <p><code className="text-blue-600">{"{{blockTimestamp}}"}</code> - Current block timestamp</p>
                <p><code className="text-blue-600">{"{{deadline:300}}"}</code> - Timestamp + 300 seconds</p>
                <p><code className="text-blue-600">{"{{slippage:ethBalance:5}}"}</code> - ETH balance minus 5%</p>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                resetForm();
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Execute Transaction"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
