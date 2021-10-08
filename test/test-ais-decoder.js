//import AisDecoder from 'ais-stream-decoder';
const aisDecoder = require("ais-stream-decoder");

aisDecoder.

//const aisDecoder = new AisDecoder();
aisDecoder.on('error', err => console.error(err));
aisDecoder.on('data', decodedMessage => console.log(decodedMessage));

const nmea = '!AIVDM,1,1,,B,133i;RPP1DPEbcDMV@1r:Ow:2>`<,0*41';
aisDecoder.write(nmea);

