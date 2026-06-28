require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');
const { body, validationResult } = require('express-validator');

// ============ Import Models ============
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

// ============ APP SETUP ============
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// ============ MIDDLEWARE ============
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ DATABASE ============
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ============ RESEND EMAIL SETUP ============
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (to, subject, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_USER || 'onboarding@resend.dev',
      to: to,
      subject: subject,
      html: html
    });
    if (error) throw error;
    console.log('📧 Email sent to:', to);
    return data;
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
};

// ============ SOCKET.IO ============
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('🟢 New connection:', socket.id);
  activeUsers.set(socket.id, { joinedAt: new Date() });
  io.emit('visitors', activeUsers.size);

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('visitors', activeUsers.size);
    console.log('🔴 User disconnected:', socket.id);
  });

  socket.on('new-order', (order) => {
    io.emit('order-notification', order);
  });
});

// ============ AUTH MIDDLEWARE ============
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ============ ADMIN AUTH MIDDLEWARE ============
const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is admin
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    // Verify user in database
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Admin not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ============ EMAIL FUNCTIONS ============
const sendOrderConfirmation = async (order, user) => {
  const itemsHtml = order.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>$${item.price}</td>
      <td>${item.quantity}</td>
      <td>$${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <h1>🎉 Order Confirmed!</h1>
    <p>Hi ${user.name || order.customer.name},</p>
    <p>Thank you for your order! We're processing it now.</p>
    <h2>Order #${order.orderId}</h2>
    <table border="1" cellpadding="5">
      <tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr>
      ${itemsHtml}
      <tr><td colspan="3"><strong>Total:</strong></td><td><strong>$${order.total}</strong></td></tr>
    </table>
    <p>Shipping to: ${order.shippingAddress.street}, ${order.shippingAddress.city}</p>
    <p>Estimated delivery: 3-5 business days</p>
    <br/>
    <p>Thanks for shopping with GrowMart! 🌱</p>
  `;
  
  await sendEmail(order.customer.email, `Order #${order.orderId} Confirmed! 🎉`, html);
};

const sendOrderStatusUpdate = async (order) => {
  const html = `
    <h1>📦 Order Update</h1>
    <p>Your order #${order.orderId} status has been updated to: <strong>${order.status}</strong></p>
    <p>Track your order: ${process.env.CLIENT_URL}/track/${order.orderId}</p>
    <br/>
    <p>Thanks for shopping with GrowMart! 🌱</p>
  `;
  await sendEmail(order.customer.email, `Order #${order.orderId} - ${order.status}`, html);
};

// ============ AUTH ROUTES ============

// ✅ Register
app.post('/api/auth/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = new User({ 
      name, 
      email, 
      password: password // Pre-save hook will hash it
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role || 'user' }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ Login
app.post('/api/auth/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role || 'user' }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', auth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ============ ✅ ADMIN AUTH ROUTE ============
app.post('/api/admin/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;
    
    // Find admin user
    const admin = await User.findOne({ 
      email: email.toLowerCase(),
      role: 'admin'
    });
    
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    // Verify password using comparePassword method
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    // Generate admin token with isAdmin flag
    const token = jwt.sign(
      { 
        id: admin._id, 
        email: admin.email,
        isAdmin: true,
        role: 'admin'
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// ============ ✅ ADMIN PROTECTED ROUTES ============

// Get current admin
app.get('/api/admin/me', adminAuth, async (req, res) => {
  res.json({ 
    success: true, 
    admin: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Get all orders (admin only)
app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update order status (admin only)
app.put('/api/admin/orders/:id', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Send status update email
    await sendOrderStatusUpdate(order);

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all products (admin only)
app.get('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add product (admin only)
app.post('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    io.emit('product-added', product);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete product (admin only)
app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    io.emit('product-deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get analytics (admin only)
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalProducts = await Product.countDocuments();
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      data: {
        orders: totalOrders,
        revenue: totalRevenue[0]?.total || 0,
        products: totalProducts,
        recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ STRIPE PAYMENT ============

app.post('/api/create-payment-intent', auth, async (req, res) => {
  try {
    const { amount, currency = 'usd' } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency,
      metadata: {
        userId: req.user._id.toString(),
        email: req.user.email
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============ ORDER ROUTES ============

app.post('/api/orders', auth, async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      userId: req.user._id,
      customer: {
        name: req.user.name,
        email: req.user.email,
        phone: req.body.customer?.phone || ''
      }
    };

    const order = new Order(orderData);
    await order.save();

    await sendOrderConfirmation(order, req.user);

    io.emit('order-notification', {
      orderId: order.orderId,
      customer: order.customer.name,
      total: order.total
    });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/orders/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await sendOrderStatusUpdate(order);

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/orders', auth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PRODUCT ROUTES ============

app.get('/api/products', async (req, res) => {
  try {
    const { category, featured, sale, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (featured) filter.isFeatured = featured === 'true';
    if (sale) filter.isOnSale = sale === 'true';
    if (search) filter.name = { $regex: search, $options: 'i' };
    
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: products.length, data: products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ANALYTICS (Public) ============

app.get('/api/analytics', auth, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const totalProducts = await Product.countDocuments();
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      data: {
        orders: totalOrders,
        revenue: totalRevenue[0]?.total || 0,
        products: totalProducts,
        recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: '🚀 GrowMart API is running',
    uptime: process.uptime(),
    timestamp: new Date()
  });
});

// ============ 404 HANDLER ============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ============ ERROR HANDLER ============

app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ============ START SERVER ============

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
  console.log(`🔌 Socket.IO: ws://localhost:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});
