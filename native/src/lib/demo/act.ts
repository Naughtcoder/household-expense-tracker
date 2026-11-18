// The demo's answer to the website's actions (lib/api.ts act()). The ones a
// visitor is likely to try work on the made-up data: filing from Review,
// adding a payment, categories, budgets, salaries, tags, splits, plans.
// Anything tied to a real bank or phone says it is switched off.

import { titleCase } from '@lib/cats.ts'
import { monthlyTaxOn } from '@lib/tax.ts'
import { db, newId, type Row } from './store'
import { splitPayment } from './rpc'
import { ROHAN } from './seed'

const OFF = 'This part is switched off in the demo. In the real app it works on your own bank messages.'
const txn = (id: unknown) => {
  const t = db.transactions.find(x => x.id === id)
  if (!t) throw new Error('That payment was not found.')
  return t
}

function addCategory(name: unknown, parentId: unknown) {
  const clean = titleCase(String(name ?? ''))
  if (!clean) throw new Error('Give it a name.')
  const parent = parentId ? Number(parentId) : null
  if (db.categories.some(c => String(c.name).toLowerCase() === clean.toLowerCase() && (c.parent_id ?? null) === parent))
    throw new Error(`There is already a ${clean} there.`)
  const id = Number(newId('categories'))
  db.categories.push({ id, name: clean, parent_id: parent })
  return id
}

