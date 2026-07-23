const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const JobSeeker = require("../models/JobSeeker");
const SubscriptionPayment = require("../models/SubscriptionPayment");
const {
  getPlans,
  getPlan,
  createCheckoutSession: createProviderCheckoutSession,
  verifyRazorpaySignature,
  calculateExpiry
} = require("../services/subscriptionService");
const { requireNonEmptyString } = require("../utils/validation");

function assertBillableRole(req) {
  if (req.user.role !== "seeker") {
    throw new ApiError(403, "Subscriptions are available only for applicant accounts.");
  }
}

function getOwnerFilter(req) {
  return { seekerId: req.user.id, accountRole: "seeker" };
}

async function findProfile(req) {
  return JobSeeker.findById(req.user.id);
}

function buildSubscriptionSnapshot(req, profile, latestPayment) {
  return {
    accountRole: "seeker",
    isPro: profile.isPro,
    plan: profile.subscriptionPlan,
    status: profile.subscriptionStatus,
    proExpiresAt: profile.proExpiresAt,
    latestPayment
  };
}

const listPlans = asyncHandler(async (req, res) => {
  assertBillableRole(req);

  return sendSuccess(res, {
    message: "Subscription plans fetched successfully.",
    accountRole: "seeker",
    plans: getPlans("seeker")
  });
});

const getMySubscription = asyncHandler(async (req, res) => {
  assertBillableRole(req);

  const [profile, latestPayment] = await Promise.all([
    findProfile(req),
    SubscriptionPayment.findOne(getOwnerFilter(req)).sort({ createdAt: -1 })
  ]);

  if (!profile) {
    throw new ApiError(404, "Applicant not found.");
  }

  return sendSuccess(res, {
    message: "Subscription fetched successfully.",
    subscription: buildSubscriptionSnapshot(req, profile, latestPayment)
  });
});

const createCheckoutSession = asyncHandler(async (req, res) => {
  assertBillableRole(req);

  const planId = requireNonEmptyString(req.body.plan, "plan");
  const plan = getPlan(req.user.role, planId);

  if (!plan) {
    throw new ApiError(400, "plan must be monthly or yearly.");
  }

  const profile = await findProfile(req);
  if (!profile) {
    throw new ApiError(404, "Applicant not found.");
  }

  let checkoutSession;
  try {
    checkoutSession = await createProviderCheckoutSession({
      accountRole: req.user.role,
      accountId: profile._id,
      plan
    });
  } catch (error) {
    throw new ApiError(502, error.message || "Payment gateway checkout failed.");
  }

  const payment = await SubscriptionPayment.create({
    seekerId: profile._id,
    accountRole: "seeker",
    plan: plan.id,
    planCategory: plan.category,
    amount: plan.amount,
    currency: plan.currency,
    provider: checkoutSession.provider,
    providerSessionId: checkoutSession.providerSessionId,
    metadata: checkoutSession.metadata
  });

  return sendSuccess(res, {
    message: "Checkout session created successfully.",
    checkout: {
      id: payment.providerSessionId,
      provider: payment.provider,
      checkoutUrl: checkoutSession.checkoutUrl,
      publicKey: checkoutSession.publicKey,
      gatewayAmount: checkoutSession.gatewayAmount,
      amount: payment.amount,
      currency: payment.currency,
      plan
    }
  }, 201);
});

const confirmCheckoutSession = asyncHandler(async (req, res) => {
  assertBillableRole(req);

  const checkoutSessionId = requireNonEmptyString(req.body.checkoutSessionId, "checkoutSessionId");
  const payment = await SubscriptionPayment.findOne({
    providerSessionId: checkoutSessionId,
    ...getOwnerFilter(req)
  }).select("+providerSignature");

  if (!payment) {
    throw new ApiError(404, "Checkout session not found.");
  }

  if (payment.status === "Paid") {
    const existingProfile = await findProfile(req);
    return sendSuccess(res, {
      message: "Subscription already active.",
      profile: existingProfile,
      payment
    });
  }

  if (payment.provider === "razorpay") {
    const razorpayPaymentId = requireNonEmptyString(req.body.razorpayPaymentId, "razorpayPaymentId");
    const razorpaySignature = requireNonEmptyString(req.body.razorpaySignature, "razorpaySignature");
    const isValidSignature = verifyRazorpaySignature({
      orderId: payment.providerSessionId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature
    });

    if (!isValidSignature) {
      throw new ApiError(400, "Payment signature verification failed.");
    }

    payment.providerPaymentId = razorpayPaymentId;
    payment.providerSignature = razorpaySignature;
  }

  const plan = getPlan(req.user.role, payment.plan);
  if (!plan) {
    throw new ApiError(400, "Subscription plan is no longer available.");
  }

  const profile = await findProfile(req);
  if (!profile) {
    throw new ApiError(404, "Applicant not found.");
  }

  const now = new Date();
  const expiresAt = calculateExpiry(plan, now);

  profile.isPro = true;
  profile.subscriptionPlan = plan.id;
  profile.subscriptionStatus = "Active";
  profile.proStartedAt = now;
  profile.proExpiresAt = expiresAt;

  payment.status = "Paid";
  payment.paidAt = now;
  payment.expiresAt = expiresAt;

  await Promise.all([profile.save(), payment.save()]);

  return sendSuccess(res, {
    message: "Payment confirmed. Pro subscription is active.",
    profile,
    payment
  });
});

module.exports = {
  listPlans,
  getMySubscription,
  createCheckoutSession,
  confirmCheckoutSession
};
