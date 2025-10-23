import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create admin client with service role key (only available server-side)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role key - NEVER expose to client
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(request: NextRequest) {
  try {
    const { fid } = await request.json();

    if (!fid) {
      return NextResponse.json(
        { error: 'fid is required' },
        { status: 400 }
      );
    }

    // Query all users and find one with matching fid
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      console.error('Error listing users:', error);
      return NextResponse.json(
        { error: 'Failed to check user existence' },
        { status: 500 }
      );
    }

    // Find user with matching fid in user_metadata or raw_user_meta_data
    const existingUser = users.find(user => 
      user.user_metadata?.fid === fid || 
      user.raw_user_meta_data?.fid === fid
    );

    return NextResponse.json({
      exists: !!existingUser,
      userId: existingUser?.id || null,
      userMetadata: existingUser?.user_metadata || null
    });

  } catch (error) {
    console.error('Error in check-user API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

