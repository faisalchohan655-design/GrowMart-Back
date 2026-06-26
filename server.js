require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Import Models
const Product = require('./models/Product');
const Order = require('./models/Order');
const Promotion = require('./models/Promotion');

// ============ APP SETUP ============
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// ============ MIDDLEWARE ============
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ DATABASE CONNECTION ============
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// ============ SOCKET.IO - REAL-TIME FEATURES ============

// Store active users
const activeUsers = new Map();
const chatMessages = [];
const MAX_CHAT_MESSAGES = 100;

io.on('connection', (socket) => {
  console.log(`🟢 New connection: ${socket.id}`);

  // --- 1. LIVE VISITORS ---
  activeUsers.set(socket.id, { 
    joinedAt: new Date(),
    userAgent: socket.handshake.headers['user-agent'] || 'Unknown'
  });
  io.emit('visitors', activeUsers.size);
  io.emit('user-joined', { 
    id: socket.id, 
    total: activeUsers.size 
  });

  // --- 2. LIVE CHAT ---
  socket.on('chat-message', (data) => {
    if (!data.message || data.message.trim() === '') return;
    
    const messageData = {
      id: Date.now(),
      userId: socket.id,
      message: data.message.trim(),
      timestamp: new Date(),
      type: 'user'
    };
    
    chatMessages.push(messageData);
    if (chatMessages.length > MAX_CHAT_MESSAGES) {
      chatMessages.shift();
    }
    
    // Broadcast to all users
    io.emit('chat-reply', messageData);
    
    // Auto-reply after 1.5 seconds
    setTimeout(() => {
      const autoReplies = [
        "Thanks for your message! I'll get back to you shortly.",
        "Great question! Let me check that for you.",
        "I appreciate your interest in our products!",
        "Thank you for reaching out! How can I assist you today?",
        "That's a good point. Let me help you with that."
      ];
      const autoReply = {
        id: Date.now() + 1,
        userId: 'system',
        message: autoReplies[Math.floor(Math.random() * autoReplies.length)],
        timestamp: new Date(),
        type: 'system'
      };
      chatMessages.push(autoReply);
      io.emit('chat-reply', autoReply);
    }, 1500);
  });

  // --- 3. TYPING INDICATOR ---
  socket.on('typing-start', () => {
    socket.broadcast.emit('typing-indicator', {
      userId: socket.id,
      isTyping: true
    });
  });

  socket.on('typing-end', () => {
    socket.broadcast.emit('typing-indicator', {
      userId: socket.id,
      isTyping: false
    });
  });

  // --- 4. NEW ORDER ---
  socket.on('new-order', async (orderData) => {
    try {
      // Validate order data
      if (!orderData.customer || !orderData.items || orderData.items.length === 0) {
        socket.emit('order-error', { message: 'Invalid order data' });
        return;
      }

      const order = new Order(orderData);
      await order.save();

      // Emit to all connected clients
      io.emit('order-notification', {
        orderId: order.orderId,
        customer: order.customer.name,
        total: order.total,
        timestamp: new Date()
      });

      // Admin alert
      io.emit('admin-alert', {
        type: 'new-order',
        message: `🎉 New order #${order.orderId} from ${order.customer.name}`,
        data: order
      });

      // Confirmation to customer
      socket.emit('order-confirmation', {
        orderId: order.orderId,
        status: 'confirmed',
        estimatedDelivery: '3-5 business days'
      });

      console.log(`📦 New order created: ${order.orderId}`);

    } catch (error) {
      console.error('Order error:', error.message);
      socket.emit('order-error', { 
        message: error.message || 'Failed to place order' 
      });
    }
  });

  // --- 5. FLASH SALE ---
  socket.on('flash-sale-start', (saleData) => {
    io.emit('flash-sale-alert', {
      message: saleData.message || '⚡ FLASH SALE! Limited time offer!',
      discount: saleData.discount || 50,
      products: saleData.products || [],
      timer: saleData.duration || 3600,
      startTime: new Date()
    });
  });

  // --- 6. REAL-TIME ANALYTICS ---
  socket.on('analytics-request', async () => {
    try {
      const totalOrders = await Order.countDocuments();
      const totalRevenue = await Order.aggregate([
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      const recentOrders = await Order.find()
        .sort({ createdAt: -1 })
        .limit(5);

      socket.emit('analytics-data', {
        visitors: activeUsers.size,
        orders: totalOrders,
        revenue: totalRevenue[0]?.total || 0,
        recentOrders: recentOrders,
        timestamp: new Date()
      });
    } catch (error) {
      socket.emit('analytics-error', { 
        message: 'Failed to fetch analytics' 
      });
    }
  });

  // --- 7. DISCONNECT ---
  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('visitors', activeUsers.size);
    io.emit('user-left', { 
      id: socket.id, 
      total: activeUsers.size 
    });
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});

// ============ API ROUTES ============

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => {
  try {
    const { category, featured, sale, search } = req.query;
    const filter = {};
    
    if (category) filter.category = category;
    if (featured) filter.isFeatured = featured === 'true';
    if (sale) filter.isOnSale = sale === 'true';
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    
    // Emit via Socket.IO
    io.emit('product-added', product);
    
    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    // Emit via Socket.IO
    io.emit('product-updated', product);
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    // Emit via Socket.IO
    io.emit('product-deleted', { id: req.params.id });
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// --- ORDERS ---
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    
    // Emit via Socket.IO
    io.emit('order-notification', {
      orderId: order.orderId,
      customer: order.customer.name,
      total: order.total,
      timestamp: new Date()
    });
    
    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    // Emit via Socket.IO
    io.emit('order-status-updated', order);
    
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// --- PROMOTIONS ---
app.get('/api/promotions', async (req, res) => {
  try {
    const promotions = await Promotion.find({ isActive: true })
      .sort({ createdAt: -1 });
    res.json({
      success: true,
      count: promotions.length,
      data: promotions
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.post('/api/promotions', async (req, res) => {
  try {
    const promotion = new Promotion(req.body);
    await promotion.save();
    
    // Emit via Socket.IO
    io.emit('promotion-created', promotion);
    
    res.status(201).json({
      success: true,
      data: promotion
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

app.put('/api/promotions/:id', async (req, res) => {
  try {
    const promotion = await Promotion.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!promotion) {
      return res.status(404).json({ 
        success: false, 
        message: 'Promotion not found' 
      });
    }
    res.json({
      success: true,
      data: promotion
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// --- ANALYTICS ---
app.get('/api/analytics', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5);
    const totalProducts = await Product.countDocuments();

    res.json({
      success: true,
      data: {
        visitors: activeUsers.size,
        orders: totalOrders,
        revenue: totalRevenue[0]?.total || 0,
        products: totalProducts,
        recentOrders: recentOrders,
        timestamp: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    message: '🚀 GrowMart API is running',
    activeConnections: activeUsers.size,
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// --- 404 HANDLER ---
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// --- ERROR HANDLER ---
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
  console.log(`🚀 GrowMart Server running on port ${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
  console.log(`🔌 Socket.IO: ws://localhost:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});
