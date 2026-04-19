

## Setup Section Overhaul + Build Error Fix

### 0. Fix build errors first (blocking)
`src/components/campaigns/CampaignMessage.tsx` references `SEGMENTS`, `Checkbox`, `Loader2`, `toggleSegment`, `toggleScriptSegment`, `generateWithAI`, `aiLoading` that no longer exist. The user's plan removes these intentionally (section 3a/3b) — so we delete the dead UI in the Email modal (lines 694–704), Phone modal (lines 742–752), and the per-modal "Generate with AI" footer buttons in all three modals (lines 707–710, 755–758, 797–800). This cleanly resolves all 7 TS errors and aligns with the user's plan.

### 1. Header sizing + audience toolbar layout
- `CampaignStrategy.tsx`: increase header padding `py-2 px-3` → `py-3 px-4`, title `text-sm` → `text-[15px]`, content icons `h-4 w-4` → `h-[18px] w-[18px]`, check-circle `h-5` → `h-6`, bump `getContentSummary` text one size.
- `CampaignAudienceTable.tsx`: reorder toolbar to `[Search] [count] ........ [Expand all] [+ Accounts] [+ Contacts]`.

### 2. Add-Accounts / Add-Contacts modals filter by selected countries
- `CampaignAudienceTable.tsx`: derive `selectedCountries` from `parseRegions(campaign)` and pass to both modals.
- `AddAccountsModal.tsx` & `AddContactsModal.tsx`: accept `selectedCountries?: string[]`; when non-empty, add `.in("country", selectedCountries)` (using `normalizeCountryName`). Falls back to region-only when empty.

### 3. Message section — AI-first workflow + variables + attachments

**3a. Remove "Assign to Segments" UI**
- Delete the segments blocks in Email & Phone modals; stop rendering `segs` badges on cards; remove `SEGMENTS`, `toggleSegment`, `toggleScriptSegment`. Continue writing `null` to `audience_segment` on insert (no schema change).

**3b. New top-level "Generate with AI" entry point**
- `CampaignMessage.tsx`: add a single `[✨ Generate with AI]` button at the top of the section that opens the existing `AIGenerateWizard` (already imported). Remove the per-modal AI buttons.
- Wizard already supports multi-select kinds, context, tone, length, dual insertion, toast — no changes required there.

**3c. Variable substitution + auto-prefill on send**
- `generate-campaign-template/index.ts` system prompt already mandates `{first_name}/{company_name}/{position}/{country}/{region}/{owner_name}` — extend it to also accept and use `selectedCountries` in context lines (already done).
- `EmailComposeModal.tsx`: extend `substituteVariables` to also resolve `{region}`, `{country}` from `selectedContact.contacts`, and `{owner_name}` from a new `ownerName` prop passed in by `CampaignMessage` (looked up via `useUserDisplayNames` for `campaign.owner`).

**3d. Materials → Email attachments**
- Storage bucket `campaign-materials` already exists (private). Verify RLS allows campaign members to read; add migration only if missing on review.
- `EmailComposeModal.tsx`: query `campaign_materials` for the campaign; add an "Attachments" section with checkboxes; pass selected `{file_path, file_name}[]` to `send-campaign-email`.
- `send-campaign-email/index.ts`: accept `attachments[]`; download each via service-role client; cap total at 10 MB (toast on overflow); attach as Microsoft Graph `#microsoft.graph.fileAttachment` with base64 `contentBytes` in the `sendMail` payload.

### 4. Files Modified
| File | Change |
|---|---|
| `CampaignMessage.tsx` | Fix build errors (delete dead segments UI + per-modal AI buttons); add top-level Generate-with-AI wizard entry; pass `ownerName` to EmailComposeModal |
| `CampaignStrategy.tsx` | Larger header padding/text/icons |
| `CampaignAudienceTable.tsx` | Reorder toolbar; pass `selectedCountries` to add modals |
| `AddAccountsModal.tsx` | Filter accounts by `selectedCountries` |
| `AddContactsModal.tsx` | Filter contacts by `selectedCountries` |
| `EmailComposeModal.tsx` | Add attachment selector; new variable substitutions; accept `ownerName` |
| `supabase/functions/send-campaign-email/index.ts` | Accept `attachments[]`; fetch from storage; attach to Graph sendMail; size guard |
| `supabase/functions/generate-campaign-template/index.ts` | Already prepared; minor confirmation only |

### Out of scope
- DB schema changes (column kept nullable).
- `CampaignMART*` files.
- Outreach tab.

