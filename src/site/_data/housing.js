const {AssetCache} = require('@11ty/eleventy-fetch');
const Airtable = require('airtable');

// Safely get Airtable connection, return null if credentials missing
let base;
try {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
    console.warn('Airtable credentials missing, returning empty housing data');
    module.exports = async function() {
      return {filterValues: [], housingList: []};
    };
    return;
  }
  base = new Airtable({apiKey: process.env.AIRTABLE_API_KEY}).base(process.env.AIRTABLE_BASE_ID);
} catch (err) {
  console.warn('Could not connect to Airtable:', err.message);
  module.exports = async function() {
    return {filterValues: [], housingList: []};
  };
  return;
}

const UNITS_TABLE = 'tblF0P0q13bQic3Mj';
const HOUSING_DATABASE_TABLE = 'tblWiMFZEiscWmNfQ';
const HIGH_CAPACITY_UNIT = 4;

function FilterSection(heading, name, options) {
  this.heading = heading;
  this.name = name;
  this.options = options;
}

function FilterCheckbox(name, label, selected) {
  this.name = name;
  this.label = label || name;
  this.selected = selected || false;
}

// Safe get - returns value or default if field doesn't exist
const safeGet = (record, field, defaultValue = null) => {
  try {
    return record.get(field) || defaultValue;
  } catch (err) {
    return defaultValue;
  }
};

const fetchApartmentRecords = async () => {
  const apartments = [];
  try {
    const table = base(HOUSING_DATABASE_TABLE);
    const records = await table.select().all();
    
    records.forEach(function(record) {
      const units = safeGet(record, 'UNITS');
      const publishStatus = safeGet(record, 'PUBLISH_STATUS');
      
      // Only include if has units and is published
      if (units && publishStatus == 'Published') {
        apartments.push({
          id: safeGet(record, 'DISPLAY_ID'),
          aptName: safeGet(record, 'APT_NAME', 'Unnamed Property'),
          addresses: [safeGet(record, 'ADDRESS'), safeGet(record, 'SECOND_ADDRESS')].filter(a => a),
          city: safeGet(record, 'CITY'),
          locCoords: safeGet(record, 'LOC_COORDS'),
          verifiedLocCoords: safeGet(record, 'VERIFIED_LOC_COORDS'),
          phones: [safeGet(record, 'PHONE'), safeGet(record, 'SECOND_PHONE')].filter(p => p),
          website: safeGet(record, 'PROPERTY_URL'),
          supplementalUrls: [1,2,3,4].map(n => safeGet(record, `SUPPLEMENTAL_URL_${n}`)).filter(u => u),
          emails: [safeGet(record, 'EMAIL'), safeGet(record, 'SECOND_EMAIL')].filter(e => e),
          numTotalUnits: safeGet(record, 'NUM_TOTAL_UNITS'),
          populationsServed: safeGet(record, 'POPULATIONS_SERVED', []),
          minAge: safeGet(record, 'MIN_RESIDENT_AGE'),
          maxAge: safeGet(record, 'MAX_RESIDENT_AGE'),
          disallowsPublicApps: safeGet(record, 'DISALLOWS_PUBLIC_APPLICATIONS'),
          hasWheelchairAccessibleUnits: safeGet(record, 'HAS_WHEELCHAIR_ACCESSIBLE_UNITS'),
          prefersLocalApplicants: safeGet(record, 'PREFERS_LOCAL_APPLICANTS'),
        });
      }
    });
  } catch (err) {
    console.error('Error fetching apartment records:', err.message);
  }
  return apartments;
};

