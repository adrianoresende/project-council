# Investigation: Fix UX Mobile

## Bug summary
- Reported issue: on mobile, selecting a conversation from the navigation sidebar should close the sidebar automatically.
- Reproduction flow:
1. Open the app on a viewport smaller than the `lg` breakpoint.
2. Tap the menu button to open the mobile sidebar.
3. Tap any conversation row.
4. Observed: conversation changes, but sidebar remains open.
5. Expected: sidebar closes immediately after selection.

## Root cause analysis
- `frontend/src/pages/home/page.jsx` defines `handleSelectConversation` that correctly closes the mobile sidebar first:
  - `closeMobileSidebar();`
  - `onSelectConversation(conversationId);`
- In the mobile sidebar render branch, the component is wired with the raw callback instead of the wrapper:
  - Current mobile prop: `onSelectConversation={onSelectConversation}`
- In the desktop branch, it is wired correctly:
  - `onSelectConversation={handleSelectConversation}`
- Because of this mismatch, mobile conversation selection skips `closeMobileSidebar()`.

## Affected components
- `frontend/src/pages/home/page.jsx`
  - Mobile `<Sidebar />` callback wiring.
- `frontend/src/components/sidebar/sidebar.jsx`
  - Emits `onSelectConversation(conv.id)` on item click (works as designed; not root cause).
- Test coverage gap:
  - No existing tests found for `frontend/src/pages/home/page.jsx` mobile sidebar behavior.

## Proposed solution
1. In mobile `<Sidebar />` usage inside `frontend/src/pages/home/page.jsx`, pass wrapper handlers instead of raw parent handlers:
   - `onSelectConversation={handleSelectConversation}`
   - (Recommended for consistency) also use wrappers for other actions already designed to close mobile sidebar:
     - `onChangeMainView={handleChangeMainView}`
     - `onNewConversation={handleNewConversation}`
     - `onLogout={handleLogout}`
2. Add regression test(s) for mobile flow in Implementation step:
   - Render `ChatPage` with at least one conversation.
   - Open mobile sidebar via menu button.
   - Click conversation item.
   - Assert sidebar closes (e.g., close button/overlay no longer present) and selection callback is invoked.

## Edge cases and side effects
- Conversation selection from desktop remains unchanged.
- Closing behavior should only affect mobile overlay/sidebar state; it should not change conversation selection semantics.
- Wrapping additional mobile actions (new conversation, account/admin/pricing, logout) ensures consistent mobile UX and prevents similar stale-open sidebar behavior.

## Error messages and logs
- No runtime error messages or backend logs are required to reproduce; this is a frontend event-wiring bug.
