// scripts/migrateCommunityField.js
const mongoose = require('mongoose');
const Community = require('./models/Community');
const District = require('./models/District');
const SubDistrict = require('./models/SubDistrict');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Load all district ids for quick membership test
  const districts = await District.find().select('_id');
  const districtIds = new Set(districts.map((d) => String(d._id)));

  const cursor = Community.find().cursor();
  let fixed = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    const sd = doc.subDistrict ? String(doc.subDistrict) : null;

    // If subDistrict holds a District id, move it to district and null out subDistrict
    if (sd && districtIds.has(sd)) {
      doc.district = doc.subDistrict;
      doc.subDistrict = null;
      await doc.save();
      fixed++;
    }
  }

  console.log(`Done. Fixed ${fixed} community documents.`);
  await mongoose.disconnect();
  process.exit(0);
})();
