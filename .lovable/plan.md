

## Setup Section — UX, Logic & AI Workflow Overhaul

Four independent improvements across the Setup tab (Region / Audience / Message / Timing). Each is described separately so you can see what changes where.

---

### 1. Section Header Sizing + Audience Toolbar Layout

**File: `src/components/campaigns/CampaignStrategy.tsx`**

- Increase header padding from `py-2 px-3` → `py-3 px-4`, bump title text from `text-sm` → `text-[15px]`, and increase the icon and check-circle sizes (`h-4 w-4` → `h-[18px] w-[18px]` for content icons, `h-5` → `h-6` for the check). This gives all four headers the same comfortable industry-standard touch height (~52px).
- Make the section background slightly more pronounced and the meta summary text (`getContentSummary`) one size larger so it reads as a real subtitle.

**File: `src/components/campaigns/CampaignAudienceTable.tsx` (toolbar)**

Reorder the toolbar so it reads left-to-right as a single visual flow:

```text
[🔍 Search accounts & contacts…]   0 accounts · 0 contacts        [Expand all] [+ Accounts] [+ Contacts]
```

- Search bar moves to the left (first element).
- The `0 accounts · 0 contacts` count moves immediately right of the search.
- Expand/Add buttons stay on the right.

---

### 2. Add-Accounts Modal — Filter by Selected Countries

**Bug:** When Region = Europe and Country = Austria, the modal still lists Germany, France, UK etc. Currently `AddAccountsModal` only filters by `region` codes; it ignores the selected country list from the region cards.

**Fix in `src/components/campaigns/CampaignAudienceTable.tsx`:**
- Pass the campaign's region cards (with their `country` values) down to `AddAccountsModal` as a new prop `selectedCountries: string[]` derived from `parseRegions(campaign)`.

**Fix in `src/components/campaigns/AddAccountsModal.tsx`:**
- Add a `selectedCountries?: string[]` prop.
- In the `all-accounts` query, when `selectedCountries.length > 0`, add `.in("country", selectedCountries)` (using `normalizeCountryName` mapping to handle DB variants).
- If no countries are picked but regions are, keep current region-only filter.
- Result: Only Austrian accounts appear when Austria is the only chosen country; if user later adds Germany too, both appear.

We will also pipe the same `selectedCountries` into `AddContactsModal` so contacts are filtered to those countries' company names.

---

### 3. Message Section — AI Workflow + Context-Aware Templates + Attachments

This is the largest change. The current "Generate with AI" button lives inside each individual modal (Email / Script / LinkedIn) and requires the user to first open the right modal. We replace that with a single AI-first entry point.

#### 3a. Remove "Assign to Segments" everywhere
- Email modal: delete the `<Label>Assign to Segments</Label>` block + the `audience_segment` form field handling (still write `null` to DB to keep schema happy).
- Phone-script modal: delete the `<Label>Audience Segments</Label>` block.
- Card displays: stop rendering `segs` badges.
- Helper functions `toggleSegment`, `toggleScriptSegment`, and the `SEGMENTS` constant get removed.

#### 3b. New "Generate with AI" entry point
At the top of the Message section, add a single primary button:

```text
[ ✨ Generate with AI ]
```

Clicking opens a small wizard dialog:

```text
┌─ Generate with AI ─────────────────────────────────┐
│                                                    │
│  What do you want to create?                       │
│  [✓ Email]   [ ] LinkedIn Connection               │
│  [ ] LinkedIn Follow-up   [ ] Call Script          │
│  (multi-select — picks all checked outputs)        │
│                                                    │
│  Briefly describe the context / angle              │
│  ┌────────────────────────────────────────────┐    │
│  │ e.g. "Introduce our new SaaS analytics     │    │
│  │ platform for mid-market manufacturers in   │    │
│  │ Europe. Focus on cost savings."            │    │
│  └────────────────────────────────────────────┘    │
│  Tone: [Professional ▾]   Length: [Short ▾]        │
│                                                    │
│             [Cancel]   [✨ Generate & Save]         │
└────────────────────────────────────────────────────┘
```

