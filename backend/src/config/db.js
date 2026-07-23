const mongoose = require("mongoose");

async function connectToDatabase() {
  const mongoUri = process.env.MONGO_URI;

  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

module.exports = {
  connectToDatabase
};
