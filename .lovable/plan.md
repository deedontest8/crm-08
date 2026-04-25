## Execute All Remaining Campaign Module Phases (Batch A + B + C)

The user approved "execute all phases". I'll deliver in 3 sequential batches, each shippable independently. Code changes happen in default mode after this plan is approved.

---

### BATCH A — Phase 1 Finish + Bug Fixes (executes first)

1. **`src/components/campaigns/CampaignRegion.tsx`** — In `persistRegions`, write all distinct countries comma-joined to `campaigns.country` (not just the first). Also normalize empty → `null`.
2. **`src/hooks/useCampaigns.tsx`** — `cloneCampaign` must copy `enabled_channels` and rows from `campaign_materials`.
3. **`src/components/campaigns/CampaignMessage.tsx`** — Accept `isReadOnly?: boolean` prop; disable Add/Edit/Delete/Duplicate/Generate-with-AI buttons when true. Replace any remaining `=== "Call"` checks with `=== "Phone"`.
4. **`src/pages/CampaignDetail.tsx`** — Pass `isReadOnly={isCompleted}` to `CampaignMessage` and `CampaignAudienceTable`.
5. **Toast standardization** — Convert `sonner` imports to `@/hooks/use-toast` in:
   - `src/components/campaigns/EmailComposeModal.tsx`
   - `src/components/campaigns/CampaignTiming.tsx`
   - `src/components/campaigns/CampaignStrategy.tsx`
6. **`src/components/campaigns/AIGenerateWizard.tsx`** — 
   - Make phone-script `talking_points`, `discovery_questions`, `objection_handling` editable as line lists in the preview step.
   - Add `linkedin-followup` to `KIND_OPTIONS`.
   - Accept `selectedCountries`, `sampleIndustries`, `samplePositions` in `campaignContext` and forward to the edge function.
7. **`src/components/campaigns/CampaignMessage.tsx`** — When opening the wizard, build and pass enriched context (countries from regions, top 5 industries from selected accounts, top 5 positions from selected contacts).
8. **Delete dead files** after import audit: `src/components/campaigns/AIDraftEmailModal.tsx`, `supabase/functions/ai-draft-campaign-email/`. (Skip if anything still imports them.)

---

### BATCH B — Phase 2 Outlook-style 2-Pane Monitoring

9. **New `src/components/campaigns/email-monitor/ThreadList.tsx`** (~35% width) — Paginated thread cards: contact name, last message preview, status pill (sent/replied/bounced/needs-followup), unread dot, checkbox for bulk select.
10. **New `src/components/campaigns/email-monitor/ThreadView.tsx`** (~65% width) — Header (contact + account + status), message timeline (oldest→newest), action bar: Reply / Reply All / Forward / Send Follow-up / Create Task / Mark as Replied.
11. **Refactor `CampaignCommunications.tsx` Email tab** — Replace flat list with `<ResizablePanelGroup>` hosting ThreadList + ThreadView. Preserve existing thread-grouping logic.
12. **Bulk action bar** — When ≥1 thread selected: Send Follow-up to selected / Mark as Replied / Export.
13. **Orphan reply linker** — In ThreadList, group orphan replies under "Unmatched (N)" with "Link to thread…" picker.
14. **Deep linking** — `?thread=<conversation_id>` selects + scrolls; selecting a thread updates URL via `setSearchParams`.
15. **Responsive** — At <1024px, ThreadView becomes a `Sheet` overlay; ThreadList takes full width.

---

### BATCH C — Phase 3 (Segments) + Phase 4 (Safety/Polish)

16. **New `src/components/campaigns/AudienceSegmentManager.tsx`** — Lists `campaign_audience_segments` rows; "Add Segment" modal with filters (Role contains, Industry in, Country in, Position contains) + live count via query against `campaign_contacts` joined to `contacts`/`accounts`.
17. **`CampaignAudienceTable.tsx`** — Above the toolbar, render segment chips (`All` + each segment); selecting one filters the visible rows by the segment's filter spec.
18. **`CampaignMessage.tsx` template forms** — Add `region` (dropdown of campaign regions) + `segment_id` (dropdown of campaign segments) fields to email + LinkedIn template create/edit dialogs. Show region/segment badges on cards.
19. **`EmailComposeModal.tsx`** — When a single contact is selected, auto-suggest the best template by matching `region` first, then `segment_id` (if contact matches segment filters); render a "Suggested" badge next to the picker.
20. **`CampaignOverview.tsx`** — New "Template Performance" card: top 5 `campaign_email_templates` by reply rate (joins to `campaign_communications` for sent/replied counts).
21. **Duplicate-send guard in `EmailComposeModal.tsx`** — Read `campaign_settings.duplicate_send_window_days` (default 3); before send, check if any selected contact received an email from this campaign within N days; show AlertDialog listing them with "Send Anyway / Skip Duplicates / Cancel".
22. **Multi-touch consistency toast in `CampaignMessage.tsx`** — On mount, if any saved template has a `region` that no longer exists in `campaigns.country`, show a one-time warning toast with affected template names.
23. **Cleanup** — `rg` audit then delete `src/components/campaigns/CampaignAccounts.tsx`, `CampaignContacts.tsx`, `CampaignAccountsContacts.tsx` if zero importers.

---

### Out of Scope (acknowledged)
- A/B variant authoring UI (DB exists but is a separate UX project)
- Sequences/cadences multi-step builder (separate spec)
- Daily send caps per user (requires settings page)
- Unsubscribe/suppression list (requires public unsubscribe edge function + token)

These will be proposed as Phase 5 after Batch C ships.

### Files Modified Summary
| Batch | Files |
|---|---|
| A | CampaignRegion, useCampaigns, CampaignMessage, CampaignDetail, EmailComposeModal, CampaignTiming, CampaignStrategy, AIGenerateWizard, (delete AIDraftEmailModal + edge fn) |
| B | NEW: email-monitor/ThreadList, email-monitor/ThreadView. EDIT: CampaignCommunications |
| C | NEW: AudienceSegmentManager. EDIT: CampaignAudienceTable, CampaignMessage, EmailComposeModal, CampaignOverview. DELETE: CampaignAccounts/Contacts/AccountsContacts (if unused) |

After approval I'll execute Batch A → B → C sequentially, verifying each batch builds before moving to the next.