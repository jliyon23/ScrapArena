const mongoose = require('mongoose');

/**
 * Connect to MongoDB with optimized settings
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // MongoDB driver's new URL parser
      // Note: These options are now default in newer mongoose versions
      // but keeping them for clarity and compatibility
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;