const mongoose = require('mongoose');

const PromotionSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Promotion name is required'] 
  },
  type: {
    type: String,
    enum: ['flash_sale', 'bogo', 'free_shipping', 'discount'],
    required: true
  },
  discount: { 
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  minOrder: { 
    type: Number,
    default: 0
  },
  products: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product' 
  }],
  startDate: { 
    type: Date,
    default: Date.now
  },
  endDate: { 
    type: Date 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Promotion', PromotionSchema);
