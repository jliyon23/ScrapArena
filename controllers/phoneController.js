const scraperService = require('../services/scraperService');

/**
 * Get phone details page
 */
exports.getPhonePage = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const specs = await scraperService.getPhoneSpecs(phoneId);
    
    res.render('phone', { specs });
  } catch (error) {
    console.error('Error in getPhonePage:', error);
    res.status(500).render('error', {
      message: 'Error fetching phone details',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
};