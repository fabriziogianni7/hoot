"use client";

interface SignInPromptProps {
  onAccept: () => void;
  onDecline: () => void;
}

export default function SignInPrompt({ onAccept, onDecline }: SignInPromptProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-black border border-white rounded-t-lg p-6 w-full max-w-md mx-4 mb-0 transform transition-transform duration-300 ease-out animate-slide-up">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Welcome to Hoot! 🎯</h3>
            <p className="text-gray-300">
              To play Hoot!, you need to connect your wallet and sign in.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={onAccept}
              className="w-full py-3 px-4 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Ok, sure!
            </button>

            <button
              onClick={onDecline}
              className="w-full py-3 px-4 rounded-lg font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors border border-gray-600"
            >
              Next time
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
