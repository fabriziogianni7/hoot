// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.

import React, { useState } from 'react'
import { NumberSquareFiveIcon, CheckCircle } from '@phosphor-icons/react'
import { hexToBytes } from 'viem'
import CardContent from '../components/CardContent'
import { useWizard, WizardStep, QuestionOptions } from '../../context/WizardContext'

/**
 * Guess component - Fifth step in the Enclave wizard flow
 *
 * This component displays the previously stored question options and allows the user
 * to guess which one is the correct answer. The user selects one option and it gets
 * encrypted and submitted for verification.
 */
const Guess: React.FC = () => {
  const [selectedGuess, setSelectedGuess] = useState<'option1' | 'option2' | null>(null)
  const { e3State, setCurrentStep, setLastTransactionHash, setInputPublishError, setInputPublishSuccess, setSubmittedInputs, sdk, submittedInputs } =
    useWizard()
  const { publishInput } = sdk

  const handleGuessSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('handleGuessSubmit')
    if (!selectedGuess || !submittedInputs || e3State.publicKey === null || e3State.id === null) {
      console.log('Refusing to submit guess because no guess selected or missing data')
      return
    }

    setCurrentStep(WizardStep.ENCRYPT_SUBMIT)
    setInputPublishError(null)
    setInputPublishSuccess(false)

    try {
      // Get the correct answer ID and guess ID
      // Use different values to make verification easier
      const correctAnswerId = submittedInputs.correctAnswer === 'option1' ? 10 : 20
      const guessId = selectedGuess === 'option1' ? 10 : 20

      // Convert hex public key to bytes
      const publicKeyBytes = hexToBytes(e3State.publicKey)

      // Encrypt both the correct answer ID and the guess ID
      const encryptedCorrectAnswerId = await sdk.sdk?.encryptNumber(BigInt(correctAnswerId), publicKeyBytes)
      const encryptedGuessId = await sdk.sdk?.encryptNumber(BigInt(guessId), publicKeyBytes)

      if (!encryptedCorrectAnswerId || !encryptedGuessId) {
        throw new Error('Failed to encrypt IDs')
      }

      // Publish first input (correct answer ID)
      await publishInput(e3State.id, `0x${Array.from(encryptedCorrectAnswerId, (b: number) => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`)

      // Publish second input (user's guess ID)
      const hash2 = await publishInput(
        e3State.id,
        `0x${Array.from(encryptedGuessId, (b: number) => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`,
      )

      setLastTransactionHash(hash2)
      setInputPublishSuccess(true)
    } catch (error) {
      setInputPublishError(error instanceof Error ? error.message : 'Failed to encrypt and publish guess')
      console.error('Error encrypting/publishing guess:', error)
    }
  }

  return (
    <CardContent>
      <form onSubmit={handleGuessSubmit} className='space-y-6 text-center'>
        <div className='flex justify-center'>
          <NumberSquareFiveIcon size={48} className='text-enclave-400' />
        </div>
        <p className='text-base font-extrabold uppercase text-slate-600/50'>Step 5: Make Your Guess</p>
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold text-slate-700'>Privacy-Preserving Guess</h3>
          <p className='leading-relaxed text-slate-600'>
            Now make your guess! Select which of the two amounts you think is the correct answer to the question.
            Your guess will be encrypted and submitted for verification.
          </p>

          <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
            <p className='text-sm text-slate-600'>
              <strong>Privacy Guarantee:</strong> Your guess remains private throughout the process -
              only the final verification result is revealed.
            </p>
          </div>

          {submittedInputs && (
            <div className='rounded-lg border-2 border-slate-200 bg-white p-6'>
              <h4 className='mb-4 text-lg font-medium text-slate-800'>
                How much dollars do I have in my pocket?
              </h4>

              <div className='space-y-3'>
                <div
                  className={`cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 ${
                    selectedGuess === 'option1'
                      ? 'border-enclave-400 bg-enclave-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                  onClick={() => setSelectedGuess('option1')}
                >
                  <div className='flex items-center space-x-3'>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      selectedGuess === 'option1'
                        ? 'border-enclave-400 bg-enclave-400'
                        : 'border-slate-300'
                    }`}>
                      {selectedGuess === 'option1' && (
                        <CheckCircle size={16} className='text-white' weight='fill' />
                      )}
                    </div>
                    <div className='text-left'>
                      <p className='font-medium text-slate-800'>${submittedInputs.option1}</p>
                      <p className='text-sm text-slate-500'>Option A</p>
                    </div>
                  </div>
                </div>

                <div
                  className={`cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 ${
                    selectedGuess === 'option2'
                      ? 'border-enclave-400 bg-enclave-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                  onClick={() => setSelectedGuess('option2')}
                >
                  <div className='flex items-center space-x-3'>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      selectedGuess === 'option2'
                        ? 'border-enclave-400 bg-enclave-400'
                        : 'border-slate-300'
                    }`}>
                      {selectedGuess === 'option2' && (
                        <CheckCircle size={16} className='text-white' weight='fill' />
                      )}
                    </div>
                    <div className='text-left'>
                      <p className='font-medium text-slate-800'>${submittedInputs.option2}</p>
                      <p className='text-sm text-slate-500'>Option B</p>
                    </div>
                  </div>
                </div>
              </div>

              {selectedGuess && (
                <div className='mt-4 rounded-lg border border-enclave-200 bg-enclave-50 p-3'>
                  <p className='text-sm text-slate-600'>
                    <strong>Your guess:</strong> ${selectedGuess === 'option1' ? submittedInputs.option1 : submittedInputs.option2}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type='submit'
          disabled={!selectedGuess || !e3State.isActivated}
          className='w-full rounded-lg bg-enclave-400 px-6 py-3 font-semibold text-slate-800 transition-all duration-200 hover:bg-enclave-300 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500'
        >
          {!e3State.isActivated ? 'E3 Not Activated Yet' : !selectedGuess ? 'Make Your Guess' : 'Submit Guess'}
        </button>
      </form>
    </CardContent>
  )
}

export default Guess
