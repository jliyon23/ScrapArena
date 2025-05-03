const mongoose = require('mongoose');

// Custom schema type to handle dot-containing keys
class DotSafeObject extends mongoose.SchemaType {
  constructor(key, options) {
    super(key, options, 'DotSafeObject');
  }

  cast(val) {
    if (val == null) {
      return {};
    }
    if (typeof val !== 'object') {
      throw new Error('DotSafeObject: value must be an object');
    }
    return val;
  }
}

mongoose.Schema.Types.DotSafeObject = DotSafeObject;

// Sub-schema for phone specifications
const SpecCategorySchema = new mongoose.Schema({
  _id: false,
  specs: {
    type: mongoose.Schema.Types.DotSafeObject,
    default: {}
  }
}, { strict: false });

const PhoneSchema = new mongoose.Schema({
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
  url: {
    type: String,
    required: true
  },
  image: {
    type: String,
    default: ''
  },
  imageRetina: {
    type: String,
    default: ''
  },
  brandId: {
    type: String,
    required: true,
    ref: 'Brand'
  },
  specifications: {
    type: mongoose.Schema.Types.DotSafeObject,
    default: {}
  },
  specsLastUpdated: {
    type: Date,
    default: null
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Create indexes for faster lookups
PhoneSchema.index({ id: 1 });
PhoneSchema.index({ brandId: 1 });
PhoneSchema.index({ name: 'text' });

module.exports = mongoose.model('Phone', PhoneSchema);