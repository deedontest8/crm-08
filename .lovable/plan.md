## Findings

I checked the uploaded Gmail PDF, current app route, database rows, edge-function logs, and the existing plan file.

For campaign `Campaign 29 April` / contact `Test 1 lukas schleicher`:

- The outbound email was logged at `2026-04-29 03:48:40 UTC` with subject `Boosting TEST's CI/CD efficiency`.
- The uploaded PDF shows the contact replied in Gmail at `2026-04-29 09:19 IST` (`03:49 UTC`) with: `Hello, Yes, I would be interested.`
- The app ran `check-email-replies` shortly after, but the function logs show `0 messages match tracked conversations` for the scoped check, so no inbound row was inserted.
- The broader sync saw inbox messages but still inserted `0` replies and logged chronology skips for older conversations.
- The preview is also currently crashing in `CampaignDetail` with `Rendered more hooks than during the previous render`, caused by a hook added after early returns in the previous setup-status change. This can prevent the Monitoring UI from working reliably.

## Root causes to fix

1. **Reply detection is too dependent on Outlook Graph `conversationId` and headers.** Gmail can display the reply in the same thread while Microsoft Graph does not expose a matching Outlook `conversationId`, and headers may not be returned/matched in the first pass.

2. **Subject/contact/time fallback is too narrow.** The existing rescue only looks around the reply received time with a very tight window. The current reply came about one minute after send, but if Graph timestamps or timezone/ingestion differ slightly, it can be missed. Older logs show this exact class of false `chronology` skip.

3. **Manual re-sync contact scoping is fragile.** The UI derives `contact_id` by splitting a composite thread key on `::`, but the Outlook `conversationId` itself can contain `::`, so the scoped re-sync may pass the wrong/no contact scope.

4. **Current route crash must be fixed first.** The hook-order runtime error in `CampaignDetail` must be corrected so the campaign page can render consistently.

## Implementation plan

### 1. Fix the `CampaignDetail` hook-order crash

Move the auto-activate `useEffect` above the `detail.isLoading` / `!detail.campaign` early returns, and make it safe when campaign data is not loaded yet.

This fixes the runtime error without changing the intended popup behavior.

### 2. Strengthen `check-email-replies` matching

Update `supabase/functions/check-email-replies/index.ts` so inbound messages can be attached when they are clearly a reply by:

- Keeping the existing header and `conversationId` matching.
- Adding a stronger fallback match by:
  - sender email equals the campaign contact email,
  - subject is compatible with the outbound subject after `Re:` normalization,
  - received time is after the outbound send time with reasonable clock-skew tolerance,
  - same scoped campaign/contact when provided.
- Expanding the rescue window from a few minutes to a safer post-send window for recent campaign emails.
- Recording the match reason in notes/logs, e.g. `subject_contact_time_rescue`, for later auditing.
- Avoiding false positives by requiring an exact contact email match and compatible subject before bypassing `conversationId`.

Expected result: the Gmail reply from `deedontest1@gmail.com` to `Boosting TEST's CI/CD efficiency` will insert a `graph-sync` inbound communication, mark the original as `Replied`, and update the contact/account stage.

### 3. Fix scoped re-sync contact extraction in the UI

Update `CampaignCommunications.tsx` so `runResync(contactIdScope)` uses the selected thread's actual `contactId` instead of parsing `selectedThreadKey` with `split("::")`.

This removes ambiguity when `conversationId` contains `::`.

### 4. Add/repair backfill behavior for missed replies

Improve the replay/backfill section in `check-email-replies` so recently skipped or unmatched messages can be reprocessed using the improved subject/contact/time logic.

If the Graph inbox contains the current reply, a manual refresh should attach it immediately after deployment.

### 5. Verify with logs and data

After changes are approved and implemented:

- Deploy/test `check-email-replies`.
- Call it scoped to campaign `3676df53-a89f-4281-86cb-193b649c582e` and contact `f617dd33-46ca-4678-b670-fafc9612d1ca`.
- Confirm a new `campaign_communications` row exists with:
  - `sent_via = 'graph-sync'`
  - `delivery_status = 'received'`
  - `email_status = 'Replied'`
  - body containing the contact reply text when Graph provides it.
- Confirm the Monitoring tab shows `Replied 1` and the conversation shows 2 messages.

## Files to change

- `src/pages/CampaignDetail.tsx`
  - Fix hook ordering for the auto-activate effect.

- `src/components/campaigns/CampaignCommunications.tsx`
  - Fix manual re-sync scoping to use selected thread/contact data directly.

- `supabase/functions/check-email-replies/index.ts`
  - Add safer subject/contact/time fallback matching and better replay/backfill logic.

- `.lovable/plan.md`
  - Update plan notes to document this reply-detection fix and the hook-order bug fix.

## No database schema change planned

The existing tables already support this fix:

- `campaign_communications`
- `email_reply_skip_log`
- `campaign_unmatched_replies`

No new migrations should be needed.
---

# Update — Reply detection fix (Apr 29)

- Fixed hook-order crash in `CampaignDetail` by hoisting the auto-activate `useEffect` above the early returns.
- Strengthened `check-email-replies` so Gmail replies whose `conversationId` and threading headers are stripped are still picked up:
  - Built a per-mailbox `contactEmail → recent outbounds` index and treat an inbound as relevant when the sender is a known campaign contact AND the subject is compatible with one of our recent outbounds (received after the outbound with ±2min skew).
  - Widened the inner subject/contact/time rescue window to 7d back / 2min forward so post-send replies are not lost to a too-narrow ±10min window.
- Fixed the manual re-sync contact scoping in `CampaignCommunications.tsx` to use the selected thread's actual `contactId` instead of splitting `selectedThreadKey` on `::`.
