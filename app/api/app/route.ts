import { fileTransaction, ignoreTransaction, markAsDuplicate, keepBoth, dismissUnparsed, retryUnparsed } from '../../review/actions'
import { paste, addCash, readHistoryShot, addHistoryRows, closeGap } from '../../add/actions'
import { linkThisPhone } from '../../phone/actions'
import { coverPayment, uncoverPayment, linkPayback, unlinkPayback, createTag, splitPayment, unsplitPayment, applyPlan } from '../../t/[id]/actions'
import { createPlan, updatePlan, cancelPlan } from '../../plan/actions'
import type { Part, PlanInput } from '../../../lib/splits'
import { createCategory, editCategory } from '../../categories/actions'
import { setBudget } from '../../budgets/actions'
import { setSalary } from '../../tax/actions'
import { saveRecurring, removeRecurring, runNow } from '../../recurring/actions'
import { updateRule, deleteRule, createRule, saveRule, previewRule, applyRuleToPast } from '../../rules/actions'
import { markSettled, unsettle, notClaimable } from '../../claimable/actions'
import { previewStatement, importStatement, importBulk } from '../../import/actions'
import { supabaseServer } from '../../../lib/supabase/server'

// The phone app's way in to the website's own actions. It sends its sign-in
// token as "Authorization: Bearer ..."; supabaseServer() then acts as that
// person, so filing, adding and pay-backs run through exactly the code the
// website uses, under the same access rules.

const form = (o: Record<string, unknown>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) f.set(k, String(v))
  return f
}

type Args = Record<string, unknown>
const ACTIONS: Record<string, (a: Args) => Promise<unknown>> = {
  file: a => fileTransaction(a as Parameters<typeof fileTransaction>[0]),
  ignore: a => ignoreTransaction(String(a.id)),
  markDuplicate: a => markAsDuplicate(String(a.id)),
  keepBoth: a => keepBoth(String(a.id)),
  dismissUnparsed: a => dismissUnparsed(String(a.id)),
  retryUnparsed: a => retryUnparsed(String(a.id), String(a.text)),
  paste: a => paste(null, form({ text: a.text })),
  addCash: a => addCash(null, form(a)),
  linkThisPhone: a => linkThisPhone(String(a.label ?? 'Android phone')),
  cover: a => coverPayment(String(a.paymentId), String(a.transferId)),
  uncover: a => uncoverPayment(String(a.paymentId)),
  linkPayback: a => linkPayback(String(a.paybackId), String(a.paymentId)),
  unlinkPayback: a => unlinkPayback(String(a.paybackId)),
  createTag: a => createTag(String(a.name)),
  splitPayment: a => splitPayment(String(a.id), a.parts as Part[]),
  unsplitPayment: a => unsplitPayment(String(a.id)),
  applyPlan: a => applyPlan(String(a.planId), String(a.paymentId), (a.parts as Part[] | undefined) ?? null),
  createPlan: a => createPlan(a as unknown as PlanInput),
  updatePlan: a => updatePlan(String(a.id), a as unknown as PlanInput),
  cancelPlan: a => cancelPlan(String(a.id)),
  createCategory: a => createCategory(String(a.name), a.parentId ? Number(a.parentId) : null),
  editCategory: a => editCategory({}, form({ id: a.id, name: a.name, parent_id: a.parentId })),
  setSalary: a => setSalary({ personId: String(a.personId), fromMonth: String(a.fromMonth), annualSalary: Number(a.annualSalary), monthlyTax: a.monthlyTax == null || a.monthlyTax === '' ? null : Number(a.monthlyTax) }),
  setBudget: a => setBudget(Number(a.categoryId), a.monthly == null || a.monthly === '' ? null : Number(a.monthly)),
  saveRecurring: a => saveRecurring({
    id: a.id ? Number(a.id) : undefined,
    label: String(a.label ?? ''),
    amount: a.amount == null || a.amount === '' ? null : Number(a.amount),
    dayOfMonth: Number(a.dayOfMonth),
    categoryId: a.categoryId ? Number(a.categoryId) : null,
    scope: a.scope === 'claimable' ? 'claimable' : 'household',
    paidBy: String(a.paidBy ?? ''),
    active: a.active !== false,
  }),
  removeRecurring: a => removeRecurring(Number(a.id)),
  runRecurring: () => runNow(),
  updateRule: a => updateRule({}, form({ id: a.id, category_id: a.categoryId, default_scope: a.scope })),
  deleteRule: a => deleteRule({}, form({ id: a.id })),
  createRule: a => createRule(a as Parameters<typeof createRule>[0]),
  saveRule: a => saveRule(Number(a.id), a as Parameters<typeof saveRule>[1]),
  previewRule: a => previewRule(a as Parameters<typeof previewRule>[0]),
  applyRuleToPast: a => applyRuleToPast(Number(a.id), a.includeFiled === true),
  markSettled: a => markSettled(a.ids as string[], (a.payoutId as string) ?? null),
  unsettle: a => unsettle(String(a.id)),
  notClaimable: a => notClaimable(String(a.id)),
  previewStatement: a => previewStatement(String(a.text ?? '')),
  importStatement: a => importStatement(String(a.text ?? '')),
  importBulk: a => importBulk(String(a.text ?? ''), Number(a.offset ?? 0)),
  readHistoryShot: a => readHistoryShot(a as Parameters<typeof readHistoryShot>[0]),
  addHistoryRows: a => addHistoryRows(a as Parameters<typeof addHistoryRows>[0]),
  closeGap: a => closeGap(Number(a.id)),
}

export async function POST(req: Request) {
  if (!req.headers.get('authorization')?.startsWith('Bearer ')) return Response.json({ error: 'Sign in first.' }, { status: 401 })
  const { data } = await (await supabaseServer()).auth.getUser()
  if (!data.user) return Response.json({ error: 'That sign-in has expired. Sign in again.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { action?: string; args?: Args } | null
  const run = body?.action ? ACTIONS[body.action] : undefined
  if (!run) return Response.json({ error: `Unknown action ${body?.action ?? ''}` }, { status: 400 })
  try {
    return Response.json(await run(body?.args ?? {}) ?? { ok: true })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
