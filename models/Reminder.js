const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  task: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  time: {
    type: Date,
    required: true
  },
  repeatType: {
    type: String,
    enum: ["none", "hourly", "every2hours", "daily", "weekly"],
    default: "none"
  },
  notificationsEnabled: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ["pending", "completed", "missed"],
    default: "pending"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Reminder", reminderSchema);