export async function demoAct(action: string, a: Record<string, unknown>): Promise<Row> {
  switch (action) {
    case 'file': {
      const t = txn(a.id)
      const others = a.applyToAll ? db.transactions.filter(x => x.status === 'review' && x.merchant_key === t.merchant_key) : [t]
      for (const x of others) Object.assign(x, { category_id: a.categoryId ?? null, scope: a.scope ?? 'household', status: 'confirmed', merchant: a.merchant ?? x.merchant })
      return { ok: true, filed: others.length }
    }
    case 'ignore': Object.assign(txn(a.id), { status: 'ignored' }); return { ok: true }
    case 'markDuplicate': Object.assign(txn(a.id), { status: 'duplicate' }); return { ok: true }
    case 'keepBoth': Object.assign(txn(a.id), { possible_duplicate_of: null, status: 'confirmed' }); return { ok: true }
    case 'addCash': {
      const amount = Number(a.amount)
      if (!(amount > 0)) throw new Error('Give an amount.')
      db.transactions.push({
        id: newId('transactions'), amount, direction: a.direction === 'credit' ? 'credit' : 'debit', occurred_on: String(a.occurred_on || new Date().toISOString().slice(0, 10)),
        occurred_at: null, merchant: String(a.merchant || 'Cash'), merchant_key: String(a.merchant || 'CASH').toUpperCase(), merchant_raw: null,
        category_id: a.category_id ? Number(a.category_id) : a.direction === 'credit' ? 72 : null, paid_by: String(a.paid_by || ROHAN), entered_by: ROHAN,
        scope: String(a.scope || 'household'), status: a.category_id || a.direction === 'credit' ? 'confirmed' : 'review', bank: 'Cash', account_tail: null,
        flags: [], currency: 'INR', note: null, created_at: new Date().toISOString(), split_of: null, split_total: null,
      })
      return { ok: true, message: 'Added.' }
    }
    case 'createCategory': return { id: addCategory(a.name, a.parentId) }
    case 'editCategory': {
      const c = db.categories.find(x => x.id === Number(a.id))
      if (!c) throw new Error('Which category?')
      Object.assign(c, { name: titleCase(String(a.name ?? c.name)), parent_id: a.parentId ? Number(a.parentId) : null })
      return { ok: true }
    }
    case 'setBudget': {
      const id = Number(a.categoryId)
      db.budgets = db.budgets.filter(b => b.category_id !== id)
      if (a.monthly != null && a.monthly !== '') db.budgets.push({ category_id: id, monthly: Number(a.monthly), updated_at: new Date().toISOString() })
      return { ok: true }
    }
    case 'setSalary': {
      const annual = Number(a.annualSalary)
      if (!(annual > 0)) throw new Error('Give the yearly salary before tax.')
      const fromPayslip = a.monthlyTax != null && a.monthlyTax !== ''
      const monthly = fromPayslip ? Math.round(Number(a.monthlyTax)) : monthlyTaxOn(annual)
      const lakh = (annual / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })
      db.salary_tax_rates = db.salary_tax_rates.filter(r => !(r.person_id === a.personId && r.from_month === a.fromMonth))
      db.salary_tax_rates.push({ id: newId('salary_tax_rates'), person_id: a.personId, from_month: a.fromMonth, monthly_tax: monthly, annual_salary: annual, basis: fromPayslip ? `Payslip TDS, Rs ${lakh}L salary` : `Worked out: Rs ${lakh}L salary, new regime` })
      return { ok: true, monthlyTax: monthly }
    }
    case 'createTag': {
      const clean = String(a.name ?? '').trim()
      if (!clean) throw new Error('Give the tag a name.')
      const found = db.tags.find(t => String(t.name).toLowerCase() === clean.toLowerCase())
      if (found) return { id: found.id as number, name: found.name }
      const id = Number(newId('tags'))
      db.tags.push({ id, name: clean, archived: false, colour: null, created_at: new Date().toISOString() })
      return { id, name: clean }
    }
    case 'cover': Object.assign(txn(a.paymentId), { covered_by: a.transferId }); return { ok: true }
    case 'uncover': Object.assign(txn(a.paymentId), { covered_by: null }); return { ok: true }
    case 'linkPayback': { const p = txn(a.paymentId); Object.assign(txn(a.paybackId), { pays_back: p.id, category_id: p.category_id }); return { ok: true } }
    case 'unlinkPayback': Object.assign(txn(a.paybackId), { pays_back: null }); return { ok: true }
    case 'splitPayment': splitPayment(String(a.id), a.parts as never); return { ok: true }
    case 'unsplitPayment': {
      const t = txn(a.id)
      db.transactions = db.transactions.filter(x => x.split_of !== t.id)
      Object.assign(t, (t.split_restore as Row) ?? {}, { split_total: null, split_restore: null })
      return { ok: true }
    }
    case 'createPlan':
    case 'updatePlan': {
      const p = a as Record<string, unknown>
      const row = { paid_by: p.paidBy, payee_hint: p.payeeHint ?? null, expected_amount: p.expected, tolerance: p.tolerance ?? null, window_from: p.from, window_to: p.to, parts: p.parts, note: p.note ?? null }
      if (action === 'updatePlan') { Object.assign(db.planned_splits.find(x => x.id === p.id) ?? {}, row); return { ok: true, id: p.id as string } }
      const id = newId('planned_splits')
      db.planned_splits.push({ id, ...row, status: 'open', created_at: new Date().toISOString() })
      return { ok: true, id: id as string }
    }
    case 'cancelPlan': Object.assign(db.planned_splits.find(x => x.id === a.id) ?? {}, { status: 'cancelled' }); return { ok: true }
    case 'applyPlan': {
      const plan = db.planned_splits.find(x => x.id === a.planId)
      splitPayment(String(a.paymentId), (a.parts ?? plan?.parts) as never)
      if (plan) Object.assign(plan, { status: 'applied', applied_to: a.paymentId })
      return { ok: true }
    }
    case 'saveRecurring': {
      const row = { label: a.label, amount: a.amount, day_of_month: a.dayOfMonth, category_id: a.categoryId ?? null, scope: a.scope ?? 'household', paid_by: a.paidBy || ROHAN, active: a.active !== false }
      const found = a.id ? db.recurring.find(r => r.id === Number(a.id)) : null
      if (found) Object.assign(found, row)
      else db.recurring.push({ id: newId('recurring'), ...row, last_amount: a.amount, note: null })
      return { ok: true }
    }
    case 'removeRecurring': db.recurring = db.recurring.filter(r => r.id !== Number(a.id)); return { ok: true }
    case 'runRecurring': return { ok: true, note: 'Nothing due today.' }
    case 'createCategoryRule':
    case 'createRule':
    case 'saveRule': {
      const row = { match_key: String(a.matchKey ?? a.match_key ?? '').toUpperCase(), merchant: a.merchant ?? null, category_id: a.categoryId ?? a.category_id ?? null, default_scope: a.scope ?? 'household', match_type: a.matchType ?? 'exact', ask: false, rule_shape: 'exact||||' }
      if (action === 'saveRule') { Object.assign(db.merchant_rules.find(r => r.id === Number(a.id)) ?? {}, row); return { ok: true, id: Number(a.id) } }
      const id = Number(newId('merchant_rules'))
      db.merchant_rules.push({ id, ...row, created_at: new Date().toISOString() })
      return { ok: true, id }
    }
    case 'updateRule': Object.assign(db.merchant_rules.find(r => r.id === Number(a.id)) ?? {}, { category_id: a.categoryId ?? null, default_scope: a.scope ?? 'household' }); return { ok: true }
    case 'deleteRule': db.merchant_rules = db.merchant_rules.filter(r => r.id !== Number(a.id)); return { ok: true }
    case 'previewRule': return { matches: 0, sample: [] }
    case 'applyRuleToPast': return { changed: 0 }
    case 'markSettled': for (const id of (a.ids as string[]) ?? []) Object.assign(txn(id), { claim_settled_on: new Date().toISOString().slice(0, 10) }); return { ok: true }
    case 'unsettle': Object.assign(txn(a.id), { claim_settled_on: null, settled_by: null }); return { ok: true }
    case 'notClaimable': Object.assign(txn(a.id), { scope: 'household' }); return { ok: true }
    default: throw new Error(OFF)
  }
}
