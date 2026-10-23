# UI/UX test cases — AI Employee web app

Automated with Playwright. Each ID below matches a test name in `apps/web/e2e/*.spec.ts`.

## How to run

```bash
pnpm --filter @ai-employee/web test:e2e          # all test cases (~3 min)
pnpm --filter @ai-employee/web test:e2e:audit    # screenshots of every page + accessibility report
npx playwright show-report e2e-report            # open the last results (run inside apps/web)
```

The tests start their own API (port 3101) and web app (port 3100) against the
**test database `ai_employee_test`**. They never touch the dev database. AI keys are
fake, so no AI credit is spent. Test accounts are created on first run:

| Account | Email | Password |
|---|---|---|
| Business owner | e2e-owner@ai-employee.test | E2eOwner@12345 |
| Platform admin | e2e-admin@ai-employee.test | E2eAdmin@12345 |

To track a newly found bug, write the test for the correct behaviour and add
`test.fail(true, "Known bug: ...")` as its first line. The suite stays green and
Playwright reports "expected to fail, but passed" once the bug is fixed.

Status key: ✅ passes. All bugs found in the 2026-10-23 review are fixed.

## 1. Login, sign-up and session — `auth.spec.ts`

| ID | Test case | Steps | Expected | Status |
|---|---|---|---|---|
| TC-AUTH-01 | Login page layout | Open /login | Email, Password, "Log in" and "Sign up" link shown | ✅ |
| TC-AUTH-02 | Empty login | Click Log in with empty fields | "Email and password are required." | ✅ |
| TC-AUTH-03 | Wrong password | Valid email + wrong password | Error shown, stays on /login | ✅ |
| TC-AUTH-04 | Correct login | Valid email + password | Opens /dashboard with "Good …, Esha" | ✅ |
| TC-AUTH-05 | Enter key submits | Type password, press Enter | Logged in | ✅ |
| TC-AUTH-06 | Sign-up validation | Submit empty, then 3-char password | Matching error messages, nothing sent | ✅ |
| TC-AUTH-07 | Sign up | Name, new email, valid password | Account created, opens /onboarding | ✅ |
| TC-AUTH-08 | Duplicate email | Sign up with an existing email | Error shown, stays on /signup | ✅ |
| TC-AUTH-09 | Pages need login | Logged out, open /, /dashboard, /settings, /admin | Sent to /login | ✅ |
| TC-AUTH-10 | Log out | Log in, click Log out, open /dashboard | Back on /login | ✅ |
| TC-AUTH-12 | Name in Sinhala | Sign up as "නිමල් පෙරේරා" | Account created | ✅ |
| TC-AUTH-11 | Same first name | Two people named "Amal …" sign up | Both accounts created | ✅ (fixed 2026-10-23) |

## 2. Navigation and page loading — `navigation.spec.ts`

| ID | Test case | Expected | Status |
|---|---|---|---|
| TC-NAV-01 | Click all 13 sidebar links | Right page and heading; link highlighted; no errors in the browser or 5xx from the API | ✅ |
| TC-NAV-02 | Pages outside the sidebar (/ai-configuration, /workflows, /onboarding) | Load with a heading and no errors | ✅ |
| TC-NAV-03 | Unknown record (/ai-employees/x, /channels/x, /conversations/x, /workflows/x) | Message shown inside the app, no crash | ✅ |
| TC-NAV-04 | Speed | Every main page shows its heading in under 5 s | ✅ |
| TC-NAV-05 | Top bar | Shows business name and signed-in email | ✅ |
| TC-NAV-06 | Notifications | Bell opens and closes the panel | ✅ |

## 3. Main features — `flows.spec.ts`

| ID | Test case | Expected | Status |
|---|---|---|---|
| TC-LOC-01 | Add, rename and remove a location | Each change shows in the table | ✅ |
| TC-LOC-02 | Close the add-location window | Escape and Cancel both close it | ✅ |
| TC-TEAM-01 | Add a team member (4-step window) | Step 1 blocks empty fields; one-time password shown; member listed | ✅ |
| TC-TEAM-02 | Team filter buttons | Selected "All" button has a visible background | ✅ (fixed: `accent` colour was undefined) |
| TC-SET-01 | Rename business in Settings | "Changes Saved!" and the new name is kept after reload | ✅ |
| TC-SET-02 | Top bar after rename | Top bar shows the new name | ✅ (fixed 2026-10-23) |
| TC-I18N-01 | Switch dashboard to Sinhala | Menu and "Log out" in Sinhala; kept after reload; switch back works | ✅ |
| TC-CC-01 | Command Center empty state | Suggested prompts and message box shown | ✅ |
| TC-CC-02 | Message box on a 1440×900 laptop | Box fully on screen | ✅ (fixed 2026-10-23) |
| TC-CC-03 | Floating "Setup 0/9" button | Does not cover the message box | ✅ (fixed 2026-10-23) |
| TC-DASH-01 | New business dashboard | Getting-started checklist, "0 of N steps done", setup wizard link | ✅ |
| TC-DASH-02 | Status card with no AI staff | Must not say AI staff are working | ✅ (fixed 2026-10-23) |
| TC-DASH-03 | Quick actions | "Store & Branch Locations" opens /locations | ✅ |

## 4. Platform admin console — `admin.spec.ts`

