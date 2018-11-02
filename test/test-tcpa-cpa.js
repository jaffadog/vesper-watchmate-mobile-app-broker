"use strict";

const geolib = require('geolib');

const initialLat = 35;
const initialLon = -70;

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

var MathFunc = {
	    add : function(a, b) {
		return [ a[0] + b[0], a[1] + b[1], a[2] + b[2] ]
	    },
	    sub : function(a, b) {
		return [ a[0] - b[0], a[1] - b[1], a[2] - b[2] ]
	    },
	    mulScalar : function(a, s) {
		return [ a[0] * s, a[1] * s, a[2] * s ]
	    },
	    dot : function(a, b) {
		return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
	    },
	    lengthSquared : function(a) {
		return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]
	    }
	};

const motionpredict = require('lethexa-motionpredict').withMathFunc(MathFunc);

function formatTcpa(tcpa) {
    // returns hh:mm:ss, e.g. 01:15:23
    // 012345678901234567890
    // 1970-01-01T00:00:07.000Z
    if (tcpa === undefined) {
        return '';
    } 
    // when more than 60  mins, then format hh:mm:ss
    else if (Math.abs(tcpa)>=3600) {
        return (tcpa<0 ? '-' : '') + new Date(1000 * Math.abs(tcpa)).toISOString().substr(11,8)
    } 
    // when less than 60  mins, then format mm:ss
    else {
        return (tcpa<0 ? '-' : '') + new Date(1000 * Math.abs(tcpa)).toISOString().substr(14,5)
    }
}

function updateCpa(target) {
    if (gps.lat === undefined 
	    || gps.lon === undefined
	    || gps.sog === undefined
	    || gps.cog === undefined
	    || target.lat === undefined
	    || target.lon === undefined
	    || target.sog === undefined
	    || target.cog === undefined) {
	console.log('cant calc cpa: missing data',target.mmsi);
        target.cpa = undefined;
        target.tcpa = undefined;
	return;
    }
    
     // position: lat and lon in degrees
     // velocity: in degrees/sec N/S and E/W
    
     var position1 = [ gps.lat, gps.lon, 0 ];
     var velocity1 = generateSpeedVector(gps.lat,gps.sog,gps.cog);
    
     var position2 = [ target.lat, target.lon, 0 ];
     var velocity2 = generateSpeedVector(target.lat,target.sog,target.cog);
     
     // console.log(position1,velocity1,position2,velocity2);
    
     // returns tcpa in seconds from now
     var tcpa = motionpredict.calcCPATime(position1,velocity1,position2,velocity2);
     // console.log('tcpa (Secs)',tcpa,tcpa/60,tcpa/3600);
     
     if (!tcpa) {
         console.log('cant calc tcpa: ',target.mmsi);
         target.cpa = undefined;
         target.tcpa = undefined;
         return;
     }
    
     var cpaPosition1 = motionpredict.getPositionByVeloAndTime(position1,velocity1,tcpa);
     var cpaPosition2 = motionpredict.getPositionByVeloAndTime(position2,velocity2,tcpa);
    
     var cpa = geolib.convertUnit('sm',geolib.getDistanceSimple({
         latitude : cpaPosition1[0],
         longitude : cpaPosition1[1]
     }, {
         latitude : cpaPosition2[0],
         longitude : cpaPosition2[1]
     }));
    
     // console.log('cpa (NM)',cpa);
    
     target.cpa = cpa;
     target.tcpa = tcpa;
}

// returns speed in degrees per second
function generateSpeedVector (latitude, speed, course) {
    var northSpeed = speed * Math.cos(course * Math.PI / 180) / 60 / 3600;
    var eastSpeed = speed * Math.sin(course * Math.PI / 180) / 60 / 3600 * Math.abs(Math.sin(latitude * Math.PI / 180));
    return [northSpeed, eastSpeed, 0]
}    

function updateCpa2(target) {
    if (gps.lat === undefined 
	    || gps.lon === undefined
	    || gps.sog === undefined
	    || gps.cog === undefined
	    || target.lat === undefined
	    || target.lon === undefined
	    || target.sog === undefined
	    || target.cog === undefined) {
	console.log('cant calc cpa: missing data',target.mmsi);
        target.cpa = undefined;
        target.tcpa = undefined;
	return;
    }
    
     // position: lat and lon in meters relative to me
     // velocity: in m/s
    
     var position1 = [ 0, 0, 0 ];
     var velocity1 = generateSpeedVector2(gps.sog,gps.cog);
    
     // target lat - my lat, convert to meters
     // lat diff, lon diff, 0
     var position2 = [
    	 geolib.getDistance(
    			 {
    	    		 latitude: target.lat,
    	    		 longitude: target.lon,
    			 },
    			 {
    	    		 latitude: 0,
    	    		 longitude: target.lon,
    			 }
    	 ) - 
    	 geolib.getDistance(
    			 {
    	    		 latitude: gps.lat,
    	    		 longitude: gps.lon,
    			 },
    			 {
    	    		 latitude: 0,
    	    		 longitude: gps.lon,
    			 }
    	 ),
    	 geolib.getDistance(
    			 {
    	    		 latitude: target.lat,
    	    		 longitude: target.lon,
    			 },
    			 {
    	    		 latitude: target.lat,
    	    		 longitude: 0,
    			 }
    	 ) - 
    	 geolib.getDistance(
    			 {
    	    		 latitude: gps.lat,
    	    		 longitude: gps.lon,
    			 },
    			 {
    	    		 latitude: gps.lat,
    	    		 longitude: 0,
    			 }
    	 ),
    	 0 
     ];
     
     var velocity2 = generateSpeedVector2(target.sog,target.cog);
     
     // console.log(position1,velocity1,position2,velocity2);
    
     // returns tcpa in seconds from now
     var tcpa = motionpredict.calcCPATime(position1,velocity1,position2,velocity2);
     // console.log('tcpa (Secs)',tcpa,tcpa/60,tcpa/3600);
     
     if (!tcpa) {
         console.log('cant calc tcpa: ',target.mmsi);
         target.cpa = undefined;
         target.tcpa = undefined;
         return;
     }
    
     var cpaPosition1 = motionpredict.getPositionByVeloAndTime(position1,velocity1,tcpa);
     var cpaPosition2 = motionpredict.getPositionByVeloAndTime(position2,velocity2,tcpa);
    
     var cpa = geolib.convertUnit('sm',geolib.getDistanceSimple({
         latitude : cpaPosition1[0],
         longitude : cpaPosition1[1]
     }, {
         latitude : cpaPosition2[0],
         longitude : cpaPosition2[1]
     }));
    
     // console.log('cpa (NM)',cpa);
    
     target.cpa = cpa;
     target.tcpa = tcpa;
}

// returns speed in meters per second
// 1852 meters per NM
// 1 kn = 1852 / 3600 m/s
function generateSpeedVector2 (speed, course) {
    var northSpeed = speed * Math.cos(course * Math.PI / 180) * 1852 / 3600;
    var eastSpeed = speed * Math.sin(course * Math.PI / 180) * 1852 / 3600;
    return [northSpeed, eastSpeed, 0]
}    

var target = targets['333333333'];

updateCpa(target);
console.log('tcpa=',target.tcpa,formatTcpa(target.tcpa));
console.log('cpa=',target.cpa,'\n');

updateCpa2(target);
console.log('tcpa=',target.tcpa,formatTcpa(target.tcpa));
console.log('cpa=',target.cpa/1852,'\n');