**On Generate & Save:**
- Calls existing `generate-campaign-template` edge function once per checked type, passing the user's context text as `userInstructions`, plus existing `campaignContext` (campaign name, type, goal, regions, **selected countries**, audience counts, sample industries, sample positions).
- For each successful response, **creates a saved template directly** (no extra modal) with auto-name like `"AI – Email – {first 30 chars of context}"`.
- Toast: "Generated and saved 3 templates" then refreshes the list.

The per-modal "Generate with AI" buttons are removed (they didn't have campaign context anyway and produced generic text — root cause of the issue you described).

#### 3c. Variable substitution + auto-prefill on send

The `EmailComposeModal` already supports `{contact_name}`, `{first_name}`, `{company_name}`, `{position}`, `{email}`. We extend the AI system prompt in `generate-campaign-template/index.ts` to **always include these variables** in the generated body so when the user later opens the compose modal and selects a contact, fields auto-populate. We add 3 more variables and document them in the wizard:

- `{region}` – contact's region
- `{country}` – contact's country
- `{owner_name}` – campaign owner's name

`substituteVariables` in `EmailComposeModal.tsx` is extended to look these up from `selectedContact.contacts` (region/country) and from the campaign owner name (passed in as a prop).

#### 3d. Materials upload — verify + email attachments

**Verify upload works:** The current code uses `supabase.storage.from("campaign-materials").upload(...)` which requires the storage bucket to exist. We will check + create a migration if missing (read-only mode can't run it; will be applied after approval). The bucket should be `campaign-materials` with private access + RLS allowing campaign members to read.

**Add attachments to Email Compose:**
- In `EmailComposeModal.tsx`, fetch `campaign_materials` for the campaign.
- New section under Body: "Attachments" with checkboxes for each uploaded material; selected file paths are sent to `send-campaign-email`.
- Update `send-campaign-email/index.ts` to accept `attachments: { file_path: string; file_name: string }[]`, download each from storage with a service-role client, and pass them to Microsoft Graph's `sendMail` payload as `message.attachments` (`@odata.type: "#microsoft.graph.fileAttachment"`, `contentBytes` base64).
- Cap total attachment size at ~10 MB (Graph limit per message) with a clear toast if exceeded.

---

### 4. Files Modified

| File | Change |
|------|--------|
| `src/components/campaigns/CampaignStrategy.tsx` | Larger header padding/text/icons |
| `src/components/campaigns/CampaignAudienceTable.tsx` | Toolbar reorder; pass `selectedCountries` to add modals |
| `src/components/campaigns/AddAccountsModal.tsx` | Filter accounts by `selectedCountries` |
| `src/components/campaigns/AddContactsModal.tsx` | Filter contacts by `selectedCountries` |
| `src/components/campaigns/CampaignMessage.tsx` | Remove segments UI + per-modal AI buttons; add top-level "Generate with AI" wizard; auto-save AI templates; render attachment selector hookup |
| `src/components/campaigns/EmailComposeModal.tsx` | Add attachment selector + new variable substitutions; accept owner name |
| `supabase/functions/generate-campaign-template/index.ts` | Accept `selectedCountries`, sample industries/positions; system prompt mandates `{first_name}/{company_name}/{position}/{country}/{region}` placeholders |
| `supabase/functions/send-campaign-email/index.ts` | Accept `attachments[]`, fetch from storage, attach to Graph sendMail; surface size errors |
| `supabase/migrations/<new>.sql` (if missing) | Ensure `campaign-materials` storage bucket + RLS policies |

### Out of Scope
- Changing DB schema for templates (keep `audience_segment` column nullable, just stop writing/reading it from UI).
- Touching the unused `CampaignMART*` files (separate cleanup).
- Outreach tab — only Setup tab is in scope.

