const express = require("express");

function createPlaceholderRouter(name) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.status(200).json({
      success: true,
      message: `${name} route group is mounted.`,
      implementedInPhase: "Later phase"
    });
  });

  return router;
}

module.exports = createPlaceholderRouter;
