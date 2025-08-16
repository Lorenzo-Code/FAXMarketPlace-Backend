const mongoose = require('mongoose');
const Property = require('./models/Property');

async function checkProperties() {
  try {
    require('dotenv').config();
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🔍 Searching for properties with zpid 28207918...');
    
    // Search for the property with different patterns
    const searches = [
      { zpid: '28207918' },
      { zpid: 28207918 },
      { 'data.zpid': '28207918' },
      { 'data.zpid': 28207918 },
      { 'data.property.zpid': '28207918' },
      { 'data.property.zpid': 28207918 }
    ];
    
    for (let search of searches) {
      const count = await Property.countDocuments(search);
      console.log(`📊 Found ${count} properties with query:`, search);
    }
    
    // Check recent properties with carouselPhotos
    console.log('\n🖼️ Checking properties with carouselPhotos...');
    const withPhotos = await Property.find({ carouselPhotos: { $exists: true, $ne: [] } }).limit(5);
    console.log(`📊 Found ${withPhotos.length} properties with carouselPhotos`);
    
    for (let prop of withPhotos) {
      console.log(`📷 Property ${prop.data?.zpid || prop.zpid || prop._id}: ${prop.carouselPhotos?.length || 0} photos`);
    }
    
    // Check for 28207918 specifically in recent properties
    console.log('\n🔍 Checking all properties for 28207918...');
    const all = await Property.find({}).limit(20);
    for (let prop of all) {
      const zpid = prop.data?.zpid || prop.data?.property?.zpid || prop.zpid;
      if (zpid == '28207918' || zpid == 28207918) {
        console.log('✅ Found matching property!');
        console.log('📄 Property data structure:', JSON.stringify({
          _id: prop._id,
          zpid: prop.zpid,
          dataZpid: prop.data?.zpid,
          propertyZpid: prop.data?.property?.zpid,
          carouselPhotos: prop.carouselPhotos?.length || 0,
          hasData: !!prop.data
        }, null, 2));
        break;
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

checkProperties();
