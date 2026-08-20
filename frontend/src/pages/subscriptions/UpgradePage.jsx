import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

/* ===============================================================================================
   Upgrade / subscription (/upgrade) — seeker-only.
   ===============================================================================================
   This page's DATA was already correct before the restyle and none of it was touched: every
   price, currency, duration and feature bullet comes from GET /subscriptions/plans, and the
   current plan / status / expiry come from GET /subscriptions/me. Nothing is inlined here.

   TWO THINGS I VERIFIED IN THE BACKEND BEFORE WRITING ANY COPY:

   1. Re-checkout by an ACTIVE Pro user does NOT extend the existing term.
      subscriptionController.confirmCheckoutSession does:
          const now = new Date();
          const expiresAt = calculateExpiry(plan, now);   // now + plan.durationDays
          profile.proExpiresAt = expiresAt;
      It calculates from `now`, not from the existing proExpiresAt, and assigns rather than adds.
      So a seeker with 300 days left who confirms a 30-day plan ends up with 30 days, losing 270.
      That is a REPLACE, not a renewal — so the button is NOT labelled "Renew" or "Extend"
      (both would be false), the existing neutral "Create checkout" wording is kept, and the
      consequence is stated plainly next to it. Flagged as a pre-existing bug in the summary;
      fixing it is a backend change and this is a styling task.

   2. The "Expired" status is written LAZILY, by requireSeekerPro, when a Pro-gated endpoint is
      called. GET /subscriptions/me runs requireAuth only, so it can still report status
      "Active" for a term whose proExpiresAt has already passed. The status pill therefore takes
      its TONE from the effective state (date vs now) while its TEXT stays the stored value, and
      a helper line explains the discrepancy instead of quietly showing green.

   The root .upgrade-page is a TRANSPARENT LAYOUT CONTAINER — no background, no padding of its
   own. .main-panel already pads and scrolls this region; a root that paints its own surface is
   what made .pro-home render as one giant card in dark mode.
   =============================================================================================== */

// Tone per stored subscriptionStatus value. The enum is ["None","Active","Expired","Cancelled"]
// on JobSeeker — anything unrecognised falls back to neutral rather than to green.
const STATUS_TONE = {
  Active: "ok",
  Expired: "warn",
  Cancelled: "warn",
  None: "muted"
};

