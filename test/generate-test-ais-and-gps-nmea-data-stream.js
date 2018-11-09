"use strict";

const AisEncode  = require ("ggencoder").AisEncode;
const NmeaEncode = require ("ggencoder").NmeaEncode;
const net = require('net');
const geolib = require('geolib');

const tcpPort = 3000;
const initialLat = 35;
const initialLon = -70;
const updateIntervalSeconds = 5;

var gps = {
	lat: initialLat,
	lon: initialLon,
	cog: 120,
	sog: 6.1,
}

var targets = {};

targets['111111111'] = {
		mmsi: '111111111',
		lat: initialLat + 10/60,
		lon: initialLon + 6/60,
		cog: 200,
		sog: 15,
}

targets['222222222'] = {
		mmsi: '222222222',
		lat: initialLat - 6/60,
		lon: initialLon - 10/60,
		cog: 90,
		sog: 10,
}

targets['333333333'] = {
		mmsi: '333333333',
		lat: initialLat + 10/60,
		lon: initialLon - 10/60,
		cog: 135,
		sog: 25,
}

// for testing
// for (var i=0; i<ii; i++) {
// for (var j=0; j<jj; j++) {
// var mmsi = (100000000+(i*ii+j)+1).toString();
// targets[mmsi] = {
// mmsi: mmsi,
// lat: (1+i/60),
// lon: (1+j/60),
// cog: 45,
// sog: 3,
// targetType: (i*ii+j),
// }
// console.log(i,j,targets[mmsi].mmsi,targets[mmsi].lat,targets[mmsi].lon);
// }
// }
// console.log(targets);

// SART/MOB/EPIRB target:
targets['970111111'] = {
		mmsi: '970111111',
		lat: initialLat + 1/60,
		lon: initialLon - 2/60,
		cog: 0,
		sog: 0,
};

var connectionNumber = 0;
var connections = [];

const tcpServer = net.createServer((connection) => {
    
    connectionNumber++;
    connection.id = connectionNumber;
    connections.push(connection);
    
    console.log(`TCP Server: new connection ${connectionNumber} ${connection.remoteAddress}:${connection.remotePort}`);
    console.log('connections',connections.length);
    
    connection.on('data', data => {
        console.log(`TCP Server: connection DATA ${connection.id} ${connection.remoteAddress}:${connection.remotePort} ${data.toString('latin1')}`);
    });

    connection.on('close', () => {
        console.log(`TCP Server: connection CLOSE ${connection.id} ${connection.remoteAddress}:${connection.remotePort}`);
        // connections.splice(connections.indexOf(connection), 1);
        console.log('connections',connections.length);
    });
    
    connection.on('end', () => {
        console.log(`TCP Server: connection END ${connection.id} ${connection.remoteAddress}:${connection.remotePort}`);
        connections.splice(connections.indexOf(connection), 1);
        console.log('connections',connections.length);
    });
    
    connection.on('error', err => {
        console.log(`****** TCP Server: connection ERROR ${connection.id}`);
        console.log(err,err.stack);
    });
    
    
});

tcpServer.on('error', (err) => {
    console.log('TCP Server: whoops!',err);
    // console.error;
    // throw err;
});

tcpServer.listen(tcpPort, () => {
    console.log(`TCP Server: listening on ${tcpServer.address().address}:${tcpServer.address().port}`);
});


function broadcast(msg) {
    try {
    	connections.map(connection => {
    		connection.write(msg);
        });
    }
    catch (err) {
        console.log('error in broadcast',err.message)
    }
}

setInterval(function(){
    console.log('start tcp xmit');
    
    updateTargetLocations();
    
    var message = '';
    
    // encode NMEA message
    var nmeaMsg = new NmeaEncode({ 
        // standard class B Position report
        // msgtype : 18, <== NOTE: this breaks things!
        lat        : gps.lat,
        lon        : gps.lon,
        cog        : gps.cog,
        sog        : gps.sog
    }); 
    
    // console.log(nmeaMsg,nmeaMsg.valid,nmeaMsg.nmea);
    if (nmeaMsg.valid) message += nmeaMsg.nmea + '\n';

    for (var mmsi in targets) {
        var target = targets[mmsi];

        // encode AIS message
        var encMsg = new AisEncode({
            aistype    : 3,
            mmsi       : target.mmsi,
            lat: target.lat,
            lon: target.lon,
            cog: target.cog,
            sog: target.sog,
            navstatus: target.navstatus
        }); 
        
        // console.log(encMsg,encMsg.valid,encMsg.nmea);
        if (encMsg.valid) message += encMsg.nmea + '\n';

        // encode AIS message
        var encMsg = new AisEncode ({
            aistype    : 5,
            mmsi       : target.mmsi,
            callsign: target.callsign,
            shipname: target.shipname,
            cargo: target.cargo,
        }); 
        
        // console.log(encMsg,encMsg.valid,encMsg.nmea);
        if (encMsg.valid) message += encMsg.nmea + '\n';
    }
    
    broadcast(message);
    console.log(message + '\n\n');
    
    console.log(gps);

}, updateIntervalSeconds*1000);

function updateTargetLocations() {
	updateTargetLocation(gps);

    for (var mmsi in targets) {
        var target = targets[mmsi];
    	updateTargetLocation(target);
    }
}

function updateTargetLocation(target) {
//	var dest = geolib.computeDestinationPoint(
//			target, 
//			// sog in kn - so nm per hour
//			// 3600 seconds per hour
//			// 1852 meters per nm
//			target.sog * updateIntervalSeconds/3600 * 1852, 
//			target.cog);
//	
//	//console.log(dest);
//	target.lat = dest.latitude;
//	target.lon = dest.longitude;
	
	var R = 6371e3; // metres
	var φ1 = target.lat * Math.PI / 180;
	var λ1 = target.lon * Math.PI / 180;
	
	var d = target.sog * updateIntervalSeconds/3600 * 1852;
	var brng = target.cog * Math.PI / 180;
	
	var φ2 = Math.asin( Math.sin(φ1)*Math.cos(d/R) +
            Math.cos(φ1)*Math.sin(d/R)*Math.cos(brng) );
	
	var λ2 = λ1 + Math.atan2(Math.sin(brng)*Math.sin(d/R)*Math.cos(φ1),
                 Math.cos(d/R)-Math.sin(φ1)*Math.sin(φ2));
	
	target.lat = φ2 * 180 / Math.PI;
	target.lon = λ2 * 180 / Math.PI;
	
	console.log(target);
}
