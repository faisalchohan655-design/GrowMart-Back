const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Product name is required'] 
  },
  description: { 
    type: String,
    default: ''
  },
  price: { 
    type: Number, 
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  comparePrice: { 
    type: Number,
    default: 0
  },
  category: { 
    type: String,
    default: 'Uncategorized'
  },
  images: [{ 
    type: String 
  }],
  stock: { 
    type: Number, 
    default: 0,
    min: [0, 'Stock cannot be negative']
  },
  rating: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 5
  },
  reviews: [{
    userId: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  isFeatured: { 
    type: Boolean, 
    default: false 
  },
  isOnSale: { 
    type: Boolean, 
    default: false 
  },
  salePrice: { 
    type: Number,
    default: 0
  },
  supplier: { 
    type: String,
    default: ''
  },
  supplierUrl: { 
    type: String,
    default: ''
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Product', ProductSchema);
