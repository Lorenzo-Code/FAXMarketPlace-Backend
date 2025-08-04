require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");
const Property = require("./models/Property");
const AuditLog = require("./models/AuditLog");

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("📦 Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

async function populateTestData() {
  try {
    console.log("🔧 Populating test data...");

    // Create sample users
    const sampleUsers = [
      {
        firstName: "John",
        lastName: "Doe",
        email: "john.doe@example.com",
        password: "hashedPassword123",
        role: "user",
        emailVerified: true,
        twoFactorEnabled: false,
        lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      },
      {
        firstName: "Jane",
        lastName: "Smith",
        email: "jane.smith@example.com",
        password: "hashedPassword456",
        role: "user",
        emailVerified: true,
        twoFactorEnabled: true,
        lastLogin: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
      },
      {
        firstName: "Bob",
        lastName: "Johnson",
        email: "bob.johnson@example.com",
        password: "hashedPassword789",
        role: "user",
        emailVerified: false,
        twoFactorEnabled: false,
        lastLogin: null,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      },
      {
        firstName: "Alice",
        lastName: "Williams",
        email: "alice.williams@example.com",
        password: "hashedPasswordABC",
        role: "user",
        emailVerified: true,
        twoFactorEnabled: false,
        lastLogin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) // 45 days ago
      },
      {
        firstName: "Mike",
        lastName: "Brown",
        email: "mike.brown@example.com",
        password: "hashedPasswordDEF",
        role: "user",
        emailVerified: true,
        twoFactorEnabled: true,
        lastLogin: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
      }
    ];

    // Check and insert users
    for (const userData of sampleUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const user = new User(userData);
        await user.save();
        console.log(`✅ Created user: ${userData.email}`);
      } else {
        console.log(`⚠️ User already exists: ${userData.email}`);
      }
    }

    // Create sample properties
    const sampleProperties = [
      {
        title: "Modern Downtown Condo",
        address1: "123 Main St",
        city: "New York",
        state: "NY",
        price: 750000,
        status: "approved",
        isFractional: true,
        isAISuggested: false,
        expectedMonthlyROI: 0.08,
        rentalYield: 0.065,
        type: "sale",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      },
      {
        title: "Suburban Family Home",
        address1: "456 Oak Avenue",
        city: "Los Angeles",
        state: "CA",
        price: 950000,
        status: "pending",
        isFractional: false,
        isAISuggested: true,
        expectedMonthlyROI: 0.06,
        rentalYield: 0.055,
        type: "sale",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      },
      {
        title: "Luxury Penthouse",
        address1: "789 High St",
        city: "Miami",
        state: "FL",
        price: 2500000,
        status: "approved",
        isFractional: true,
        isAISuggested: false,
        expectedMonthlyROI: 0.095,
        rentalYield: 0.075,
        type: "sale",
        createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000) // 25 days ago
      },
      {
        title: "Investment Rental Property",
        address1: "321 Pine Road",
        city: "Chicago",
        state: "IL",
        price: 450000,
        status: "rejected",
        isFractional: false,
        isAISuggested: true,
        expectedMonthlyROI: 0.07,
        rentalYield: 0.08,
        type: "rent",
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
      }
    ];

    // Insert properties
    for (const propertyData of sampleProperties) {
      const existingProperty = await Property.findOne({ 
        title: propertyData.title, 
        address1: propertyData.address1 
      });
      if (!existingProperty) {
        const property = new Property(propertyData);
        await property.save();
        console.log(`✅ Created property: ${propertyData.title}`);
      } else {
        console.log(`⚠️ Property already exists: ${propertyData.title}`);
      }
    }

    // Create sample audit logs
    const users = await User.find();
    const auditLogs = [
      {
        type: "login",
        userId: users[0]?._id,
        email: users[0]?.email,
        action: "User logged in",
        metadata: { ip: "192.168.1.100" },
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        type: "token_transfer",
        userId: users[1]?._id,
        email: users[1]?.email,
        action: "Token transfer completed",
        metadata: { amount: 1500, token: "FXCT" },
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) // 4 hours ago
      },
      {
        type: "document_update",
        userId: users[2]?._id,
        email: users[2]?.email,
        action: "Profile updated",
        metadata: { field: "email_verification" },
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours ago
      },
      {
        type: "admin_action",
        userId: users[0]?._id,
        email: users[0]?.email,
        action: "Property approved",
        metadata: { propertyId: "123456" },
        timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000) // 8 hours ago
      },
      {
        type: "login",
        userId: users[4]?._id,
        email: users[4]?.email,
        action: "User logged in",
        metadata: { ip: "192.168.1.101" },
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago
      }
    ];

    // Insert audit logs
    for (const logData of auditLogs) {
      if (logData.userId) {
        const log = new AuditLog(logData);
        await log.save();
        console.log(`✅ Created audit log: ${logData.action}`);
      }
    }

    console.log("🎉 Test data population completed!");
    console.log(`📊 Summary:`);
    console.log(`   Users: ${await User.countDocuments()}`);
    console.log(`   Properties: ${await Property.countDocuments()}`);
    console.log(`   Audit Logs: ${await AuditLog.countDocuments()}`);

  } catch (error) {
    console.error("❌ Error populating test data:", error);
  } finally {
    mongoose.connection.close();
  }
}

populateTestData();
