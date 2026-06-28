const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String
  },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: Number,
    image: String
  }],
  total: { type: Number, required: true },
  subtotal: Number,
  tax: Number,
  shipping: Number,
  discount: Number,
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String
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
    enum: ['pending', 'paid', 'failed', 'refunded']
  },
  paymentId: String,
  trackingNumber: String,
  createdAt: { type: Date, default: Date.now }
});

// Generate order ID before saving
OrderSchema.pre('save', function(next) {
  if (!this.orderId) {
    this.orderId = `GM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
  next();
});

module.exports = mongoose.model('Order', OrderSchema);
