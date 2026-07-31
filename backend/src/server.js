const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const { validateEnv } = require("./config/env");
const { connectToDatabase } = require("./config/db");
const { ensureSuperAdmin } = require("./utils/adminBootstrap");
const { verifyEmailConnection } = require("./utils/email");
const {
  verifySupabaseConnection,
  getSupabaseHealthStatus,
} = require("./utils/supabaseService");
const { initSocket } = require("./utils/socketServer");
const { startVerificationCron } = require("./workers/verificationCron");
const { startMidnightCron } = require("./workers/midnightCron");
const { sendSuccess } = require("./utils/apiResponse");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const connectionRoutes = require("./routes/connections");
const followRoutes = require("./routes/follows");
const seekerRoutes = require("./routes/seekers");
const organizationRoutes = require("./routes/organizations");
const notificationRoutes = require("./routes/notifications");
const postRoutes = require("./routes/posts");
const chatRoutes = require("./routes/chat");
const jobRoutes = require("./routes/jobs");
const applicationRoutes = require("./routes/applications");
const searchRoutes = require("./routes/search");
const analyticsRoutes = require("./routes/analytics");
const verificationRoutes = require("./routes/verification");
const recommendationRoutes = require("./routes/recommendations");
const proFeaturesRoutes = require("./routes/proFeatures");
const subscriptionRoutes = require("./routes/subscriptions");
const resumeRoutes = require("./routes/resume");
const resumeRagRoutes = require("./routes/resumeRag");
const adminRoutes = require("./routes/admin");
const dashboardRoutes = require("./routes/dashboard");
const feedbackRoutes = require("./routes/feedback");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || process.env.NODE_ENV !== "production") {
          return callback(null, true);
        }

        return callback(null, origin === process.env.FRONTEND_URL);
      },
      exposedHeaders: ["Content-Disposition", "Content-Length", "Content-Type"],
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (req, res) => {
    return sendSuccess(res, {
      message: "SGETAI backend foundation is healthy.",
      environment: process.env.NODE_ENV || "development",
      services: {
        database:
          mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        ai: (process.env.GEMINI_API_KEY || "").includes("replace_me")
          ? "fallback"
          : "configured",
        email: (process.env.EMAIL_PASS || "").includes("replace_me")
          ? "dev-fallback"
          : "configured",
        supabase: getSupabaseHealthStatus(),
      },
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/profile", profileRoutes);
  app.use("/api/connections", connectionRoutes);
  app.use("/api/follows", followRoutes);
  app.use("/api/seekers", seekerRoutes);
  app.use("/api/organizations", organizationRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/chat", chatRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use("/api/applications", applicationRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/analytics", analyticsRoutes);
  app.use("/api/verification", verificationRoutes);
  app.use("/api/recommendations", recommendationRoutes);
  app.use("/api/pro", proFeaturesRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/resume", resumeRoutes);
  app.use("/api/resume-rag", resumeRagRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/feedback", feedbackRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function bootstrap() {
  validateEnv();
  await connectToDatabase();
  await ensureSuperAdmin();

  try {
    await verifyEmailConnection();
  } catch (error) {
    console.warn("Email bootstrap warning:", error.message);
  }

  try {
    await verifySupabaseConnection();
  } catch (error) {
    console.warn("Supabase bootstrap warning:", error.message);
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  startVerificationCron();
  startMidnightCron();

  const port = Number(process.env.PORT) || 5000;

  const shutdown = async (signal) => {
    console.log(`Received ${signal}. Shutting down SGETAI backend...`);
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  httpServer.listen(port, () => {
    console.log(`SGETAI backend listening on port ${port}`);
  });

  return httpServer;
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error("Failed to bootstrap SGETAI backend:", error.message);
    process.exit(1);
  });
}

module.exports = {
  bootstrap,
  createApp,
};
