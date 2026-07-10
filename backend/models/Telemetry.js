const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema({
  sensor_id: {
    type: String,
    required: true
  },
  temperature_c: {
    type: Number,
    required: true
  },
  humidity_percent: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Telemetry', TelemetrySchema);
