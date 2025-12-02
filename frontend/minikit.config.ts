const ROOT_URL =
  process.env.NEXT_PUBLIC_NGROK_URL ||
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  accountAssociation: {
    header: `${process.env.NEXT_PUBLIC_ACCOUNT_ASSOCIATION_HEADER}` || "eyJmaWQiOjEzODk3MjcsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgyZjcyNjllQzBjRjJiRjhCNWQxNjJDN2M3NmY2Yzk0NzEwNDAyMUNkIn0",
    payload: `${process.env.NEXT_PUBLIC_ACCOUNT_ASSOCIATION_PAYLOAD}` || "eyJkb21haW4iOiI4NDYwNTIzMDE4ODAubmdyb2stZnJlZS5hcHAifQ",
    signature: `${process.env.NEXT_PUBLIC_ACCOUNT_ASSOCIATION_SIGNATURE}` || "3GmZxY02ZXpt9I57SmIfL21lh+JYmpfphzRSh59SN3kf+oe6VwFtpEPKFUmlFB2JkjoTBLmH6SI7n2jUbSMKxRw="
  },
   baseBuilder: {
    ownerAddress: "0x9f424268b31E56625aAe9d278ABB8e8A111C9c82"
  },
  miniapp: {
    version: "1",
    name: "Hoot!", 
    subtitle: "Live Quiz Rewards", 
    description: "Onchain Quiz Platform App!",
    screenshotUrls: [`${ROOT_URL}/Logo.png`],
    iconUrl: `${ROOT_URL}/Logo.png`,
    splashImageUrl: `${ROOT_URL}/Icon_hoot.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `https://api.neynar.com/f/app/f2711f07-1fd0-40ac-acc6-4736a6187075/event`,
    primaryCategory: "social",
    tags: ["marketing", "ads", "quickstart", "waitlist"],
    heroImageUrl: `${ROOT_URL}/hero_hoot_1.png`, 
    tagline: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: `${ROOT_URL}/hero_hoot_1.png`,
    canonicalDomain: "hoot-quiz.com"  
  }
} as const;