// Currency comes from the API row every time — there is no default, because guessing one would
// print the wrong symbol the moment a second currency is configured. No amount is formatted
// without the currency that belongs to it.
function formatCurrency(amount, currency) {
  if (!Number.isFinite(amount) || !currency) {
    return null;
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// Derived, never asserted. Needs BOTH plans, in the SAME currency, with a positive baseline and
// an annual price that is actually lower — if any of that is missing the badge simply does not
// render. The formula compares twelve monthly terms against one yearly term.
function computeYearlySaving(plans) {
  const monthly = plans.find((plan) => plan.id === "monthly");
  const yearly = plans.find((plan) => plan.id === "yearly");

  if (!monthly || !yearly) {
    return null;
  }

  const monthlyEquivalent = monthly.amount * 12;

  if (!Number.isFinite(monthlyEquivalent) || monthlyEquivalent <= 0) {
    return null;
  }

  if (!Number.isFinite(yearly.amount) || yearly.amount >= monthlyEquivalent) {
    return null;
  }

  return Math.round(((monthlyEquivalent - yearly.amount) / monthlyEquivalent) * 100);
}

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function Icon({ path, className = "up-icon" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const ICONS = {
  spark: <><path d="M12 3v3" /><path d="M12 18v3" /><path d="M4.9 4.9 7 7" /><path d="m17 17 2.1 2.1" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="M4.9 19.1 7 17" /><path d="m17 7 2.1-2.1" /><circle cx="12" cy="12" r="3" /></>,
  pulse: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>,
  calendar: <><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>,
  card: <><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" /><path d="M8 8h8" /><path d="M8 12h8" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>
};

function StatCard({ icon, label, value, helper, pill }) {
  return (
    <li className="up-card up-kpi">
      <div className="up-kpi__head">
        <p className="up-kpi__label">{label}</p>
        <span className="up-tile up-tile--muted">
          <Icon path={icon} className="up-icon up-icon--sm" />
        </span>
      </div>
      <p className={`up-kpi__value${value ? "" : " up-kpi__value--none"}`}>{value || "—"}</p>
      <div className="up-kpi__foot">
        {pill}
        <span className="up-kpi__helper">{helper}</span>
      </div>
    </li>
  );
}

function PlanCard({ plan, selected, onSelect, savingPercent }) {
  const price = formatCurrency(plan.amount, plan.currency);

  return (
    <label className={`up-plan${selected ? " up-plan--selected" : ""}`}>
      <input
        className="up-plan__radio"
        type="radio"
        name="up-plan"
        value={plan.id}
        checked={selected}
        onChange={() => onSelect(plan.id)}
      />
      <span className="up-plan__body">
        <span className="up-plan__head">
          <span className="up-plan__label">{plan.label}</span>
          {savingPercent === null ? null : (
            <span className="up-plan__saving">Save {savingPercent}%</span>
          )}
        </span>

        <span className="up-plan__price">
          {price || <span className="up-plan__price-none">Price unavailable</span>}
        </span>

        <span className="up-plan__term">
          {Number.isFinite(plan.durationDays) ? `${plan.durationDays} days of access` : "Term unavailable"}
        </span>

        <span className="up-plan__features">
          {(plan.features || []).map((feature) => (
            <span className="up-plan__feature" key={feature}>
              <Icon path={ICONS.check} className="up-icon up-icon--sm up-plan__tick" />
              <span>{feature}</span>
            </span>
          ))}
        </span>
      </span>
    </label>
  );
}

export function UpgradePage() {
  const { session, replaceProfile, refreshSession } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [checkout, setCheckout] = useState(null);
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  const isBillableRole = session?.role === "seeker";

  const plansQuery = useQuery({
    queryKey: ["subscriptions", "plans", session?.role],
    queryFn: () =>
      apiRequest("/subscriptions/plans", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && isBillableRole),
  });

  const subscriptionQuery = useQuery({
    queryKey: ["subscriptions", "me", session?.role],
    queryFn: () =>
      apiRequest("/subscriptions/me", {
        token: session.accessToken,
      }),
    enabled: Boolean(session?.accessToken && isBillableRole),
  });

  const confirmMutation = useMutation({
    mutationFn: (paymentPayload = {}) =>
      apiRequest("/subscriptions/confirm", {
        method: "POST",
        token: session.accessToken,
        body: {
          checkoutSessionId: checkout?.id,
          ...paymentPayload,
        },
      }),
    onSuccess: async (response) => {
      replaceProfile(response.profile);
      await refreshSession?.();
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      setFeedback({
        type: "success",
        message: response.message || "Subscription activated.",
      });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  const checkoutMutation = useMutation({
    mutationFn: () =>
      apiRequest("/subscriptions/checkout", {
        method: "POST",
        token: session.accessToken,
        body: {
          plan: selectedPlan,
        },
      }),
    onSuccess: (response) => {
      setCheckout(response.checkout);
      setFeedback({
        type: "success",
        message:
          response.checkout.provider === "razorpay"
            ? "Razorpay checkout created. Complete payment to activate the plan."
            : "Mock checkout created. Confirm payment to activate the plan.",
      });
    },
    onError: (error) => setFeedback({ type: "error", message: error.message }),
  });

  async function handlePayNow() {
    if (!checkout) {
      return;
    }

    setFeedback({ type: "", message: "" });

    if (checkout.provider === "mock") {
      confirmMutation.mutate();
      return;
    }

    const loaded = await loadRazorpayCheckout();
    if (!loaded || !window.Razorpay) {
      setFeedback({
        type: "error",
        message: "Unable to load Razorpay checkout. Please check your network and try again.",
      });
      return;
    }

    const razorpay = new window.Razorpay({
      key: checkout.publicKey,
      amount: checkout.gatewayAmount,
      currency: checkout.currency,
      name: "SGETAI",
      description: checkout.plan?.label || "Subscription",
      order_id: checkout.id,
      handler(response) {
        confirmMutation.mutate({
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      prefill: {
        email: session.email,
      },
      theme: {
        color: "#2563eb",
      },
    });

    razorpay.open();
  }

  const plans = plansQuery.data?.plans || [];
  const subscription = subscriptionQuery.data?.subscription || {};

  const savingPercent = useMemo(() => computeYearlySaving(plans), [plans]);

  const isPro = Boolean(subscription.isPro);
  const expiresAt = subscription.proExpiresAt || null;
  const validUntil = formatDate(expiresAt);
  // Derived from the date the API already returned — not a second source of truth, and the only
  // way to tell a genuinely active term from a stale "Active" that requireSeekerPro has not
  // lazily corrected yet.
  const hasLapsed = Boolean(expiresAt) && new Date(expiresAt).getTime() < Date.now();
  const storedStatus = subscription.status || "None";
  const statusTone = hasLapsed && storedStatus === "Active" ? "warn" : STATUS_TONE[storedStatus] || "muted";

  const activePlan = subscription.plan ? plans.find((plan) => plan.id === subscription.plan) : null;

  if (!isBillableRole) {
    return (
      <section className="upgrade-page" aria-labelledby="up-blocked-title">
        <article className="up-card up-blocked">
          <span className="up-tile up-tile--muted">
            <Icon path={ICONS.card} />
          </span>
          <h1 className="up-card__title" id="up-blocked-title">
            Billing unavailable
          </h1>
          <p className="up-card__sub">Subscriptions are available only for applicant Pro accounts.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="upgrade-page" aria-labelledby="up-hero-title">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <header className="up-hero">
        <div className="up-hero__text">
          <p className="up-eyebrow">Billing</p>
          <h1 className="up-hero__title" id="up-hero-title">
            {isPro ? "Your Pro subscription" : "Upgrade to Pro"}
          </h1>
          <p className="up-hero__sub">
            {isPro
              ? validUntil
                ? `Pro is ${hasLapsed ? "recorded as active but the term ended on" : "active until"} ${validUntil}.`
                : "Pro is active on your account."
              : "Pro is billed one term at a time — pick a plan below, pay once, and it stays active until that term ends."}
          </p>
        </div>

        {/* For an already-Pro seeker the useful action is getting to what they paid for — not
            buying again. Checkout stays available below, demoted. */}
        {isPro ? (
          <Link className="up-btn up-btn--primary" to="/pro/tools">
            Open Pro tools
          </Link>
        ) : null}
      </header>

      <ul className="up-stats">
        <StatCard
          icon={ICONS.spark}
          label="Current plan"
          value={isPro ? activePlan?.label || "Pro" : "Normal"}
          helper={subscription.plan ? "Paid plan on your account" : "No paid plan active"}
        />
        <StatCard
          icon={ICONS.pulse}
          label="Status"
          value={storedStatus}
          pill={
            <span className={`up-pill up-pill--${statusTone}`}>
              {hasLapsed && storedStatus === "Active" ? "Term ended" : storedStatus}
            </span>
          }
          helper={
            hasLapsed && storedStatus === "Active"
              ? "Rechecked next time you open a Pro feature"
              : "Subscription state"
          }
        />
        <StatCard
          icon={ICONS.calendar}
          label="Valid until"
          value={validUntil}
          helper={validUntil ? "Plan expiry date" : "Not active"}
        />
        <StatCard
          icon={ICONS.card}
          label="Payment gateway"
          value={checkout?.provider || "Ready"}
          helper={checkout ? "Provider for this checkout" : "Confirmed when you create a checkout"}
        />
      </ul>

      <div className="up-split">
        <article
          className={`up-card up-plans${isPro ? " up-plans--secondary" : ""}`}
          aria-labelledby="up-plans-title"
        >
          <div className="up-card__head">
            <div>
              <p className="up-eyebrow">{isPro ? "Change plan" : "Step 1"}</p>
              <h2 className="up-card__title" id="up-plans-title">
                {isPro ? "Buy another term" : "Select a plan"}
              </h2>
              <p className="up-card__sub">
                Monthly is flexible; yearly is cheaper for long-term job search automation.
              </p>
            </div>
            {isPro ? <span className="up-pill up-pill--accent">Already Pro</span> : null}
          </div>

          {/* Verified against confirmCheckoutSession, which assigns proExpiresAt = now +
              durationDays rather than adding to the existing expiry. Shown only to seekers who
              actually have time left to lose. */}
          {isPro && !hasLapsed ? (
            <p className="up-notice up-notice--warn">
              <Icon path={ICONS.alert} className="up-icon up-icon--sm" />
              <span>
                Confirming a new payment starts a fresh term from that day. Days remaining on your
                current term are replaced, not added to
                {validUntil ? `, so buying now would move your expiry off ${validUntil}` : ""}.
              </span>
            </p>
          ) : null}

          {plansQuery.isLoading ? (
            <p className="up-empty">Loading plans…</p>
          ) : plansQuery.isError ? (
            <p className="up-error">{plansQuery.error?.message || "Could not load the plans."}</p>
          ) : plans.length === 0 ? (
            <p className="up-empty">No subscription plans are available right now.</p>
          ) : (
            <fieldset className="up-plan-grid">
              <legend className="up-sr-only">Subscription plan</legend>
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={selectedPlan === plan.id}
                  onSelect={setSelectedPlan}
                  savingPercent={plan.id === "yearly" ? savingPercent : null}
                />
              ))}
            </fieldset>
          )}

          <div className="up-actions">
            <button
              className={`up-btn${isPro ? "" : " up-btn--primary"}`}
              type="button"
              onClick={() => {
                setFeedback({ type: "", message: "" });
                checkoutMutation.mutate();
              }}
              disabled={checkoutMutation.isPending}
              aria-busy={checkoutMutation.isPending}
            >
              {checkoutMutation.isPending ? "Creating checkout…" : "Create checkout"}
            </button>
            {isPro ? null : (
              <Link className="up-link" to="/pro/tools">
                View Pro tools
              </Link>
            )}
          </div>
        </article>

        <aside className="up-card up-checkout" aria-labelledby="up-checkout-title">
          <div className="up-card__head">
            <div>
              <p className="up-eyebrow">{isPro ? "Payment" : "Step 2"}</p>
              <h2 className="up-card__title" id="up-checkout-title">
                Checkout
              </h2>
              <p className="up-card__sub">
                {checkout?.provider === "razorpay"
                  ? "Razorpay is configured. This will open the real payment checkout."
                  : "Local development uses mock payment; production can use Razorpay via environment variables."}
              </p>
            </div>
          </div>

          {checkout ? (
            <div className="up-session">
              <div className="up-session__head">
                <span className="up-pill">{checkout.provider}</span>
                <span className="up-session__plan">{checkout.plan?.label}</span>
              </div>

              <p className="up-session__amount">
                {formatCurrency(checkout.amount, checkout.currency) || "Amount unavailable"}
              </p>

              <dl className="up-session__meta">
                <dt>Checkout ID</dt>
                <dd>{checkout.id}</dd>
              </dl>

              <p className="up-notice">
                <Icon path={ICONS.info} className="up-icon up-icon--sm" />
                <span>
                  {checkout.provider === "razorpay"
                    ? "After successful payment, the backend verifies the Razorpay signature before activating the plan."
                    : "Confirm payment to simulate a successful transaction and activate the plan."}
                </span>
              </p>

              <button
                className="up-btn up-btn--primary"
                type="button"
                onClick={handlePayNow}
                disabled={confirmMutation.isPending}
                aria-busy={confirmMutation.isPending}
              >
                {confirmMutation.isPending
                  ? "Confirming…"
                  : checkout.provider === "razorpay"
                    ? "Pay with Razorpay"
                    : "Confirm mock payment"}
              </button>
            </div>
          ) : (
            <div className="up-empty-state">
              <span className="up-tile up-tile--muted up-tile--lg">
                <Icon path={ICONS.receipt} />
              </span>
              <p className="up-empty-state__title">No checkout yet</p>
              <p className="up-empty-state__sub">
                Select a plan and create checkout to begin the billing flow.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
