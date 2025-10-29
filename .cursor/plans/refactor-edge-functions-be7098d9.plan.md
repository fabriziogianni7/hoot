<!-- be7098d9-f7cd-48ac-8c1d-d83742e33a36 3e37be47-96d6-43f3-8c7e-0c07012e720f -->
# Refactor Edge Functions for Better Readability and Error Management

## Overview

Refactor the four Supabase edge functions (`create-quiz`, `join-game`, `submit-answer`, `complete-game`) to improve code organization, error handling, and maintainability while keeping the same API response structure.

## Key Changes

### 1. Create Shared Utilities (`_shared/` folder)

**File: `_shared/cors.ts`**

- Export `corsHeaders` constant
- Export `handleCorsPreFlight()` helper function

**File: `_shared/response.ts`**

- `successResponse(data, status)` - standardized success responses
- `errorResponse(error, status)` - standardized error responses with consistent structure
- Error types enum for categorization

**File: `_shared/validation.ts`**

- `validateRequired(fields)` - check required fields presence
- `validateAddress(address)` - validate Ethereum addresses
- `compareAddresses(addr1, addr2)` - case-insensitive address comparison

**File: `_shared/types.ts`**

- Common interfaces (CreateQuizRequest, JoinGameRequest, SubmitAnswerRequest, etc.)
- Database types for better type safety

**File: `_shared/supabase.ts`**

- `initSupabaseClient(useServiceRole)` - centralized client initialization
- `fetchWithErrorHandling()` - wrapper for Supabase queries with consistent error handling

**File: `_shared/constants.ts`**

- Prize distribution percentages (FIRST_PLACE_PCT, SECOND_PLACE_PCT, etc.)
- Point calculation constants (BASE_POINTS, TIME_BONUS_MULTIPLIER)
- Game status constants
- Contract ABI definitions

### 2. Refactor `create-quiz/index.ts`

**Improvements:**

- Extract validation logic into separate `validateQuizData()` function
- Use shared error/success response helpers
- Add clearer error messages for each validation failure
- Extract quiz creation and questions insertion into separate functions
- Add rollback documentation in comments

**Key fixes:**

- Better error context in responses
- Consistent logging format

### 3. Refactor `join-game/index.ts`

**Improvements:**

- Extract game session validation into `validateGameSession()` function
- Extract player checks into `checkExistingPlayer()` function
- Use shared `compareAddresses()` for creator detection
- Simplify nested logic with early returns
- Extract creator tracking update into separate function

**Key fixes:**

- Clearer separation between reconnection and new join flows
- Better error messages for each rejection case

### 4. Refactor `submit-answer/index.ts`

**Critical bug fix:**

- Line 59: Remove `* 1000` - `time_limit` is already in seconds, should not multiply again

**Improvements:**

- Extract `calculatePoints()` function with clear calculation logic
- Extract `validateAnswerSubmission()` function
- Use constants for point calculations (BASE_POINTS=100, TIME_BONUS_MULTIPLIER=1.5)
- Separate score update logic into `updatePlayerScore()` function
- Better variable naming (timeLimitMs instead of timeLimitSeconds)

### 5. Refactor `complete-game/index.ts`

**Improvements:**

- Extract authorization check into `verifyCreatorAuthorization()`
- Extract game completion validation into `validateGameCompletion()`
- Extract prize calculation into `calculatePrizeDistribution()`
- Extract blockchain interaction into `distributePrizesOnChain()`
- Break down long function into smaller, testable units
- Move contract ABI to shared constants
- Simplify nested try-catch blocks
- Add clear section comments for major steps

**Key fixes:**

- Better error context at each step
- Consistent logging with clear prefixes
- Fix confusing prize amount calculation (line 271, 293)

### 6. Error Handling Pattern

All functions will follow:

```typescript
try {
  // Validate inputs
  // Fetch required data
  // Execute business logic
  // Return success
} catch (error) {
  console.error('Context:', error)
  return errorResponse(error.message || 'Internal server error', 500)
}
```

## Files to Create

- `backend/supabase/functions/_shared/cors.ts`
- `backend/supabase/functions/_shared/response.ts`
- `backend/supabase/functions/_shared/validation.ts`
- `backend/supabase/functions/_shared/types.ts`
- `backend/supabase/functions/_shared/supabase.ts`
- `backend/supabase/functions/_shared/constants.ts`

## Files to Modify

- `backend/supabase/functions/create-quiz/index.ts`
- `backend/supabase/functions/join-game/index.ts`
- `backend/supabase/functions/submit-answer/index.ts`
- `backend/supabase/functions/complete-game/index.ts`

### 7. Logging Cleanup

**Remove debug logging:**

- Remove excessive console.log statements with emoji prefixes (📥, ✅, ❌, 🔍, etc.)
- Remove verbose data dumps (e.g., JSON.stringify of full objects)
- Keep only essential error logging in catch blocks
- Keep minimal operational logs for critical operations (transaction hashes, completion events)

**Rationale:** Debug logs clutter production logs and may expose sensitive data.

## Validation

- All functions maintain exact API response structure
- No breaking changes to endpoints
- Improved error messages provide better debugging context
- Code is more modular and testable
- Production-ready logging (no debug clutter)

### To-dos

- [ ] Create shared utility files in _shared/ folder (cors, response, validation, types, supabase, constants)
- [ ] Refactor create-quiz/index.ts using shared utilities and extract validation/business logic
- [ ] Refactor join-game/index.ts with improved structure and creator detection logic
- [ ] Refactor submit-answer/index.ts, fix time limit bug, extract point calculation
- [ ] Refactor complete-game/index.ts, break down into smaller functions, improve blockchain interaction