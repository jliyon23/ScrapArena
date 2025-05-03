const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');
const Brand = require('../models/Brand');
const Phone = require('../models/Phone');
const cacheService = require('./cacheService');

// Base URL from environment or default
const BASE_URL = process.env.BASE_URL || 'https://www.gsmarena.com';
const LOGO_API_KEY = process.env.LOGO_API_KEY;

// Configure axios with better headers and timeout
const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache'
  }
});

// Add proxy support if configured
if (process.env.PROXY_URL) {
  axiosInstance.defaults.httpsAgent = new HttpsProxyAgent(process.env.PROXY_URL);
}

// Helper function for delays with jitter
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms + Math.random() * ms * 0.5));

/**
 * Fetch brand logo from Logo.dev API
 */
async function fetchBrandLogo(brandName) {
  try {
    // Clean the brand name and add common domain suffixes
    const cleanName = brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domains = [
      `${cleanName}.com`,
      `${cleanName}mobile.com`,
      `${cleanName}phones.com`,
      `${cleanName}electronics.com`
    ];

    // Try each domain until we get a valid logo
    for (const domain of domains) {
      try {
        const response = await axios.get(`https://logo.clearbit.com/${domain}`, {
          headers: {
            'Authorization': `Bearer ${LOGO_API_KEY}`
          },
          validateStatus: function (status) {
            return status < 500;
          }
        });
        
        if (response.status === 200) {
          return `https://logo.clearbit.com/${domain}`;
        }
      } catch (error) {
        console.log(`No logo found for ${domain}`);
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching logo for ${brandName}:`, error.message);
    return null;
  }
}

/**
 * Fetches HTML content with random delay and retry logic
 */
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // Add random delay to avoid detection
      await delay(2000);
      const response = await axiosInstance.get(url);
      return response.data;
    } catch (error) {
      console.error(`Fetch error (attempt ${i + 1}/${retries}): ${url}`, error.message);
      if (i === retries - 1) throw error;
      // Exponential backoff
      await delay(5000 * (i + 1));
    }
  }
}

/**
 * Update or create all mobile brands in the database
 */
async function updateAllBrands() {
  try {
    const html = await fetchWithRetry(BASE_URL);
    const $ = cheerio.load(html);
    
    const brandPromises = [];
    $('.brandmenu-v2 li a, .brandmenu li a, .brandsmenu li a').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      const urlPath = href.split('/').pop();
      const fullId = urlPath.replace('.php', '');
      const brandCode = urlPath.match(/-(\d+)\.php$/)?.[1] || '0';
      const name = $(el).text().trim();

      const brandData = {
        name,
        url: href,
        id: fullId,
        cleanId: fullId.split('-')[0],
        brandCode,
        lastUpdated: new Date()
      };

      // Use findOneAndUpdate to update or create
      const promise = Brand.findOneAndUpdate(
        { id: fullId },
        brandData,
        { upsert: true, new: true }
      );
      
      brandPromises.push(promise);
    });
    
    const brands = await Promise.all(brandPromises);
    
    // Fetch logos for all brands
    const logoPromises = brands.map(async (brand) => {
      const logoUrl = await fetchBrandLogo(brand.name);
      if (logoUrl) {
        return Brand.findByIdAndUpdate(
          brand._id,
          { logo: logoUrl },
          { new: true }
        );
      }
      return brand;
    });
    
    await Promise.all(logoPromises);
    return true;
  } catch (error) {
    console.error('Error updating brands:', error);
    throw error;
  }
}

/**
 * Fetches all phones for a brand by recursively going through all pages
 */
async function getAllPhonesForBrand(brandId, brandCode, currentPage = 1, allPhones = []) {
  try {
    // Construct the URL
    let url;
    if (currentPage === 1) {
      url = `${BASE_URL}/${brandId}.php`;
    } else {
      url = `${BASE_URL}/${brandId.split('-')[0]}-phones-f-${brandCode}-0-p${currentPage}.php`;
    }

    console.log(`Fetching page ${currentPage} for brand ${brandId}: ${url}`);
    
    // Fetch the page
    const html = await fetchWithRetry(url);
    const $ = cheerio.load(html);

    // Extract phones from current page
    $('#review-body .makers li').each((i, el) => {
      const $el = $(el);
      const $a = $el.find('a');
      const $img = $el.find('img');

      if ($a.length && $img.length) {
        allPhones.push({
          name: $el.find('strong').text().trim(),
          url: $a.attr('href'),
          id: $a.attr('href').replace('.php', ''),
          image: $img.attr('src'),
          imageRetina: $img.attr('srcset')?.split(' ')[0] || '',
          brandId
        });
      }
    });

    // Check if there are more pages
    const nextPageLink = $('.nav-pages a[title="Next page"]');
    if (nextPageLink.length) {
      // Add delay to avoid rate limiting
      await delay(3000);
      return getAllPhonesForBrand(brandId, brandCode, currentPage + 1, allPhones);
    }

    return allPhones;
  } catch (error) {
    console.error(`Error fetching phones for brand ${brandId} page ${currentPage}:`, error.message);
    return allPhones; // Return what we have so far
  }
}

/**
 * Update or create phones for a specific brand in the database
 */
async function updatePhonesForBrand(brandId) {
  try {
    // Find the brand in the database
    const brand = await Brand.findOne({ id: brandId });
    if (!brand) {
      throw new Error(`Brand ${brandId} not found in database`);
    }

    // Fetch all phones for this brand
    const phones = await getAllPhonesForBrand(brand.id, brand.brandCode);
    
    if (phones.length === 0) {
      console.warn(`No phones found for brand ${brandId}`);
      return 0;
    }

    // Update or create each phone
    const phonePromises = phones.map(phone => {
      return Phone.findOneAndUpdate(
        { id: phone.id },
        { 
          ...phone,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );
    });
    
    await Promise.all(phonePromises);
    console.log(`Updated ${phones.length} phones for brand ${brand.name}`);
    
    return phones.length;
  } catch (error) {
    console.error(`Error updating phones for brand ${brandId}:`, error);
    throw error;
  }
}

/**
 * Update specifications for a specific phone
 */
async function updatePhoneSpecs(phoneId) {
  try {
    // Find the phone in the database
    const phone = await Phone.findOne({ id: phoneId });
    if (!phone) {
      throw new Error(`Phone ${phoneId} not found in database`);
    }

    // Fetch the phone specs
    const html = await fetchWithRetry(`${BASE_URL}/${phoneId}.php`);
    const $ = cheerio.load(html);

    const specs = {};
    
    // Parse specs from the page
    $('#specs-list table').each((i, table) => {
      const category = $(table).find('th').text().trim();
      if (!category) return;

      specs[category] = { specs: {} };
      
      $(table).find('tr').each((j, row) => {
        if (j === 0) return; // Skip header row
        const key = $(row).find('.ttl').text().trim();
        const value = $(row).find('.nfo').text().trim();
        if (key && value) specs[category].specs[key] = value;
      });
    });

    // Add general information
    specs['General'] = { 
      specs: {
        'Name': $('.specs-phone-name-title').text().trim(),
        'Image': $('.specs-photo-main img').attr('src') || phone.image || ''
      }
    };

    if (!specs['General'].specs['Name']) {
      throw new Error('Phone details not found');
    }

    // Update the phone in the database
    await Phone.findOneAndUpdate(
      { id: phoneId },
      { 
        specifications: specs,
        specsLastUpdated: new Date(),
        lastUpdated: new Date()
      }
    );

    return specs;
  } catch (error) {
    console.error(`Error updating specs for phone ${phoneId}:`, error.message);
    throw error;
  }
}

/**
 * Get all brands from database or scrape if needed
 */
async function getBrands() {
  return cacheService.getOrSet('brands', async () => {
    let brands = await Brand.find().sort('name').lean();
    
    // If no brands in database, fetch them
    if (brands.length === 0) {
      await updateAllBrands();
      brands = await Brand.find().sort('name').lean();
    }
    
    return brands;
  });
}

/**
 * Get all phones for a brand from database or scrape if needed
 */
async function getPhonesByBrand(brandId) {
  return cacheService.getOrSet(`brand_all_${brandId}`, async () => {
    // Find the brand
    const brand = await Brand.findOne({ 
      $or: [
        { id: brandId },
        { cleanId: brandId.split('-')[0] }
      ]
    });
    
    if (!brand) {
      throw new Error(`Brand ${brandId} not found`);
    }

    // Get phones for this brand
    let phones = await Phone.find({ brandId: brand.id }).lean();
    
    // If no phones in database, fetch them
    if (phones.length === 0) {
      await updatePhonesForBrand(brand.id);
      phones = await Phone.find({ brandId: brand.id }).lean();
    }

    return {
      phones,
      brandId: brand.id,
      brandName: brand.name,
      totalPhones: phones.length
    };
  });
}

/**
 * Get specifications for a phone from database or scrape if needed
 */
async function getPhoneSpecs(phoneId) {
  return cacheService.getOrSet(`phone_${phoneId}`, async () => {
    // Find the phone
    const phone = await Phone.findOne({ id: phoneId }).lean();
    
    if (!phone) {
      throw new Error(`Phone ${phoneId} not found`);
    }

    // If we already have specifications
    if (phone.specifications && Object.keys(phone.specifications).length > 0) {
      // Convert Map to regular object
      const specs = {};
      for (const [category, data] of Object.entries(phone.specifications)) {
        specs[category] = {};
        for (const [key, value] of Object.entries(data.specs)) {
          specs[category][key] = value;
        }
      }
      return specs;
    }

    // Otherwise, fetch and update specifications
    await updatePhoneSpecs(phoneId);
    
    // Get the updated phone
    const updatedPhone = await Phone.findOne({ id: phoneId }).lean();
    
    // Convert Map to regular object
    const specs = {};
    for (const [category, data] of Object.entries(updatedPhone.specifications)) {
      specs[category] = {};
      for (const [key, value] of Object.entries(data.specs)) {
        specs[category][key] = value;
      }
    }
    
    return specs;
  });
}

module.exports = {
  updateAllBrands,
  updatePhonesForBrand,
  updatePhoneSpecs,
  getBrands,
  getPhonesByBrand,
  getPhoneSpecs
};