// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.

import React, { useState } from 'react'
import { NumberSquareOneIcon, CheckCircle } from '@phosphor-icons/react'
import CardContent from '../components/CardContent'
import { useWizard, WizardStep, QuestionOptions } from '../../context/WizardContext'

/**
 * EnterInputs component - Fourth step in the Enclave wizard flow
 *
 * This component presents a predefined question with two amount options.
 * The user selects which option is correct, and only the correct answer ID is encrypted and published.
 */
const EnterInputs: React.FC = () => {
  // Predefined question options (one correct, one incorrect)
  const questionOptions = {
    option1: '42',
    option2: '57'
  }

  const [selectedCorrectAnswer, setSelectedCorrectAnswer] = useState<'option1' | 'option2' | null>(null)
  const { e3State, setCurrentStep, setInputPublishError, setInputPublishSuccess, setSubmittedInputs } =
    useWizard()

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('handleInputSubmit')
    if (!selectedCorrectAnswer || e3State.publicKey === null || e3State.id === null) {
      console.log('Refusing to submit input because no correct answer selected or publickey is null or id is null')
      return
    }

    setCurrentStep(WizardStep.GUESS)
    setInputPublishError(null)
    setInputPublishSuccess(false)

    try {
      // Store the question options in context for the Results component
      const questionData: QuestionOptions = {
        option1: questionOptions.option1,
        option2: questionOptions.option2,
        correctAnswer: selectedCorrectAnswer
      }
      setSubmittedInputs(questionData)

      // For now, don't publish anything in EnterInputs - just store the data
      // The Guess step will publish both inputs
      setInputPublishSuccess(true)
    } catch (error) {
      setInputPublishError(error instanceof Error ? error.message : 'Failed to process answer selection')
      console.error('Error processing answer selection:', error)
    }
  }

  return (
    <CardContent>
      <form onSubmit={handleInputSubmit} className='space-y-6 text-center'>
        <div className='flex justify-center'>
          <NumberSquareOneIcon size={48} className='text-enclave-400' />
        </div>
        <p className='text-base font-extrabold uppercase text-slate-600/50'>Step 4: Answer the Question</p>
        <div className='space-y-4'>
          <h3 className='text-lg font-semibold text-slate-700'>Privacy-Preserving Quiz</h3>
          <p className='leading-relaxed text-slate-600'>
            Answer the following question using fully homomorphic encryption (FHE). Your answer will be encrypted
            locally and remain private throughout the entire process.
          </p>

          <div className='rounded-lg border border-blue-200 bg-blue-50 p-4'>
            <p className='text-sm text-slate-600'>
              <strong>Privacy Guarantee:</strong> FHE allows computation on encrypted data. Your answer remains private throughout the
              process - only the final verification result is revealed.
            </p>
          </div>

          <div className='rounded-lg border-2 border-slate-200 bg-white p-6'>
            <h4 className='mb-4 text-lg font-medium text-slate-800'>
              How much dollars do I have in my pocket?
            </h4>

            <div className='space-y-3'>
              <div
                className={`cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 ${
                  selectedCorrectAnswer === 'option1'
                    ? 'border-enclave-400 bg-enclave-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                onClick={() => setSelectedCorrectAnswer('option1')}
              >
                <div className='flex items-center space-x-3'>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    selectedCorrectAnswer === 'option1'
                      ? 'border-enclave-400 bg-enclave-400'
                      : 'border-slate-300'
                  }`}>
                    {selectedCorrectAnswer === 'option1' && (
                      <CheckCircle size={16} className='text-white' weight='fill' />
                    )}
                  </div>
                  <div className='text-left'>
                    <p className='font-medium text-slate-800'>${questionOptions.option1}</p>
                    <p className='text-sm text-slate-500'>Option A</p>
                  </div>
                </div>
              </div>

              <div
                className={`cursor-pointer rounded-lg border-2 p-4 transition-all duration-200 ${
                  selectedCorrectAnswer === 'option2'
                    ? 'border-enclave-400 bg-enclave-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                onClick={() => setSelectedCorrectAnswer('option2')}
              >
                <div className='flex items-center space-x-3'>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    selectedCorrectAnswer === 'option2'
                      ? 'border-enclave-400 bg-enclave-400'
                      : 'border-slate-300'
                  }`}>
                    {selectedCorrectAnswer === 'option2' && (
                      <CheckCircle size={16} className='text-white' weight='fill' />
                    )}
                  </div>
                  <div className='text-left'>
                    <p className='font-medium text-slate-800'>${questionOptions.option2}</p>
                    <p className='text-sm text-slate-500'>Option B</p>
                  </div>
                </div>
              </div>
            </div>

            {selectedCorrectAnswer && (
              <div className='mt-4 rounded-lg border border-enclave-200 bg-enclave-50 p-3'>
                <p className='text-sm text-slate-600'>
                  <strong>You selected:</strong> ${selectedCorrectAnswer === 'option1' ? questionOptions.option1 : questionOptions.option2}
                </p>
              </div>
            )}
          </div>
        </div>

        <button
          type='submit'
          disabled={!selectedCorrectAnswer || !e3State.isActivated}
          className='w-full rounded-lg bg-enclave-400 px-6 py-3 font-semibold text-slate-800 transition-all duration-200 hover:bg-enclave-300 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500'
        >
          {!e3State.isActivated ? 'E3 Not Activated Yet' : !selectedCorrectAnswer ? 'Select an Answer' : 'Proceed to Encryption'}
        </button>
      </form>
    </CardContent>
  )
}

export default EnterInputs
