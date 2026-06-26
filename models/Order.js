const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { 
    type: String, 
    unique: true 
  },
  customer: {
    name: { 
      type: String, 
      required: [true, 'Customer name is required'] 
    },
    email: { 
      type: String, 
      required: [true, 'Customer email is required'],
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    phone: { 
      type: String,
      default: ''
    }
  },
  items: [{
    productId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Product' 
    },
    name: { type: String },
    price: { type: Number },
    quantity: { type: Number, default: 1 },
    image: { type: String }
  }],
  total: { 
    type: Number, 
    required: true,
    min: [0, 'Total cannot be negative']
  },
  subtotal: { 
    type: Number,
    default: 0
  },
  tax: { 
    type: Number,
    default: 0
  },
  shipping: { 
    type: Number,
    default: 0
  },
  discount: { 
    type: Number,
    default: 0
  },
  shippingAddress: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: 'US' }
  },
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled']
  },
  paymentMethod: { 
    type: String, 
    enum: ['stripe', 'paypal', 'cod'],
    default: 'cod'
  },
  paymentStatus: { 
    type: String, 
    default: 'pending',
    enum: ['pending', 'paid', 'failed']
  },
  paymentId: { 
    type: String,
    default: ''
  },
  trackingNumber: { 
    type: String,
    default: ''
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Generate order ID before saving
OrderSchema.pre('save', function(next) {
  if (!this.orderId) {
    this.orderId = `GM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
  next();
});

module.exports = mongoose.model('Order', OrderSchema);
