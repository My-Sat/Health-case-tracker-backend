#!/usr/bin/env node
// scripts/migrateCommunityField.js
// Usage:
//   node scripts/migrateCommunityField.js            # perform migration
//   node scripts/migrateCommunityField.js --dry-run  # preview only

require('dotenv').config();
const mongoose = require('mongoose');

const Community = require('./models/Community');
const District = require('./models/District');
const SubDistrict = require('./models/SubDistrict');
const HealthFacility = require('./models/HealthFacility');

const DRY_RUN = process.argv.includes('--dry-run');

async function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function main() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('MONGO_URI not set in environment. Abort.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  log('Connected to DB. dry-run:', DRY_RUN);

  const session = await mongoose.startSession();

  let migrated = 0;
  let merged = 0;
  let skipped = 0;

  try {
    // STEP A: Find communities that have subDistrict filled but district is null.
    // Those are suspicious (some of them may hold district ids in subDistrict).
    const suspectCursor = Community.find({
      $or: [{ district: { $eq: null } }, { district: { $exists: false } }],
      subDistrict: { $ne: null }
    }).cursor();

    for (let doc = await suspectCursor.next(); doc != null; doc = await suspectCursor.next()) {
      const storedId = String(doc.subDistrict);
      // 1) If subDistrict actually exists -> nothing to fix for this doc
      const subExists = await SubDistrict.findById(storedId).lean();
      if (subExists) {
        // legitimate subDistrict reference — skip
        continue;
      }

      // 2) If it's actually a District id, we'll move it to district
      const districtDoc = await District.findById(storedId).lean();
      if (!districtDoc) {
        log(`Skipping community ${doc._id} ("${doc.name}") — could not resolve id ${storedId} to SubDistrict or District`);
        skipped++;
        continue;
      }

      log(`Found misstored community ${doc._id} ("${doc.name}") — subDistrict field contains District id ${storedId}. Will move to district.`);

      if (DRY_RUN) {
        migrated++;
        continue;
      }

      // real migration: put in transaction if supported
      await session.withTransaction(async () => {
        // Check if there is an existing community with same name under that district
        const existing = await Community.findOne({ name: doc.name, district: districtDoc._id }).session(session);

        if (existing) {
          // Re-point HealthFacility references and delete duplicate doc
          log(`Merging duplicate: existing community ${existing._id} will absorb ${doc._id}`);
          await HealthFacility.updateMany({ community: doc._id }, { $set: { community: existing._id } }, { session });
          await Community.deleteOne({ _id: doc._id }, { session });
          merged++;
        } else {
          // Move pointer safely
          doc.district = districtDoc._id;
          doc.subDistrict = null;
          await doc.save({ session });
          migrated++;
        }
      }, {
        // optional transaction options
      });
    }

    // STEP B: Deduplicate any remaining duplicates across the whole table.
    // (Group by name + container (district/subDistrict); keep first, merge the rest)
    const map = new Map();

    const cursorAll = Community.find().sort({ name: 1 }).cursor();
    for (let c = await cursorAll.next(); c != null; c = await cursorAll.next()) {
      const k = `${c.name}|${c.district ? String(c.district) : 'null'}|${c.subDistrict ? String(c.subDistrict) : 'null'}`;
      if (!map.has(k)) {
        map.set(k, c._id);
        continue;
      }

      const keeperId = map.get(k);
      const duplicateId = c._id;
      log(`Duplicate detected for key=${k}. keeper=${keeperId} duplicate=${duplicateId}`);

      if (DRY_RUN) {
        merged++;
        continue;
      }

      await session.withTransaction(async () => {
        await HealthFacility.updateMany({ community: duplicateId }, { $set: { community: keeperId } }, { session });
        await Community.deleteOne({ _id: duplicateId }, { session });
      });

      merged++;
    }

    // optional: recreate index (only if you are sure duplicates are resolved).
    // NOTE: if you don't want the script to alter indexes, skip this.
    if (!DRY_RUN) {
      try {
        log('Ensuring unique index {name, district, subDistrict} (sparse) ...');
        await Community.collection.createIndex({ name: 1, district: 1, subDistrict: 1 }, { unique: true, sparse: true });
        log('Index created/ensured.');
      } catch (idxErr) {
        log('Index creation failed — check duplicates; error:', idxErr.message);
      }
    }

    log(`Done. migrated=${migrated} merged=${merged} skipped=${skipped}`);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    session.endSession();
    await mongoose.disconnect();
    log('Disconnected');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
