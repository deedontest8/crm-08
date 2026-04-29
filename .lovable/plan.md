## The bug

The reply IS captured (DB shows `email_status = Replied`, the Monitoring header shows `Replied 1`), but the inbound message renders in its own invisible bucket instead of inside the outbound thread, so:

- The thread shows only the sent email ("1 message")
- The "Replied 1" filter chip shows "No emails match"

### Root cause

When the contact replies from **Gmail** to an email sent from **Outlook**, Microsoft Graph assigns the inbound a **different `conversationId`** from the outbound (cross-mailbox bridges rotate the ID). Verified in DB:

- Outbound `e9dbe751`: `conversation_id = ...AMejBlQAz7BHlnZougzr_kA=`
- Inbound reply `6d294a38`: `conversation_id = ...ANeqy1dGi69MsqbZ3pRkvXg=` (different)
- Inbound `references` column: **NULL**
- Inbound `parent_id`: correctly points to the outbound (the edge function did its job)

The UI in `CampaignCommunications.tsx` (`useMemo` at line 453) groups messages by `conversation_id::contact_id` and walks the `references` chain to stitch orphans. With a different `conversation_id` AND empty `references`, the inbound lands in its own bucket. That bucket is then hidden by the "pure-inbound thread" filter at line 976.

The same pattern affected the older Gmail reply `767e857b` — it only joined its parent thread because the parent's outbound followed it (subject_chronology_rescue), not via grouping.

## Fixes

### 1. UI grouping — stitch by `parent_id` (primary fix, also repairs legacy rows)

In `src/components/campaigns/CampaignCommunications.tsx`, extend the bucketing pass:

- Build an `idToKey` map of every row's id → its composite key.
- In `resolveBucketKey(c)`, after the existing `references`-walk fallback, add: if `c.parent_id` is set and resolves to a known key, use that key. Walk transitively (parent's parent) up to a small depth cap so a reply-to-a-reply still lands in the root bucket.
- Order of resolution: own `internet_message_id` match → `references` chain → `parent_id` chain → own composite key.

This stitches every existing reply (including legacy rows with NULL references) without any backfill.

### 2. Edge function — write `references` on every inserted reply

In `supabase/functions/check-email-replies/index.ts` (insert at line 957), add to the insert payload:

- `references`: the parent's `internet_message_id` (so future loads of the same data are stitchable purely by header walk, matching the rest of the codebase's threading model).
- `thread_root_id`: the parent's `thread_root_id` if present, else the parent's id (keeps a stable per-thread anchor for analytics).

### 3. Backfill existing rows (one-shot SQL migration)

Update inbound graph-sync rows that have `parent_id` but NULL `references`:

```sql
UPDATE campaign_communications c
SET "references" = p.internet_message_id,
    thread_root_id = COALESCE(p.thread_root_id, p.id)
FROM campaign_communications p
WHERE c.parent_id = p.id
  AND c.sent_via = 'graph-sync'
  AND c."references" IS NULL
  AND p.internet_message_id IS NOT NULL;
```

This makes the existing two affected threads (and any others) render correctly immediately, without requiring users to re-trigger reply sync.

### 4. Defensive cleanup of the "hide pure-inbound thread" rule

The line-976 filter `t.messages.some(m => (m.sent_via||"manual") !== "graph-sync")` exists to hide stray autoreply-only buckets. Once fix #1 lands, a real reply will always be co-bucketed with its outbound and this rule no longer hides legitimate replies. No change needed here, but verify after fix #1 that pure-orphan-only buckets still get hidden (they will — they have no `parent_id`).

## Files touched

- `src/components/campaigns/CampaignCommunications.tsx` — extend `resolveBucketKey` with `parent_id` chain walk and an `idToKey` index.
- `supabase/functions/check-email-replies/index.ts` — add `references` and `thread_root_id` to the reply insert payload.
- New migration — backfill `references` / `thread_root_id` on existing inbound rows linked by `parent_id`.

## Out of scope

- Refactoring the Outlook-style 2-pane `ThreadList`/`ThreadView` (already shipped).
- Changing how `conversation_id` is assigned (we cannot — Graph controls it).
- Reply-intent classification, follow-up scheduling — already working.

Reply **Approve** to execute.
