// import GeoGate encoding/decoding NMEA/AIS methods
var NmeaEncode = require ("ggencoder").NmeaEncode;

// encode NMEA message
encMsg = new NmeaEncode({ // standard class B Position report
	//msgtype: 18,
	cog: 270,
	sog: 5,
	lon: -76.3333333333333,
	lat: 37.5555555555555,
});

console.log(encMsg);
console.log(encMsg.valid);
console.log(encMsg.nmea);

console.log(encMsg.nmea);


if (encMsg.valid) console.log(encMsg.nmea);

