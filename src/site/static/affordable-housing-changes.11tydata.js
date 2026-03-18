const {AssetCache} = require('@11ty/eleventy-fetch');

let base;
try {
  const Airtable = require('airtable');
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    console.warn('Airtable credentials missing for housing changes');
  } else {
    base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY}).base(process.env.AIRTABLE_BASE_ID);
  }
} catch (err) {
  console.warn('Could not connect to Airtable:', err.message);
}

const HOUSING_DATABASE_SCHEMA_TABLE = 'tblfRhO6C1Pi0Ljwc';

const fetchHousingSchema = async () => {
  if (!base) {
    return {housing: {}, units: {}};
  }
  
  try {
    const table = base(HOUSING_DATABASE_SCHEMA_TABLE);
    const records = await table.select({
      fields: ['HOUSING_DATABASE_FIELDS_JSON', 'UNITS_FIELDS_JSON'],
      maxRecords: 1,
      sort: [{field: 'ID', direction: 'asc'}],
    }).all();
    
    if (records.length === 0) {
      return {housing: {}, units: {}};
    }
    
    const housingDbFields = JSON.parse(records[0].get('HOUSING_DATABASE_FIELDS_JSON'));
    const unitsFields = JSON.parse(records[0].get('UNITS_FIELDS_JSON'));
    return {
      housing: Object.fromEntries(housingDbFields.map((x) => [x.name, x])),
      units: Object.fromEntries(unitsFields.map((x) => [x.name, x])),
    };
  } catch (err) {
    console.error('Error fetching housing schema:', err.message);
    return {housing: {}, units: {}};
  }
};

module.exports = async function() {
  try {
    const asset = new AssetCache('affordable_housing_fields');
    if (asset.isCacheValid('1h')) {
      console.log('Using cached affordable housing fields.');
      return await asset.getCachedValue();
    }
    console.log('Fetching affordable housing fields.');
    const fields = await fetchHousingSchema();
    await asset.save(fields, 'json');
    return fields;
  } catch (err) {
    console.error('Error in housing fields module:', err.message);
    return {housing: {}, units: {}};
  }
};
