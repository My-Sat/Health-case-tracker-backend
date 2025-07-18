const express = require('express');
const cors = require('cors');

const facilityRoutes = require('./routes/facilityRoute');
const caseRoutes = require('./routes/caseRoute');
const caseTypeRoutes = require('./routes/case_type_route');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', facilityRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/case-types', caseTypeRoutes);

module.exports = app;