| ID | Test case | Expected | Status |
|---|---|---|---|
| TC-ADM-01 | All 11 admin pages | Load with the right heading, no errors | ✅ |
| TC-ADM-02 | Tenants list and search | Test businesses listed; search filters | ✅ |
| TC-ADM-03 | Open a tenant | Detail page with its name | ✅ |
| TC-ADM-04 | Admin who also owns a business | "Platform Console" link goes to /admin | ✅ |
| TC-ADM-05 | Business owner opens /admin | Sent back to /dashboard; no console link | ✅ |

## 5. Accessibility — `accessibility.spec.ts`

Checked with axe-core (WCAG 2 A/AA). Only "critical" problems fail a test; colour contrast is listed in the audit report.

| ID | Test case | Expected | Status |
|---|---|---|---|
| TC-A11Y-01 | Login and sign-up | No critical issues | ✅ |
| TC-A11Y-02 | Dashboard, Command Center, Conversations, Locations, Team, Channels, Business Info, Integrations | No critical issues | ✅ |
| TC-A11Y-03 | Settings and AI Employees | Every field and dropdown has a label | ✅ (fixed 2026-10-23) |
| TC-A11Y-04 | Pop-up windows | Announced as a dialog; ✕ button has a name | ✅ (fixed 2026-10-23) |
| TC-A11Y-06 | Admin console (dashboard, tenants, AI employees, usage, audit) | No critical issues | ✅ |
| TC-A11Y-07 | Text contrast on Dashboard, Team, Settings, AI Employees, Conversations | Meets WCAG AA (4.5:1) | ✅ |
| TC-A11Y-05 | Keyboard | Tab reaches the menu / top bar | ✅ |

## 6. Phone size (Pixel 7) — `mobile.spec.ts`

| ID | Test case | Expected | Status |
|---|---|---|---|
| TC-MOB-01 | Login on a phone | Form visible, no sideways scrolling | ✅ |
| TC-MOB-02 | Dashboard, Conversations, Settings, Team, Command Center | No sideways scrolling | ✅ |
| TC-MOB-03 | Main menu on a phone | Menu button opens navigation; picking a page goes there and closes it | ✅ (fixed 2026-10-23) |
| TC-MOB-05 | Closing the phone menu | Escape, ✕ and tapping outside all close it | ✅ |
| TC-MOB-06 | Phone top bar | Fits on one line; "Log out" doesn't wrap | ✅ |
| TC-MOB-04 | Admin console menu on a phone | A menu button opens navigation | ✅ (fixed 2026-10-23) |

## 7. Saved answers and reply modes — `saved-answers.spec.ts`

How customer replies work without AI is described in `docs/reply-engine.md`.
The customer side uses the public website-chat API, and the test API's AI key is
fake, so any reply that needed AI would fail.

| ID | Test case | Expected | Status |
|---|---|---|---|
| TC-SA-01 | Add a saved answer, then "Try a customer question" with misspelt Singlish ("kiyatada open krnne?") | Answer listed with "Not written" for missing Sinhala; the try box shows the Singlish answer | ✅ |
| TC-SA-02 | Save with no answer text | "Write the answer in at least one language." | ✅ |
| TC-SA-03 | Edit, turn off, turn on, delete (with confirm) | Each change shows in the right tab | ✅ |
| TC-SA-04 | Customer asks "what r ur opening hours" on the website chat | Gets the saved answer instantly; conversation shows "AI (Saved answer)" | ✅ |
| TC-SA-05 | No-AI mode: unknown question, then answer it from "Questions to answer" | Customer told a team member will reply; sidebar badge 1; "Asked 1×"; next customer gets the new answer | ✅ |
| TC-SA-06 | "Save as answer" on a staff reply in a conversation | Form pre-filled with the customer question and staff reply; no button on system notices | ✅ |
| TC-SA-07 | Dashboard "Answered without AI" tile | Shows a percentage | ✅ |
| TC-SA-08 | Admin removes "AI only" from the Free plan | Owner's Settings shows "AI only" disabled, "Not included in your plan" | ✅ |

API-level cases (19) are in `apps/api/test/integration/reply-engine.test.ts`; matcher cases (10 groups, ~70 phrasings) in `apps/api/test/answer-matcher.test.ts`.

## 8. Fixes made on 2026-10-23

| Problem | Fix |
|---|---|
| No navigation on phones | Menu button in the top bar opens the sidebar as a drawer (`components/layout/mobile-nav.tsx`), workspace and admin console |
| Same first name couldn't sign up | API adds a short unique ending to the business slug; names with no Latin letters fall back to "business" (`auth.service.ts`) |
| "All Systems Running Smoothly" with no AI staff | Dashboard now says "No AI employees yet" (or "All AI employees are paused") with a link to fix it |
| Top bar showed the old business name | Name updates right after saving and is refreshed from the server on each load |
| Command Center message box off screen / covered | App shell is exactly one screen tall with the content scrolling; Setup button sits higher on chat pages |
| Pop-ups not announced | `Modal` has `role="dialog"`, a title link, a named close button, focus moves in and returns; same labels on the 4 hand-built pop-ups |
| Unlabeled fields | Settings fields linked to labels; filter dropdowns and the setup progress bar named |
| Low contrast (434 spots) | Muted grey darkened to `#6e6c67`; green/amber text one shade darker; now 0 issues in the audit |
| Team page colours missing | `accent` colour defined in `tailwind.config.ts` |
| Business name hidden with 2+ locations | Name always shown; location picker moved under it |
| Phone top bar wrapping | Email hidden on phones, tighter padding, "Log out" never wraps |
