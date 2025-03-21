const fs = require('fs').promises;
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

// Define local file paths for the St. Louis GTFS‑realtime data.
const LOCAL_PATHS = {
  vehicles: './StlRealTimeVehicles.pb',
  trips: './StlRealTimeTrips.pb',
  alerts: './StlRealTimeAlerts.pb',
};

const fetchLocalStlTransitData = async () => {
  // Read local .pb files concurrently.
  const [vehiclesBuffer, tripsBuffer, alertsBuffer] = await Promise.all([
    fs.readFile(LOCAL_PATHS.vehicles),
    fs.readFile(LOCAL_PATHS.trips),
    fs.readFile(LOCAL_PATHS.alerts),
  ]);

  // Decode the protocol buffer messages.
  const vehiclesFeed = GtfsRealtimeBindings.FeedMessage.decode(vehiclesBuffer);
  const tripsFeed = GtfsRealtimeBindings.FeedMessage.decode(tripsBuffer);
  const alertsFeed = GtfsRealtimeBindings.FeedMessage.decode(alertsBuffer);

  // Example: Extract a list of vehicles with their id, location, and timestamp.
  const vehiclesData = vehiclesFeed.entity
    .filter(entity => entity.vehicle)
    .map(entity => ({
      id: entity.vehicle.vehicle.id,
      lat: entity.vehicle.position.latitude,
      lng: entity.vehicle.position.longitude,
      bearing: entity.vehicle.position.bearing,
      timestamp: entity.vehicle.timestamp,
    }));

  // Return the processed data. Further processing for trips and alerts can be added as needed.
  return {
    vehiclesData,
    tripsData: tripsFeed.entity,
    alertsData: alertsFeed.entity,
  };
};

module.exports = async function() {
  const transitData = await fetchLocalStlTransitData();
  // Return the combined transit data to be integrated into your Airtable or other database.
  return { transitData };
};
