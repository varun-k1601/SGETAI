const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

let ioInstance = null;

function extractBearerToken(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  if (normalizedValue.startsWith("Bearer ")) {
    return normalizedValue.slice(7).trim();
  }

  return normalizedValue;
}

function resolveSocketToken(handshake = {}) {
  return extractBearerToken(
    handshake.auth?.token ||
    handshake.auth?.accessToken ||
    handshake.auth?.authorization ||
    handshake.headers?.authorization ||
    handshake.query?.token
  );
}

function verifySocketUserFromHandshake(handshake = {}) {
  const token = resolveSocketToken(handshake);

  if (!token) {
    throw new Error("Socket authentication token is required.");
  }

  const payload = jwt.verify(token, process.env.JWT_SECRET);

  if (!payload?.id || !payload?.role) {
    throw new Error("Socket authentication token payload is invalid.");
  }

  return {
    id: String(payload.id),
    role: String(payload.role),
    email: payload.email ? String(payload.email) : undefined
  };
}

function getUserRoom(user) {
  return `user:${String(user.role)}:${String(user.id)}`;
}

function initSocket(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || process.env.NODE_ENV !== "production") {
          return callback(null, true);
        }

        return callback(null, origin === process.env.FRONTEND_URL);
      },
      methods: ["GET", "POST", "PUT", "DELETE"]
    }
  });

  ioInstance.use((socket, next) => {
    try {
      const user = verifySocketUserFromHandshake(socket.handshake);
      socket.data.user = user;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  ioInstance.on("connection", (socket) => {
    socket.join(getUserRoom(socket.data.user));
    socket.emit("connected", {
      message: "Socket server initialized.",
      user: socket.data.user
    });
  });

  return ioInstance;
}

function getIO() {
  return ioInstance;
}

function emitToUser(user, eventName, payload) {
  if (!ioInstance || !user?.id || !user?.role) {
    return false;
  }

  ioInstance.to(getUserRoom(user)).emit(eventName, payload);
  return true;
}

module.exports = {
  init: initSocket,
  initSocket,
  getIO,
  emitToUser,
  getUserRoom,
  resolveSocketToken,
  verifySocketUserFromHandshake
};
