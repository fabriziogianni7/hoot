# Quiz to User Linking

## Overview

Quizzes are now properly linked to authenticated users in the `auth.users` table through multiple correlation points:

## Database Relationships

### Primary Link: `user_id` (Foreign Key)
- **Column**: `quizzes.user_id`
- **References**: `auth.users(id)`
- **Type**: UUID foreign key with ON DELETE SET NULL
- **Purpose**: Direct relationship to the authenticated Supabase user who created the quiz
- **Populated**: Automatically by the edge function from the authenticated session

### Secondary Correlations

#### 1. Farcaster ID (`user_fid`)
- **Column**: `quizzes.user_fid`
- **Storage**: Also stored in `auth.users.user_metadata.fid` and `auth.users.raw_user_meta_data.fid`
- **Purpose**: Links quiz to Farcaster user identity
- **Use case**: Can query quizzes by Farcaster ID even without direct auth

#### 2. Wallet Address (`creator_address`)
- **Column**: `quizzes.creator_address`
- **Purpose**: Links quiz to blockchain wallet address
- **Use case**: Essential for on-chain operations and prize distribution

#### 3. Network ID (`network_id`)
- **Column**: `quizzes.network_id`
- **Purpose**: Tracks which blockchain network the quiz is deployed on
- **Use case**: Multi-chain support

## Data Flow

### Quiz Creation
1. User authenticates via Farcaster (anonymous sign-in with metadata)
2. Frontend calls `createQuizOnBackend()` with `userAddress`, `userFid`, and `networkId`
3. Edge function extracts `user_id` from authenticated session
4. Quiz record is created with:
   - `user_id` → from `auth.users(id)` 
   - `user_fid` → from request (also in auth.users metadata)
   - `creator_address` → from wallet connection
   - `network_id` → from current network

### Querying Quizzes

#### By authenticated user:
```sql
SELECT * FROM quizzes WHERE user_id = auth.uid()
```

#### By Farcaster ID:
```sql
SELECT * FROM quizzes WHERE user_fid = '12345'
```

#### By wallet address:
```sql
SELECT * FROM quizzes WHERE creator_address = '0x...'
```

#### Join with user metadata:
```sql
SELECT q.*, u.email, u.user_metadata 
FROM quizzes q
LEFT JOIN auth.users u ON q.user_id = u.id
WHERE q.status = 'active'
```

## Row Level Security (RLS)

### Policies
1. **Public viewing**: Everyone can view quizzes (kept for game functionality)
2. **User viewing**: Users can specifically query their own quizzes via `user_id`
3. **Creation**: Only authenticated users can create quizzes (user_id must match auth.uid())
4. **Updates**: Users can only update their own quizzes (via user_id or creator_address)

### Benefits
- Proper data isolation
- Secure multi-tenancy
- Audit trail of quiz creators

## Migration Order

1. `20241220000004_add_network_and_fid.sql` - Adds network_id and user_fid
2. `20241220000005_link_quiz_to_auth_user.sql` - Adds user_id foreign key and RLS policies

## Usage in Frontend

The frontend doesn't need to manually pass `user_id` - it's automatically extracted from the authenticated session in the edge function. Just ensure the user is authenticated before creating a quiz:

```typescript
// User authentication is handled by Farcaster
await signInSupabase()

// Create quiz - user_id is automatically added
const quizId = await createQuizOnBackend(
  quiz,
  contractAddress,
  chain.id,        // networkId
  userFid,         // from Farcaster
  address,         // creator_address from wallet
  prizeAmount,
  prizeToken
)
```

## Benefits

1. ✅ **Proper data relationships** - Foreign key ensures referential integrity
2. ✅ **Multi-factor correlation** - Can query by user_id, fid, or wallet address
3. ✅ **Security** - RLS policies protect user data
4. ✅ **Auditability** - Know exactly who created each quiz
5. ✅ **Flexibility** - Support for both authenticated and legacy/anonymous quizzes