const fetchUnitRecords = async () => {
  const units = [];
  try {
    const table = base(UNITS_TABLE);
    const records = await table.select().all();
    
    records.forEach(function(record) {
      units.push({
        parent_id: safeGet(record, '_DISPLAY_ID')?.[0],
        type: safeGet(record, 'TYPE'),
        openStatus: safeGet(record, 'STATUS'),
        occupancyGroup: `${safeGet(record, 'MIN_OCCUPANCY', 0)},${safeGet(record, 'MAX_OCCUPANCY', 0)}`,
        occupancyLimit: {
          min: safeGet(record, 'MIN_OCCUPANCY'),
          max: safeGet(record, 'MAX_OCCUPANCY'),
        },
        incomeBracket: safeGet(record, 'PERCENT_AMI'),
        rent: {
          amount: safeGet(record, 'RENT_PER_MONTH_USD'),
          alternateDesc: safeGet(record, 'ALTERNATE_RENT_DESCRIPTION'),
        },
        minIncome: {
          amount: safeGet(record, 'MIN_YEARLY_INCOME_USD'),
          isCalculated: !safeGet(record, 'OVERRIDE_MIN_YEARLY_INCOME_USD'),
          rentFactor: safeGet(record, 'MIN_INCOME_RENT_FACTOR'),
        },
        maxIncome: {
          low: safeGet(record, 'MAX_YEARLY_INCOME_LOW_USD'),
          high: safeGet(record, 'MAX_YEARLY_INCOME_HIGH_USD'),
          byHouseholdSize: Object.fromEntries([1,2,3,4,5,6,7,8,9,10,11,12].map(
            n => [`size${n}`, safeGet(record, `MAX_YEARLY_INCOME_HH_${n}_USD`)])),
        },
      });
    });
  } catch (err) {
    console.error('Error fetching unit records:', err.message);
  }
  return units;
};

const housingData = async () => {
  console.log('Fetching apartment and units data.');
  try {
    const [apartments, units] = await Promise.all([fetchApartmentRecords(), fetchUnitRecords()]);
    console.log(`got ${apartments.length} apartments and ${units.length} units.`);
    
    for (const apartment of apartments) {
      apartment.units = units.filter((u) => u.parent_id === apartment.id);
    }
    
    return apartments.sort((a, b) => {
      const nameA = (a.aptName || '').toLowerCase();
      const nameB = (b.aptName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  } catch (err) {
    console.error('Error in housingData:', err.message);
    return [];
  }
};

const filterOptions = (housing) => {
  const cities = [...new Set(housing.map((h) => h.city).filter((c) => c))];
  const openStatuses = [...new Set(housing.map((h) => h.units.map((u) => u.openStatus)).flat().filter((s) => s))];
  const unitTypes = [...new Set(housing.map((h) => h.units.map((u) => u.type)).flat().filter((t) => t))];
  const allPopulationsServed = [...new Set(housing.map((h) => h.populationsServed).flat().filter((p) => p))];

  const filterVals = [];
  
  if (cities.length) {
    filterVals.push(new FilterSection('City', 'city', cities.map((x) => new FilterCheckbox(x))));
  }
  
  if (unitTypes.length) {
    const unitTypeOptions = unitTypes.map((x) => new FilterCheckbox(x));
    filterVals.push(new FilterSection('Type of Unit', 'unitType', unitTypeOptions));
  }
  
  if (openStatuses.length) {
    filterVals.push(new FilterSection('Availability', 'availability', openStatuses.map((x) => new FilterCheckbox(x))));
  }
  
  if (allPopulationsServed.length) {
    filterVals.push(new FilterSection('Populations Served', 'populationsServed', allPopulationsServed.map((x) => new FilterCheckbox(x))));
  }

  return filterVals;
};

module.exports = async function() {
  try {
    const asset = new AssetCache('affordable_housing_data');
    let cacheDuration = '1h';
    
    if (process.env.ELEVENTY_SERVERLESS) {
      asset.cacheDirectory = 'cache';
      cacheDuration = '*';
    }
    
    if (asset.isCacheValid(cacheDuration)) {
      console.log('Returning cached housing and filter data.');
      return await asset.getCachedValue();
    }

    const housing = await housingData();
    const filterVals = filterOptions(housing);
    const data = {filterValues: filterVals, housingList: housing};
    
    await asset.save(data, 'json');
    return data;
  } catch (err) {
    console.error('Fatal error in housing data module:', err.message);
    return {filterValues: [], housingList: []};
  }
};
