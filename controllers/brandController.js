const scraperService = require('../services/scraperService');

/**
 * Get home page with all brands
 */
exports.getHomePage = async (req, res) => {
  try {
    const brands = await scraperService.getBrands();
    res.render('home', { brands });
  } catch (error) {
    console.error('Error in getHomePage:', error);
    res.status(500).render('error', {
      message: 'Error fetching brands',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};

/**
 * Get brand page with all phones for a brand
 */
exports.getBrandPage = async (req, res) => {
  try {
    const { brandId } = req.params;
    const { phones, brandName, totalPhones } = await scraperService.getPhonesByBrand(brandId);

    //log first 10 phones
    console.log(phones.slice(0, 10));
    
    res.render('brand', {
      phones,
      brandName,
      totalPhones,
      brandId,
      helpers: {
        eq: (a, b) => a === b
      }
    });
  } catch (error) {
    console.error('Error in getBrandPage:', error);
    res.status(500).render('brand-not-found', {
      message: `Brand not found or error loading phones: ${error.message}`
    });
  }
};