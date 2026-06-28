require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

// ============ DATABASE CONNECTION ============
console.log('🔌 Connecting to MongoDB...');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log('✅ Connected to MongoDB\n');
  await createAdmin();
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// ============ CREATE ADMIN FUNCTION ============
const createAdmin = async () => {
  try {
    // Check if admin already exists
    console.log('🔍 Checking if admin exists...');
    
    const existingAdmin = await User.findOne({ 
      email: 'admin@growmart.com' 
    });
    
    if (existingAdmin) {
      console.log('\n⚠️ Admin already exists!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Name:', existingAdmin.name);
      console.log('👤 Role:', existingAdmin.role);
      console.log('🆔 ID:', existingAdmin._id);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      process.exit(0);
    }

    // Create new admin
    console.log('🆕 Creating new admin...');
    
    const admin = new User({
      name: 'Admin',
      email: 'admin@growmart.com',
      password: 'growmart2025', // Will be hashed by pre-save hook
      role: 'admin'
    });

    await admin.save();
    
    console.log('\n✅ Admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email: admin@growmart.com');
    console.log('🔑 Password: growmart2025');
    console.log('👤 Role: admin');
    console.log('🆔 ID:', admin._id);
    console.log('📅 Created:', admin.createdAt);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  Please change password after first login!');
    console.log('🔗 Login at: https://grow-mart-front-dngm.vercel.app/admin\n');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    process.exit(0);
  }
};
