const crypto = require("crypto");

const applicantPlans = {
  monthly: {
    id: "monthly",
    category: "applicant_pro",
    label: "Monthly Pro",
    amount: 499,
    currency: "INR",
    durationDays: 30,
    features: [
      "AI personal assistant",
      "AI auto-apply controls",
      "AI resume generation",
      "Pre-apply match checks",
      "Real-time Pro workflow updates"
    ]
  },
  yearly: {
    id: "yearly",
    category: "applicant_pro",
    label: "Yearly Pro",
    amount: 4999,
    currency: "INR",
    durationDays: 365,
    features: [
      "Everything in Monthly Pro",
      "Lower annual price",
      "Full-year auto-apply access",
      "Full-year AI resume generation",
      "Priority Pro workflow access"
    ]
  }
};

function getPlanMap() {
  return applicantPlans;
}

function getPlans() {
  return Object.values(getPlanMap());
}

function getPlan(accountRole, planId) {
  if (accountRole !== "seeker") {
    return null;
  }

  return getPlanMap()[planId] || null;
}

function getPaymentProvider() {
  const configuredProvider = String(process.env.PAYMENT_PROVIDER || process.env.PAYMENT_GATEWAY || "mock")
    .trim()
    .toLowerCase();

  if (
    configuredProvider === "razorpay" &&
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  ) {
    return "razorpay";
  }

  return "mock";
}

function createMockCheckoutSession({ accountRole, accountId, plan }) {
  const providerSessionId = `mock_checkout_${crypto.randomUUID()}`;

  return {
    provider: "mock",
    providerSessionId,
    checkoutUrl: `/upgrade?checkoutSessionId=${encodeURIComponent(providerSessionId)}`,
    metadata: {
      accountRole,
      accountId: String(accountId),
      plan: plan.id,
      category: plan.category,
      mode: "mock"
    }
  };
}

async function createRazorpayCheckoutSession({ accountRole, accountId, plan }) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const receipt = `sub_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: plan.amount * 100,
      currency: plan.currency,
      receipt,
      notes: {
        accountRole,
        accountId: String(accountId),
        plan: plan.id,
        category: plan.category
      }
    })
  });

  const order = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(order.error?.description || "Unable to create Razorpay order.");
  }

  return {
    provider: "razorpay",
    providerSessionId: order.id,
    checkoutUrl: null,
    publicKey: process.env.RAZORPAY_KEY_ID,
    gatewayAmount: order.amount,
    metadata: {
      accountRole,
      accountId: String(accountId),
      plan: plan.id,
      category: plan.category,
      receipt,
      razorpayOrder: order
    }
  };
}

async function createCheckoutSession({ accountRole, accountId, plan }) {
  if (getPaymentProvider() === "razorpay") {
    return createRazorpayCheckoutSession({ accountRole, accountId, plan });
  }

  return createMockCheckoutSession({ accountRole, accountId, plan });
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function calculateExpiry(plan, fromDate = new Date()) {
  const expiresAt = new Date(fromDate);
  expiresAt.setDate(expiresAt.getDate() + plan.durationDays);
  return expiresAt;
}

module.exports = {
  getPlans,
  getPlan,
  getPaymentProvider,
  createCheckoutSession,
  verifyRazorpaySignature,
  calculateExpiry
};
