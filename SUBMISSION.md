# Squeekchain Genesis Code Lane — Project Submission

## Project Name
**Squeektoshi Radio**

---

## Campaign Submission Description (120 Words)

Squeektoshi Radio turns live WHEELY9000 hamster wheel telemetry on Squeekchain into a continuous generative music station running entirely in the browser. Wheel RPM dictates station tempo, the hamster’s sleep transitions the soundscape into a soothing ambient lullaby, completed Squeek blocks advance harmonic chord progressions, and confirmed settlements strike an FM metallic chime. Built purely on the Web Audio API with zero external audio samples or server dependencies, independent listeners enjoy synchronized shared listening derived from a deterministic seeded PRNG. Entering any public Ethereum wallet address invites held or deposited Squeek NFTs into the band as spatially panned synthesized instruments. Featuring a dedicated OBS stream overlay mode, Squeektoshi Radio is strictly read-only, private-key-free, and requires no build step.

*(Word count: 120 words)*

---

## Direct Submission Checklist

Before submitting on `https://squeekchain.com/genesis/code`:

- [ ] **Custom Domain**: Set up a custom domain or subdomain (e.g., `https://squeektoshi.radio` or `https://radio.yourdomain.com`) pointing to your Cloudflare Pages / Vercel / Netlify static deployment.
- [ ] **DNS TXT Verification Record**:
  - Open the *Submit* dialog on `https://squeekchain.com/genesis/code`.
  - Copy the exact DNS TXT verification token provided in the modal (e.g. `squeekchain-verification=...`).
  - Add this TXT record to your domain's DNS host (Cloudflare, Namecheap, Route53, etc.) and ensure it resolves.
- [ ] **Public GitHub Repository**:
  - Push this repository to GitHub with public visibility.
  - Verify that `README.md` and `SUBMISSION.md` are present at the root.
- [ ] **Project Image**:
  - Use `card.png` (1200×630, generated via `npm run card`) as the project card image for the submission preview.
- [ ] **Read-Only Verification**:
  - Confirm the site requests zero wallet connections, contains no private keys, and triggers no blockchain transactions.

