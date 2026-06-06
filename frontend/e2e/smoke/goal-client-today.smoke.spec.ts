import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'

// Issue #85 / ADR 0014 smoke: the client owns "today". A Goal change force-
// recomputes today's Weekly Review, and the review must be stamped on the
// *client's* local day — never the server's wall-clock day. Real-stack, no /api
// mocks: we drive the API directly so we can hand it a `clientToday` that is a
// different calendar day from the backend's own (the runner-vs-container skew
// that made `goal-recompute-budget` flake, #84). Asserting the review lands on
// that client day — not the backend's today — proves the server honoured it.
const API = 'http://localhost:8080/api'

interface ReviewRow {
  reviewedOn: string
}

test("a goal change recomputes the review on the client's local day, not the server's", async ({
  request,
}) => {
  // A client day deliberately offset from the backend's own today (within the
  // ±1-day plausibility tolerance), so the assertion can't pass by coincidence.
  const clientDay = isoShiftDays(todayIso(), -1)

  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await request.post(`${API}/weight`, {
    data: { date: clientDay, weightKg: 85, clientToday: clientDay },
  })

  const created = await request.post(`${API}/goal`, {
    data: {
      startedOn: clientDay,
      startWeightKg: 85,
      targetWeightKg: 80,
      rateKgPerWeek: 0.5,
      clientToday: clientDay,
    },
  })
  expect(created.status()).toBe(201)

  // The forced recompute is dated the client's day. Read the latest review and
  // assert its date is the client's day — proof the server stamped the client's
  // today rather than its own.
  const history = (await (
    await request.get(`${API}/weekly-review/history`)
  ).json()) as ReviewRow[]
  const latest = history.reduce((a, b) =>
    a.reviewedOn >= b.reviewedOn ? a : b,
  )
  expect(latest.reviewedOn).toBe(clientDay)
})
