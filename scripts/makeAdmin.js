import mongoose from 'mongoose';
import User from '../models/rms/user.js';
import bcrypt from 'bcrypt';

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/voting_system');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const createDefaultAdmin = async () => {
  try {
    const hashedPassword = await bcrypt.hash('1234', 10);

    const adminUser = new User({
      first_name: 'Admin',
      last_name: 'User',
      employee_id: 'ADMIN001',
      user: 'admin',
      email: 'admin@votingsystem.com',
      password: hashedPassword,
      position: 'System Administrator',
      department: 'IT',
      level: 'professional',
      job_grade: 'Admin',
      function: 'Administration',
      performance_appraisal_score: 100,
      is_managerial: false,
      roles: ['user', 'admin'],
      status: true
    });

    await adminUser.save();
    console.log('✅ Default admin user created successfully!');
    return adminUser;
  } catch (error) {
    if (error.code === 11000) {
      console.log('ℹ️ Admin user already exists with this email/employee_id');
      return null;
    }
    throw error;
  }
};

const makeUserAdmin = async () => {
  try {
    await connectDB();

    // Find all users to show options
    const users = await User.find({}, 'first_name last_name employee_id email roles level');

    if (users.length === 0) {
      console.log('❌ No users found in the database');
      console.log('🔧 Creating default admin user...');

      const newAdmin = await createDefaultAdmin();
      if (newAdmin) {
        console.log('✅ Default admin user created!');
        console.log(`📧 Email: ${newAdmin.email}`);
        console.log(`👤 Employee ID: ${newAdmin.employee_id}`);
        console.log(`🔐 Password: 1234`);
        console.log(`🔐 Roles: ${newAdmin.roles.join(', ')}`);
      }
      return;
    }

    console.log('\n📋 Available users:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.first_name} ${user.last_name} (${user.employee_id}) - ${user.email}`);
      console.log(`   Current roles: ${user.roles?.join(', ') || 'None'} | Level: ${user.level || 'None'}`);
    });

    // For script automation, let's make the first user admin
    // In production, you might want to specify by employee_id or email
    const userToUpdate = users[0];

    console.log(`\n🔧 Making user admin: ${userToUpdate.first_name} ${userToUpdate.last_name} (${userToUpdate.employee_id})`);

    // Update user to admin
    const updatedUser = await User.findByIdAndUpdate(
      userToUpdate._id,
      {
        $set: {
          roles: ['user', 'admin'],
          level: 'professional' // Keep level as professional but add admin role
        }
      },
      { new: true }
    );

    if (updatedUser) {
      console.log('✅ User successfully updated to admin!');
      console.log(`📧 Email: ${updatedUser.email}`);
      console.log(`👤 Employee ID: ${updatedUser.employee_id}`);
      console.log(`🔐 Roles: ${updatedUser.roles.join(', ')}`);
      console.log(`📊 Level: ${updatedUser.level}`);
    } else {
      console.log('❌ Failed to update user');
    }

  } catch (error) {
    console.error('❌ Error updating user:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Alternative function to make admin by employee_id
const makeUserAdminByEmployeeId = async (employeeId) => {
  try {
    await connectDB();

    const user = await User.findOne({ employee_id: employeeId });

    if (!user) {
      console.log(`❌ User with employee_id '${employeeId}' not found`);
      process.exit(1);
    }

    console.log(`🔧 Making user admin: ${user.first_name} ${user.last_name} (${user.employee_id})`);

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          roles: ['user', 'admin'],
          level: user.level || 'professional'
        }
      },
      { new: true }
    );

    if (updatedUser) {
      console.log('✅ User successfully updated to admin!');
      console.log(`📧 Email: ${updatedUser.email}`);
      console.log(`👤 Employee ID: ${updatedUser.employee_id}`);
      console.log(`🔐 Roles: ${updatedUser.roles.join(', ')}`);
      console.log(`📊 Level: ${updatedUser.level}`);
    }

  } catch (error) {
    console.error('❌ Error updating user:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Check if employee_id was provided as command line argument
const employeeId = process.argv[2];

if (employeeId) {
  console.log(`🎯 Looking for user with employee_id: ${employeeId}`);
  makeUserAdminByEmployeeId(employeeId);
} else {
  console.log('🚀 Making first user admin...');
  makeUserAdmin();
}