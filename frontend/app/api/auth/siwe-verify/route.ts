import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { createClient } from "@supabase/supabase-js";
import { SiweMessage } from "siwe";
import { NextResponse } from "next/server";


// Create Supabase admin client for user management
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// // Create public client for signature verification (supports both EOA and smart accounts)
const viemClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

export async function POST(request: Request) {
  try {

    const { message, signature, address, fid, username, email } = await request.json();
    // Validate required fields
    if (!message || !signature || !address || !email) {
      return NextResponse.json(
        { error: "Missing required fields: message, signature, address, or email" },
        { status: 400 }
      );
    }

    // Parse and validate SIWE message
    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch (error) {
      console.error("SIWE message parsing error:", error);
      return NextResponse.json(
        { error: "Invalid SIWE message format" },
        { status: 400 }
      );
    }

    const preparedMessage = siweMessage.prepareMessage();

    // Verify signature using viem (handles both EOA and EIP-6492 smart accounts)
    let isValid: boolean;
    try {
      isValid = await viemClient.verifyMessage({
        address: address as `0x${string}`,
        message: preparedMessage,
        signature: signature as `0x${string}`,
      });
    } catch (error) {
      console.error("Signature verification error:", error);
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 401 }
      );
    }
    console.log("isValid", isValid);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Optional: Add additional SIWE validation (domain, expiration, etc.)
    // For now, we trust the signature verification

    // Upsert user in Supabase Auth using wallet address as identifier
    let user;

    try {
      // First, if FID is provided, check if a user with this FID already exists
      let existingUserWithFid = null;
      if (fid) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        existingUserWithFid = users.users.find(
          (u) => u.user_metadata?.fid === fid
        );
      }

      if (existingUserWithFid) {
        // User with this FID exists
        const currentWalletAddresses = existingUserWithFid.user_metadata?.wallet_addresses || [];
        const primaryAddress = existingUserWithFid.user_metadata?.wallet_address?.toLowerCase();
        const newAddress = address.toLowerCase();

        // Check if this address is already linked
        const allAddresses = [primaryAddress, ...currentWalletAddresses].filter(Boolean);
        const isAddressAlreadyLinked = allAddresses.some(
          addr => addr.toLowerCase() === newAddress
        );

        if (!isAddressAlreadyLinked && primaryAddress !== newAddress) {
          // Add the new address to the wallet_addresses array
          const updatedWalletAddresses = [...new Set([...currentWalletAddresses, newAddress])];
          
          // Update the user metadata with the new address
          const { data: updatedUser, error: updateError } = 
            await supabaseAdmin.auth.admin.updateUserById(
              existingUserWithFid.id,
              {
                user_metadata: {
                  ...existingUserWithFid.user_metadata,
                  wallet_addresses: updatedWalletAddresses,
                },
              }
            );

          if (updateError) {
            throw updateError;
          }
          
          user = updatedUser.user;
          console.log(`Added new address ${newAddress} to existing user with FID ${fid}`);
        } else {
          // Address already linked or is the primary address, just use existing user
          user = existingUserWithFid;
          console.log(`Address ${newAddress} already linked to user with FID ${fid}`);
        }
      } else {
        // No existing user with this FID, proceed with create/find by address
        const { data, error: upsertError } =
          await supabaseAdmin.auth.admin.createUser({
            email: email,
            email_confirm: true,
            user_metadata: {
              wallet_address: address.toLowerCase(),
              wallet_addresses: [], // Initialize empty array for future addresses
              auth_method: "siwe",
              fid: fid ? fid : null,
              username: username ? username : null,
              display_name: username ? username : null,
            },
          });

        if (upsertError) {
          // If user already exists, try to get them instead
          if (upsertError?.code?.includes("email_exists")) {
            const { data: users } = await supabaseAdmin.auth.admin.listUsers();
            user = users.users.find(
              (u) =>
                u.email === `${address.toLowerCase()}@wallet.hoot` ||
                u.user_metadata?.wallet_address?.toLowerCase() ===
                  address.toLowerCase()
            );

            if (!user) {
              throw new Error("User exists but could not be retrieved");
            }
            
            // If this existing user doesn't have a FID but we're providing one, update it
            if (fid && !user.user_metadata?.fid) {
              const { data: updatedUser, error: updateError } = 
                await supabaseAdmin.auth.admin.updateUserById(
                  user.id,
                  {
                    user_metadata: {
                      ...user.user_metadata,
                      fid: fid,
                      username: username || user.user_metadata?.username,
                      display_name: username || user.user_metadata?.display_name,
                      wallet_addresses: user.user_metadata?.wallet_addresses || [],
                    },
                  }
                );
              
              if (updateError) {
                throw updateError;
              }
              user = updatedUser.user;
            }
          } else {
            throw upsertError;
          }
        } else {
          user = data.user;
        }
      }
    } catch (error: any) {
      console.error("User upsert error:", error);
      return NextResponse.json(
        { error: `Failed to create/retrieve user: ${error.message}` },
        { status: 500 }
      );
    }

    if (!user) {
      console.error("Failed to create or retrieve user");
      return NextResponse.json(
        { error: "Failed to create or retrieve user" },
        { status: 500 }
      );
    }

    // Ensure user has an email - update if missing
    let userEmail = user.email;
    if (!userEmail) {
      const primaryAddress = user.user_metadata?.wallet_address?.toLowerCase() || address.toLowerCase();
      userEmail = `${primaryAddress}@wallet.hoot`;
      console.log("userEmail", userEmail);

      
      // Update the user with the email
      try {
        const { data: updatedUser, error: updateError } = 
          await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            {
              email: userEmail,
              email_confirm: true,
            }
          );
        
        if (updateError) {
          console.error("Error updating user email:", updateError);
        } else {
          user = updatedUser.user;
          console.log(`Updated user ${user.id} with email ${userEmail}`);
        }
      } catch (error) {
        console.error("Failed to update user email:", error);
      }
    }

    // Generate session token for the user
    try {
      // Generate magic link token (no email sent; we verify it programmatically)
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: userEmail,
          options: { redirectTo: "" }, // Optional: Prevents email send if blank
        });

      if (linkError) {
        console.error("Generate link error:", linkError);
        return NextResponse.json(
          { error: "Failed to generate auth token" },
          { status: 500 }
        );
      }

      const hashed_token = linkData.properties.hashed_token;

      // Create a regular Supabase client (with anon key) to verify the token and get session tokens
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://auuxbsnzmmnlgyxxojcr.supabase.co",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Use public anon key here
      );

      // Verify the token to create a full session (simulates "exchanging" the code)
      const { data: verifyData, error: verifyError } =
        await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: hashed_token,
        });

      if (verifyError || !verifyData.session) {
        console.error("Verify OTP error:", verifyError);
        return NextResponse.json(
          { error: "Failed to create session" },
          { status: 500 }
        );
      }

      // Return the valid tokens to the frontend
      return NextResponse.json({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
        user: {
          id: user.id,
          email: user.email,
          wallet_address: address.toLowerCase(),
          fid: fid ? fid : null,
          username: username ? username : null,
          display_name: username ? username : null,
        },
      });
    } catch (error: any) {
      console.error("Token generation error:", error);
      return NextResponse.json(
        { error: `Failed to generate session: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("SIWE verify endpoint error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
