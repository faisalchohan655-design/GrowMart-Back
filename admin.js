require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

// ============ DATABASE CONNECTION ============
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    await createAdmin();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ============ CREATE ADMIN ============
const createAdmin = async () => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      email: 'admin@growmart.com' 
    });
    
    if (existingAdmin) {
      console.log('⚠️ Admin already exists!');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Role:', existingAdmin.role);
      console.log('🆔 ID:', existingAdmin._id);
      process.exit(0);
    }

    // Create new admin
    const admin = new User({
      name: 'Admin',
      email: 'admin@growmart.com',
      password: 'growmart2025', // Will be hashed by pre-save hook
      role: 'admin'
    });

    await admin.save();
    
    console.log('✅ Admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email: admin@growmart.com');
    console.log('🔑 Password: growmart2025');
    console.log('👤 Role: admin');
    console.log('🆔 ID:', admin._id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Please change password after first login!');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    process.exit(0);
  }
};
