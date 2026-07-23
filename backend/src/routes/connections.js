const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  sendConnectionRequest,
  respondToConnection,
  getPendingConnections,
  getAcceptedConnections,
  removeConnection
} = require("../controllers/connectionController");

const router = express.Router();

router.use(requireAuth);
router.post("/request/:recipientId", sendConnectionRequest);
router.put("/respond/:connectionId", respondToConnection);
router.delete("/:connectionId", removeConnection);
router.get("/pending", getPendingConnections);
router.get("/", getAcceptedConnections);

module.exports = router;
