"use strict";

const AisEncode  = require ("ggencoder").AisEncode;
const AisDecode  = require ("ggencoder").AisDecode;
const NmeaEncode = require ("ggencoder").NmeaEncode;
const NmeaDecode = require ("ggencoder").NmeaDecode;

const initialLat = 35;
const initialLon = -70;

var gps = {
    lat: initialLat,
    lon: initialLon,
    cog: 120,
    sog: 6.1,
}

// encode NMEA message
var nmeaMsg = new NmeaEncode({ 
    // standard class B Position report
    // msgtype : 18, <== NOTE: this breaks things!
    lat        : gps.lat,
    lon        : gps.lon,
    cog        : gps.cog,
    sog        : gps.sog
}); 

console.log('encode',nmeaMsg.nmea,'\n');

var decMsg = new NmeaDecode (nmeaMsg.nmea);
console.log ('decode', decMsg,'\n');

var gps2={};

gps2.lat = decMsg.lat;
gps2.lon = decMsg.lon;
gps2.cog = decMsg.cog;
gps2.sog = decMsg.sog;

console.log('gps2',gps2);

console.log(gps2.sog *3600/1852);
console.log(decMsg.nmea[7]);

// 1 kn = 1 nm/h = 1852 m/h = 1852/3600 m/s