const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  cleanId: {
    type: String,
    required: true,
    trim: true
  },
  brandCode: {
    type: String,
    required: true,
    default: '0'
  },
  url: {
    type: String,
    required: true
  },
  logo: {
    type: String,
    default: ''
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create index for faster lookups
BrandSchema.index({ id: 1 });
BrandSchema.index({ cleanId: 1 });
BrandSchema.index({ name: 1 });

module.exports = mongoose.model('Brand', BrandSchema);