require("../config/env");

const mongoose = require("mongoose");
const { createApp } = require("../server");
const { connectToDatabase } = require("../config/db");
const { verifyEmailConnection } = require("../utils/email");
const { verifySupabaseConnection } = require("../utils/supabaseService");

(async () => {
  let server;
  try {
    await connectToDatabase();
    await verifyEmailConnection();
    await verifySupabaseConnection();

    const app = createApp();
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();

    console.log(JSON.stringify({
      ok: response.ok,
      status: response.status,
      body
    }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
  }
})();
