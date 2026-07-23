import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../services/api";
import { AutoDismissFeedback } from "../../components/AutoDismissFeedback";

function formatCurrency(amount, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(value) {
  if (!value) {
    return "Not active";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not active";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function PlanCard({ plan, selected, onSelect }) {
  return (
    <button
      type="button"
      className={selected ? "plan-card selected" : "plan-card"}
      onClick={() => onSelect(plan.id)}
    >
      <div className="section-head">
        <div>
          <span className="plan-card__label">{plan.label}</span>
          <strong>{formatCurrency(plan.amount, plan.currency)}</strong>
        </div>
        <span className="pill">{plan.durationDays} days</span>
      </div>
      <ul className="simple-list">
        {(plan.features || []).map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </button>
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

  if (!isBillableRole) {
    return (
      <section className="info-card">
        <h3>Billing unavailable</h3>
        <p>Subscriptions are available only for applicant Pro accounts.</p>
      </section>
    );
  }

  const plans = plansQuery.data?.plans || [];
  const subscription = subscriptionQuery.data?.subscription || {};

  return (
    <section className="dashboard-stack">
      <AutoDismissFeedback
        feedback={feedback}
        onClear={() => setFeedback({ type: "", message: "" })}
      />

      <section className="stats-grid">
        <article className="stat-surface">
          <span>Current plan</span>
          <strong>{subscription.isPro ? "Pro" : "Normal"}</strong>
          <small>{subscription.plan || "No paid plan active"}</small>
        </article>
        <article className="stat-surface">
          <span>Status</span>
          <strong>{subscription.status || "None"}</strong>
          <small>Subscription state</small>
        </article>
        <article className="stat-surface">
          <span>Valid until</span>
          <strong>{formatDate(subscription.proExpiresAt)}</strong>
          <small>Plan expiry date</small>
        </article>
        <article className="stat-surface">
          <span>Payment gateway</span>
          <strong>{checkout?.provider || "Ready"}</strong>
          <small>Mock locally, Razorpay when configured</small>
        </article>
      </section>

      <section className="subscription-layout">
        <article className="info-card">
          <div className="section-head">
            <div>
              <h3>Select a plan</h3>
              <p>
                Monthly is flexible; yearly is cheaper for long-term job search automation.
              </p>
            </div>
            {subscription.isPro ? <span className="pill accent">Already Pro</span> : null}
          </div>

          <div className="plan-grid">
            {plansQuery.isLoading ? <p>Loading plans...</p> : null}
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan === plan.id}
                onSelect={setSelectedPlan}
              />
            ))}
          </div>

          <div className="form-inline-action subscription-actions">
            <button
              type="button"
              onClick={() => {
                setFeedback({ type: "", message: "" });
                checkoutMutation.mutate();
              }}
              disabled={checkoutMutation.isPending}
            >
              {checkoutMutation.isPending ? "Creating checkout..." : "Create checkout"}
            </button>
            <Link className="inline-link" to="/pro/tools">
              View Pro tools
            </Link>
          </div>
        </article>

        <aside className="info-card">
          <div className="section-head">
            <div>
              <h3>Checkout</h3>
              <p>
                {checkout?.provider === "razorpay"
                  ? "Razorpay is configured. This will open the real payment checkout."
                  : "Local development uses mock payment; production can use Razorpay via environment variables."}
              </p>
            </div>
          </div>

          {checkout ? (
            <div className="checkout-card">
              <span className="pill">{checkout.provider}</span>
              <h3>{checkout.plan?.label}</h3>
              <strong>{formatCurrency(checkout.amount, checkout.currency)}</strong>
              <p>Checkout ID: {checkout.id}</p>
              <p>
                {checkout.provider === "razorpay"
                  ? "After successful payment, the backend verifies the Razorpay signature before activating the plan."
                  : "Confirm payment to simulate a successful transaction and activate the plan."}
              </p>
              <button
                type="button"
                onClick={handlePayNow}
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending
                  ? "Confirming..."
                  : checkout.provider === "razorpay"
                    ? "Pay with Razorpay"
                    : "Confirm mock payment"}
              </button>
            </div>
          ) : (
            <div className="empty-state-card">
              <h4>No checkout yet</h4>
              <p>Select a plan and create checkout to begin the billing flow.</p>
            </div>
          )}
        </aside>
      </section>
    </section>
  );
}
