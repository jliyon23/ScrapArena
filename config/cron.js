const cron = require('node-cron');
const scraperService = require('../services/scraperService');
const Brand = require('../models/Brand');
const Phone = require('../models/Phone');
const cacheService = require('../services/cacheService');

/**
 * Initialize all cron jobs for data updates
 */
function initCronJobs() {
  // Update all brands daily
  cron.schedule(process.env.BRANDS_UPDATE_SCHEDULE || '0 0 * * *', async () => {
    console.log('Running scheduled brands update...');
    try {
      await scraperService.updateAllBrands();
      // Clear brand cache
      cacheService.delete('brands');
      console.log('Brands update completed successfully');
    } catch (error) {
      console.error('Error in brands update job:', error);
    }
  });

  // Update phones for all brands on schedule
  cron.schedule(process.env.PHONES_UPDATE_SCHEDULE || '0 2 * * *', async () => {
    console.log('Running scheduled phones update...');
    try {
      const brands = await Brand.find().select('id');
      for (const brand of brands) {
        await scraperService.updatePhonesForBrand(brand.id);
        // Clear brand phones cache
        cacheService.delete(`brand_all_${brand.id}`);
        // Wait to avoid overwhelming the source site
        await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 5000));
      }
      console.log('Phones update completed successfully');
    } catch (error) {
      console.error('Error in phones update job:', error);
    }
  });

  // Update random phone specs every few hours
  cron.schedule(process.env.RANDOM_PHONES_UPDATE || '0 */4 * * *', async () => {
    console.log('Running random phone specs update...');
    try {
      // Get 10 random phones that haven't been updated recently
      const phones = await Phone.aggregate([
        { $sample: { size: 10 } }
      ]);
      
      for (const phone of phones) {
        await scraperService.updatePhoneSpecs(phone.id);
        // Clear phone cache
        cacheService.delete(`phone_${phone.id}`);
        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      }
      console.log('Random phone specs update completed successfully');
    } catch (error) {
      console.error('Error in random phone specs update job:', error);
    }
  });
}

module.exports = { initCronJobs };