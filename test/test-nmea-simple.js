const nmea = require("nmea-simple");

const rmc = nmea.parseNmeaSentence("$GPRMC,020319.00,A,3731.02528,N,07624.98166,W,0.023,0.00,201018,10.90,W,A*03");
//const packet = nmea.parseNmeaSentence("$GPRMC,020319.00,A,3731.02528,N,07624.98166,W,0.023,0.00,201018,10.90,W,A*04");

gps = {};
gps.lat = rmc.latitude;
gps.lon = rmc.longitude;
gps.magvar = rmc.variationDirection === 'E' ? rmc.variation : -rmc.variation;
gps.time = rmc.datetime;
gps.cog = rmc.trackTrue;
gps.sog = rmc.speedKnots;

console.log(rmc, rmc.datetime, gps, new Date(rmc.datetime).getTime());


