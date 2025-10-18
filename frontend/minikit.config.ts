const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  "accountAssociation": {
    "header": "eyJmaWQiOjM3MjYyNiwidHlwZSI6ImF1dGgiLCJrZXkiOiIweDM0ZUJGMGY5MTA0YTIxYWMwOUJmMDI1NDI5MzBGMzdGZTRjZkI0OTAifQ",
    "payload": "eyJkb21haW4iOiJuZXctbWluaS1hcHAtcXVpY2tzdGFydC1yaG8tZ3JlZW4udmVyY2VsLmFwcCJ9",
    "signature": "GW6DryYylW1vAjeXW7f3+aJaaNzzmuXNGCnSzb511lwqX7jaMEg3zsxjdutwwdH+2HatQMSasDzsKsKxdO9uNxw="
  },
  miniapp: {
    version: "1",
    name: "Hoot!", 
    subtitle: "Live Quiz Rewards", 
    description: "Live Quiz Rewards",
    screenshotUrls: [`${ROOT_URL}/Logo.png`],
    iconUrl: `${ROOT_URL}/Logo.png`,
    splashImageUrl: `${ROOT_URL}/Icon_hoot.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "social",
    tags: ["marketing", "ads", "quickstart", "waitlist"],
    heroImageUrl: `${ROOT_URL}/hero_hoot_1.png`, 
    tagline: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: `${ROOT_URL}/hero_hoot_1.png`,
  },
} as const;

