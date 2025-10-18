// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.

import React from 'react'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import CardContent from '../components/CardContent'
import { useWizard, QuestionOptions } from '../../context/WizardContext'

/**
 * Results component - Sixth step in the Enclave wizard flow
 *
 * This component displays the results of the quiz computation, showing whether the answer was correct.
 */
const Results: React.FC = () => {
  const { submittedInputs, result, e3State, lastTransactionHash, handleReset } = useWizard()

  const onReset = () => {
    handleReset()
  }

  // Determine if guess was correct based on the sum result
  // correct + guess = 10+10=20, 10+20=30, 20+10=30, 20+20=40
  // 20 and 40 = correct, 30 = incorrect
  const isCorrect = result == 0 
  const selectedAnswer = submittedInputs?.correctAnswer === 'option1'
    ? submittedInputs.option1
    : submittedInputs?.option2

  return (
    <CardContent>
      <div className='space-y-6 text-center'>
        <div className='flex justify-center'>
          {isCorrect ? (
            <>
            <CheckCircleIcon size={48} className='text-green-500' />
            </>
          ) : (
            <>
              <XCircleIcon size={48} className='text-red-500' />
            </>
          )}
        </div>
        <p className='text-base font-extrabold uppercase text-slate-600/50'>Step 6: Results</p>
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold text-slate-700'>Quiz Complete!</h3>

          <div className={`rounded-lg border p-6 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className='space-y-3'>
              <p className='text-lg font-semibold text-slate-700'>
                <strong>Your Quiz Result:</strong>
              </p>
              <div className='space-y-2'>
                <p className={`text-2xl font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  {isCorrect ? '✅ Correct!' : '❌ Incorrect'}
                </p>
                {submittedInputs && (
                  <div className='text-sm text-slate-600'>
                    <p><strong>Question:</strong> How much dollars do I have in my pocket?</p>
                    <p><strong>Your answer:</strong> ${selectedAnswer}</p>
                    <p><strong>Options were:</strong> ${submittedInputs.option1} or ${submittedInputs.option2}</p>
                  </div>
                )}
              </div>
              {result !== null && (
                <p className='text-sm text-slate-600'>
                  ✅ Verified securely using FHE with distributed key decryption!
                </p>
              )}
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 text-left'>
            <div className='rounded-lg border border-slate-200 bg-slate-50 p-4'>
              <p className='text-sm text-slate-600'>
                <strong>E3 ID:</strong> {String(e3State.id)}
              </p>
            </div>
            {lastTransactionHash && (
              <div className='rounded-lg border border-slate-200 bg-slate-50 p-4'>
                <p className='text-sm text-slate-600'>
                  <strong>Transaction:</strong> {lastTransactionHash.slice(0, 10)}...{lastTransactionHash.slice(-8)}
                </p>
              </div>
            )}
            {e3State.plaintextOutput && (
              <div className='rounded-lg border border-slate-200 bg-slate-50 p-4'>
                <p className='text-sm text-slate-600'>
                  <strong>Raw Output:</strong> {e3State.plaintextOutput.slice(0, 20)}...
                </p>
              </div>
            )}
          </div>

          <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
            <p className='text-sm text-slate-600'>
              <strong>🔒 Cryptographic Guarantees:</strong> Your inputs remained encrypted throughout the entire process. The Ciphernode
              Committee used distributed key cryptography to decrypt only the verified output, ensuring data privacy, data integrity, and
              correct execution.
            </p>
          </div>
        </div>

        <button
          onClick={onReset}
          className='w-full rounded-lg bg-enclave-400 px-6 py-3 font-semibold text-slate-800 transition-all duration-200 hover:bg-enclave-300 hover:shadow-md'
        >
          Start New Computation
        </button>
      </div>
    </CardContent>
  )
}

export default Results
