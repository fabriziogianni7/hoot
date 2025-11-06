"use client";

interface SignatureConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SignatureConfirmationModal({
  isOpen,
  onConfirm,
  onCancel
}: SignatureConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-black border border-white rounded-t-lg p-6 w-full max-w-md mx-4 mb-0 transform transition-transform duration-300 ease-out animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Sign In Required 🔐</h3>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <p className="text-gray-300 mb-4">
              To continue, you'll need to sign a message with your wallet to authenticate.
            </p>
            <p className="text-sm text-gray-400">
              This is a standard security measure and won't cost any gas.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 px-4 rounded-lg font-medium text-gray-300 border border-gray-600 hover:bg-gray-800 transition-colors"
            >
              Next time please!
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 px-4 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              Yes, sure
            </button>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">
              Your signature is only used for authentication and won't be stored.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
