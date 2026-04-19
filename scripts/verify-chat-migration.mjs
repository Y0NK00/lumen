#!/usr/bin/env node
// scripts/verify-chat-migration.mjs
// ---------------------------------------------------------------------------
// Standalone verification for the zustand `persist` migration defined in
// src/renderer/stores/chatStore.ts. We cannot import the TS file directly
// without a build step, so the migrate() function is mirrored here. Any edit
// to the real migrate() should be mirrored here and vice versa, and the two
// should stay structurally identical.
//
// Run:  node scripts/verify-chat-migration.mjs
// ---------------------------------------------------------------------------

// ─── Mirror of migrate() from chatStore.ts ─────────────────────────────────
function migrate(persisted, version) {
  const state = persisted
  if (!state?.conversations) return persisted
  let convs = state.conversations

  if (version < 1) {
    const migrated = {}
    for (const [id, conv] of Object.entries(convs)) {
      migrated[id] = { ...conv, mode: conv.mode ?? 'chat' }
    }
    convs = migrated
  }
  // v2 is a no-op for data.

  return { ...state, conversations: convs }
}

// ─── Assertion helper ──────────────────────────────────────────────────────
let passed = 0
let failed = 0
function assert(label, cond, detail) {
  if (cond) { passed++; console.log(`  \u2713 ${label}`) }
  else      { failed++; console.log(`  \u2717 ${label}${detail ? ' \u2014 ' + detail : ''}`) }
}

// ─── Test cases ────────────────────────────────────────────────────────────

console.log('\nCase 1: legacy v0 store with no `mode` field \u2014 should backfill to \"chat\"')
{
  const legacy = {
    conversations: {
      'c1': { id: 'c1', title: 'Old chat', model: 'qwen2.5:14b', messages: [], createdAt: 1, updatedAt: 2 },
      'c2': { id: 'c2', title: 'Another',  model: 'claude-sonnet-4-5', messages: [], createdAt: 3, updatedAt: 4 },
    },
    activeConversationId: 'c1',
  }
  const result = migrate(legacy, 0)
  assert('c1 gets mode=\"chat\"', result.conversations.c1.mode === 'chat')
  assert('c2 gets mode=\"chat\"', result.conversations.c2.mode === 'chat')
  assert('titles preserved',      result.conversations.c1.title === 'Old chat')
  assert('activeConversationId preserved', result.activeConversationId === 'c1')
  assert('no `pinned` added (v2 is no-op for data)', result.conversations.c1.pinned === undefined)
}

console.log('\nCase 2: v1 store already has `mode` \u2014 should pass through untouched')
{
  const v1 = {
    conversations: {
      'c1': { id: 'c1', title: 'Code session', model: 'x', mode: 'code', messages: [], createdAt: 1, updatedAt: 2 },
    },
  }
  const result = migrate(v1, 1)
  assert('mode=\"code\" preserved', result.conversations.c1.mode === 'code')
  assert('no extra fields added',  Object.keys(result.conversations.c1).sort().join(',') === 'createdAt,id,messages,mode,model,title,updatedAt')
}

console.log('\nCase 3: empty store \u2014 should not crash')
{
  const empty = { conversations: {} }
  const result = migrate(empty, 0)
  assert('returns an object with empty conversations', Object.keys(result.conversations).length === 0)
}

console.log('\nCase 4: undefined / malformed state \u2014 should pass through')
{
  const malformed = { activeConversationId: null }
  const result = migrate(malformed, 0)
  assert('returns unchanged when no conversations key', result === malformed)

  const truly = undefined
  const r2 = migrate(truly, 0)
  assert('handles undefined without throwing', r2 === undefined)
}

console.log('\nCase 5: mixed legacy + pinned data (simulated future backfill)')
{
  const mixed = {
    conversations: {
      'a': { id: 'a', title: 'Legacy w/ manual pin', model: 'x', messages: [], createdAt: 1, updatedAt: 2, pinned: true, pinnedAt: 100 },
      'b': { id: 'b', title: 'Legacy no pin',        model: 'x', messages: [], createdAt: 3, updatedAt: 4 },
    },
  }
  const result = migrate(mixed, 0)
  assert('mode backfilled on both',  result.conversations.a.mode === 'chat' && result.conversations.b.mode === 'chat')
  assert('existing pinned preserved', result.conversations.a.pinned === true)
  assert('existing pinnedAt preserved', result.conversations.a.pinnedAt === 100)
  assert('unpinned stays undefined',  result.conversations.b.pinned === undefined)
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\nResult: ${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
