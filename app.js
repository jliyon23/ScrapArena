require('dotenv').config();
const express = require('express');
const exphbs = require('express-handlebars');
const path = require('path');
const connectDB = require('./config/database');
const { initCronJobs } = require('./config/cron');
const brandController = require('./controllers/brandController');
const phoneController = require('./controllers/phoneController');
const scraperService = require('./services/scraperService');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set environment
const isProduction = process.env.NODE_ENV === 'production';

// Connect to MongoDB
connectDB().then(() => {
  console.log('Database connected successfully');
  
  // Initialize cron jobs after DB connection is established
  if (isProduction) {
    initCronJobs();
  }
});

// Configure view engine
app.engine('hbs', exphbs.engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: (a, b) => a === b
  }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Routes
app.get('/', brandController.getHomePage);
app.get('/brand/:brandId', brandController.getBrandPage);
app.get('/phone/:phoneId', phoneController.getPhonePage);

// Manual trigger for brand update
app.get('/update-brands', async (req, res) => {
  try {
    await scraperService.updateAllBrands();
    res.redirect('/');
  } catch (error) {
    console.error('Error updating brands:', error);
    res.status(500).send('Error updating brands');
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    message: 'Something went wrong!',
    error: isProduction ? {} : err
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} in ${isProduction ? 'production' : 'development'} mode`);
});