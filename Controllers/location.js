const {
  existsRegion,
  existsDistrict,
  existsSubDistrict,
  existsCommunity,
} = require('../utilities/location');

const validateRegion = async (req, res) => {
  try {
    const name = req.query.name;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name required' });
    const exists = await existsRegion(name);
    if (exists) return res.json({ exists: true, message: 'Region already exists' });
    return res.json({ exists: false });
  } catch (err) {
    console.error('validate/region', err);
    return res.status(500).json({ message: 'Validation failed' });
  }
};

const validateDistrict = async (req, res) => {
  try {
    const name = req.query.name;
    const region = req.query.region;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name required' });
    if (!region || !String(region).trim()) return res.status(400).json({ message: 'Region required' });
    const exists = await existsDistrict(name, region);
    if (exists) return res.json({ exists: true, message: 'District already exists' });
    return res.json({ exists: false });
  } catch (err) {
    console.error('validate/district', err);
    return res.status(500).json({ message: 'Validation failed' });
  }
};

const validateSubdistrict = async (req, res) => {
  try {
    const name = req.query.name;
    const district = req.query.district;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name required' });
    if (!district || !String(district).trim()) return res.status(400).json({ message: 'District required' });
    const exists = await existsSubDistrict(name, district);
    if (exists) return res.json({ exists: true, message: 'Sub-district already exists' });
    return res.json({ exists: false });
  } catch (err) {
    console.error('validate/subdistrict', err);
    return res.status(500).json({ message: 'Validation failed' });
  }
};

// GET /validate/community?name=...&district=...&subDistrict=...
// At least one of district or subDistrict must be present (subDistrict preferred)
const validateCommunity = async (req, res) => {
  try {
    const name = req.query.name;
    const district = req.query.district || null;
    const subDistrict = req.query.subDistrict || null;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Name required' });
    if (!district && !subDistrict) return res.status(400).json({ message: 'district or subDistrict required' });

    const exists = await existsCommunity(name, { districtRef: district, subDistrictRef: subDistrict });
    if (exists) return res.json({ exists: true, message: 'Community already exists' });
    return res.json({ exists: false });
  } catch (err) {
    console.error('validate/community', err);
    return res.status(500).json({ message: 'Validation failed' });
  }
};

module.exports = { validateRegion, validateDistrict, validateSubdistrict, validateCommunity };
